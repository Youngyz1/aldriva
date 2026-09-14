import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface FontConfig {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

const fontCache = new Map<string, Buffer>();

function isValidFontBinary(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  const tag = buf.toString("binary", 0, 4);
  const isTTF = buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00;
  const isOTF = tag === "OTTO";
  const isWOFF = tag === "wOFF";
  return isTTF || isOTF || isWOFF;
}

export async function loadFontFile(filename: string): Promise<Buffer> {
  if (fontCache.has(filename)) {
    return fontCache.get(filename)!;
  }

  const fontPath = join(process.cwd(), "assets", "fonts", filename);
  try {
    const buf = await readFile(fontPath);
    if (!isValidFontBinary(buf)) {
      console.warn(`[FontLoader] Binary signature invalid for ${filename}, falling back to PlusJakartaSans.`);
      return loadFallbackFont(filename.includes("Bold") ? "bold" : "regular");
    }
    fontCache.set(filename, buf);
    return buf;
  } catch (err) {
    console.warn(`[FontLoader] Failed to read font file ${filename}: ${(err as Error).message}`);
    return loadFallbackFont(filename.includes("Bold") ? "bold" : "regular");
  }
}

async function loadFallbackFont(weight: "regular" | "bold"): Promise<Buffer> {
  const fallbackName = weight === "bold" ? "PlusJakartaSans-Bold.woff" : "PlusJakartaSans-Regular.woff";
  if (fontCache.has(fallbackName)) {
    return fontCache.get(fallbackName)!;
  }
  const buf = await readFile(join(process.cwd(), "assets", "fonts", fallbackName));
  fontCache.set(fallbackName, buf);
  return buf;
}

export async function loadInvitationFonts(fontFamilies: string[] = ["Cinzel", "Playfair Display", "Montserrat", "Plus Jakarta Sans"]): Promise<FontConfig[]> {
  const fonts: FontConfig[] = [];
  const requested = new Set(fontFamilies.map((f) => f.toLowerCase().trim()));

  // Always include Plus Jakarta Sans as primary/fallback
  const [pjsRegular, pjsBold] = await Promise.all([
    loadFontFile("PlusJakartaSans-Regular.woff"),
    loadFontFile("PlusJakartaSans-Bold.woff"),
  ]);
  fonts.push(
    { name: "Plus Jakarta Sans", data: pjsRegular, weight: 400, style: "normal" },
    { name: "Plus Jakarta Sans", data: pjsBold, weight: 700, style: "normal" }
  );

  if (requested.has("cinzel") || requested.has("cinzel decorative")) {
    const [cinzelReg, cinzelBold] = await Promise.all([
      loadFontFile("Cinzel-Regular.ttf"),
      loadFontFile("Cinzel-Bold.ttf"),
    ]);
    fonts.push(
      { name: "Cinzel", data: cinzelReg, weight: 400, style: "normal" },
      { name: "Cinzel", data: cinzelBold, weight: 700, style: "normal" }
    );
  }

  if (requested.has("playfair display") || requested.has("playfair")) {
    const [pfReg, pfBold] = await Promise.all([
      loadFontFile("PlayfairDisplay-Regular.ttf"),
      loadFontFile("PlayfairDisplay-Bold.ttf"),
    ]);
    fonts.push(
      { name: "Playfair Display", data: pfReg, weight: 400, style: "normal" },
      { name: "Playfair Display", data: pfBold, weight: 700, style: "normal" }
    );
  }

  if (requested.has("montserrat")) {
    const [montReg, montBold] = await Promise.all([
      loadFontFile("Montserrat-Regular.ttf"),
      loadFontFile("Montserrat-Bold.ttf"),
    ]);
    fonts.push(
      { name: "Montserrat", data: montReg, weight: 400, style: "normal" },
      { name: "Montserrat", data: montBold, weight: 700, style: "normal" }
    );
  }

  return fonts;
}
