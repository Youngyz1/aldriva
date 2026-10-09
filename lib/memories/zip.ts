/**
 * lib/memories/zip.ts
 *
 * Dependency-free streaming ZIP writer (stored method, no compression).
 *
 * Why hand-rolled: the repo has no zip dependency, and the Memories ZIP
 * must stream with a size cap — never buffer the whole archive in memory.
 * Stored entries + data descriptors make this single-pass: each file's
 * local header carries zeroed CRC/sizes with bit-3 set, followed by the
 * raw bytes, followed by a data descriptor. The central directory is
 * emitted at the end from sizes/CRCs tracked during the pass.
 *
 * Pure module (no I/O): the caller feeds file bytes chunk by chunk and
 * forwards yielded chunks to the HTTP response stream.
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;

/** Standard CRC-32 (IEEE 802.3), table-driven. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(chunk: Uint8Array, previous = 0): number {
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < chunk.length; i++) {
    crc = (CRC_TABLE[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipInputFile {
  /** Archive name. Sanitized by the caller (no directories escape). */
  name: string;
  /** Exact uncompressed byte length (enforced by the caller pre-pass). */
  size: number;
  /** File bytes, delivered in order. May arrive in many chunks. */
  body: AsyncIterable<Uint8Array>;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

/**
 * Streams a complete `.zip` archive for `files`.
 * Yields chunks in order; the caller must forward every chunk verbatim.
 * Throws (mid-stream) only on caller-feed failures — size caps are the
 * caller's job BEFORE invoking (see MAX_ZIP_BYTES / file-count caps in
 * the download route).
 */
export async function* streamStoredZip(
  files: ZipInputFile[]
): AsyncGenerator<Uint8Array, void, void> {
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encodeName(file.name);
    if (nameBytes.length === 0 || nameBytes.length > 0xffff) {
      throw new Error(`Unusable ZIP entry name: ${file.name}`);
    }

    // Local file header (bit 3 = data descriptor follows the data).
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    writeU32(lv, 0, LOCAL_HEADER_SIGNATURE);
    writeU16(lv, 4, 20); // version needed
    writeU16(lv, 6, 0x0008); // bit 3: data descriptor
    writeU16(lv, 8, 0); // method: stored
    writeU16(lv, 10, 0); // time (unspecified)
    writeU16(lv, 12, 0); // date (unspecified)
    writeU32(lv, 14, 0); // crc (in descriptor)
    writeU32(lv, 18, 0); // compressed size (in descriptor)
    writeU32(lv, 22, 0); // uncompressed size (in descriptor)
    writeU16(lv, 26, nameBytes.length);
    writeU16(lv, 28, 0); // extra length
    local.set(nameBytes, 30);
    yield local;
    offset += local.length;

    let crc = 0;
    let written = 0;
    for await (const chunk of file.body) {
      if (chunk.length === 0) continue;
      crc = crc32(chunk, crc);
      written += chunk.length;
      if (written > file.size) {
        throw new Error(`ZIP entry overflow: ${file.name}`);
      }
      yield chunk;
    }
    if (written !== file.size) {
      throw new Error(`ZIP entry short read: ${file.name} (${written}/${file.size})`);
    }
    offset += written;

    // Data descriptor.
    const descriptor = new Uint8Array(16);
    const dv = new DataView(descriptor.buffer);
    writeU32(dv, 0, DATA_DESCRIPTOR_SIGNATURE);
    writeU32(dv, 4, crc);
    writeU32(dv, 8, file.size);
    writeU32(dv, 12, file.size);
    yield descriptor;
    offset += descriptor.length;

    // Central directory record (deferred to the end block).
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    writeU32(cv, 0, CENTRAL_HEADER_SIGNATURE);
    writeU16(cv, 4, 20); // version made by
    writeU16(cv, 6, 20); // version needed
    writeU16(cv, 8, 0x0008);
    writeU16(cv, 10, 0);
    writeU16(cv, 12, 0);
    writeU16(cv, 14, 0);
    writeU32(cv, 16, crc);
    writeU32(cv, 20, file.size);
    writeU32(cv, 24, file.size);
    writeU16(cv, 28, nameBytes.length);
    writeU16(cv, 30, 0);
    writeU16(cv, 32, 0);
    writeU16(cv, 34, 0);
    writeU16(cv, 36, 0);
    writeU32(cv, 38, 0);
    writeU32(cv, 42, offset - (30 + nameBytes.length + file.size + 16));
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
  }

  let centralSize = 0;
  for (const record of central) {
    centralSize += record.length;
    yield record;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  writeU32(ev, 0, END_OF_CENTRAL_DIR_SIGNATURE);
  writeU16(ev, 4, 0);
  writeU16(ev, 6, 0);
  writeU16(ev, 8, central.length);
  writeU16(ev, 10, central.length);
  writeU32(ev, 12, centralSize);
  writeU32(ev, 16, offset);
  writeU16(ev, 20, 0);
  yield end;
}
