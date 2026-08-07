import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound-fetch guard for endpoints that retrieve an attacker-supplied URL.
 *
 * Checking `new URL(...).protocol` is not sufficient. A caller can point a
 * public hostname at 127.0.0.1 or 169.254.169.254, or serve a 302 to one after
 * the first check passes. So this module:
 *
 *   1. resolves the hostname and rejects non-public addresses BEFORE connecting,
 *   2. re-runs that check on every redirect hop (redirect: "manual"),
 *   3. caps body size and total time.
 *
 * Residual risk: DNS rebinding. We validate the address we resolve, but Node
 * re-resolves when it actually connects, so a TTL-0 record could return a
 * different address in that window. Closing it completely requires pinning the
 * connection to the validated IP via a custom agent. The window is small and
 * the checks below defeat the straightforward attacks; see the SSRF cheat sheet
 * reference in the route for the full discussion.
 */

const MAX_REDIRECTS = 3;
// 5 MB. Measured: a real GoFundMe campaign page is ~1.7 MB, so a 2 MB cap sat
// close enough to break imports on a slightly heavier page.
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Blocked IPv4 ranges as [network, prefix-length]. */
const BLOCKED_V4: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC1918 private
  ["100.64.0.0", 10], // RFC6598 carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — includes 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // RFC1918 private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // RFC1918 private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function isBlockedV4Int(addr: number): boolean {
  return BLOCKED_V4.some(([network, bits]) => {
    const net = v4ToInt(network);
    if (net === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (addr & mask) >>> 0 === (net & mask) >>> 0;
  });
}

function isBlockedV4(ip: string): boolean {
  const addr = v4ToInt(ip);
  if (addr === null) return true; // unparseable — refuse rather than allow
  return isBlockedV4Int(addr);
}

/**
 * Expands an IPv6 address to its 8 16-bit groups.
 *
 * Regex matching on the textual form is not safe here: `new URL()` normalises
 * IPv4-mapped addresses to hex, so "[::ffff:127.0.0.1]" arrives as
 * "::ffff:7f00:1". Anything that pattern-matches the dotted form alone will
 * miss it and fall through to "allowed".
 */
function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split("%")[0]; // strip zone index

  // Fold a trailing dotted-quad into two hex groups.
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = v4ToInt(dotted[2]);
    if (v4 === null) return null;
    addr = `${dotted[1]}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (s: string) =>
    s === "" ? [] : s.split(":").map((g) => parseInt(g, 16));

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : [];
  if ([...left, ...right].some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) {
    return null;
  }

  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
      : left;

  return groups.length === 8 ? groups : null;
}

function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true; // unparseable — refuse rather than allow

  const topFiveZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  const embeddedV4 = (((g[6] << 16) >>> 0) + g[7]) >>> 0;

  // ::ffff:0:0/96 IPv4-mapped — judge by the embedded IPv4 address.
  if (topFiveZero && g[5] === 0xffff) return isBlockedV4Int(embeddedV4);

  // 64:ff9b::/96 NAT64 well-known prefix.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isBlockedV4Int(embeddedV4);
  }

  if (topFiveZero && g[5] === 0) {
    // :: (unspecified) and ::1 (loopback)
    if (g[6] === 0 && g[7] <= 1) return true;
    // ::a.b.c.d deprecated IPv4-compatible form
    return isBlockedV4Int(embeddedV4);
  }

  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true; // not an IP at all — refuse
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/** Rejects the URL unless it is http(s) and resolves to a public address. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SsrfBlockedError("That is not a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("Only http and https URLs can be imported.");
  }

  // Credentials in the URL are a common way to confuse downstream parsers.
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("URLs with embedded credentials are not allowed.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // unwrap [::1]

  // A literal IP needs no DNS round-trip.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new SsrfBlockedError("That address is not publicly routable.");
    }
    return parsed;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError("Could not resolve that hostname.");
  }

  if (resolved.length === 0) {
    throw new SsrfBlockedError("Could not resolve that hostname.");
  }

  // Every resolved address must be public — a hostname with both a public and
  // a private record must not be usable to reach the private one.
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError("That hostname resolves to a non-public address.");
    }
  }

  return parsed;
}

export interface SafeFetchResult {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
}

/**
 * Fetches a caller-supplied URL, validating the destination before each hop and
 * capping body size and total duration.
 */
export async function safeFetchHtml(rawUrl: string): Promise<SafeFetchResult> {
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  let current = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      // Manual, so each Location is re-validated instead of being followed blindly.
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 AldrivaImporter/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: deadline,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SsrfBlockedError("Redirect without a destination.");
      }
      // Resolve relative redirects against the current URL, then re-validate.
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      throw new SsrfBlockedError(`Could not fetch page: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new SsrfBlockedError("URL did not return an HTML page.");
    }

    // Stream with a running byte cap so a huge or endless body cannot exhaust
    // memory — response.text() would buffer the lot.
    const reader = response.body?.getReader();
    if (!reader) throw new SsrfBlockedError("Empty response body.");

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new SsrfBlockedError("That page is too large to import.");
      }
      chunks.push(value);
    }

    return {
      body: new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
          const merged = new Uint8Array(acc.length + chunk.length);
          merged.set(acc);
          merged.set(chunk, acc.length);
          return merged;
        }, new Uint8Array())
      ),
      contentType,
      finalUrl: current.toString(),
      status: response.status,
    };
  }

  throw new SsrfBlockedError("Too many redirects.");
}
