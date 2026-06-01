// HMAC-SHA256 token for QR code URLs. The input is intentionally stable so
// printed maintenance QR stickers do not expire.
const QR_SECRET = import.meta.env.VITE_QR_SECRET || "royal-pms-default-qr-secret";

async function hmac(roomNumber: string): Promise<string> {
  const input = roomNumber.trim();
  return sign(input);
}

async function legacyAnnualHmac(roomNumber: string, year: number): Promise<string> {
  const input = `${roomNumber.trim()}:${year}`;
  return sign(input);
}

async function sign(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(QR_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
    .slice(0, 16);
}

export async function generateQRToken(roomNumber: string): Promise<string> {
  return hmac(roomNumber);
}

// Constant-time comparison prevents timing attacks.
export async function validateQRToken(token: string, roomNumber: string): Promise<boolean> {
  if (!token) return false;
  const expectedTokens = [await hmac(roomNumber)];
  const currentYear = new Date().getFullYear();
  for (let year = 2024; year <= currentYear; year++) {
    expectedTokens.push(await legacyAnnualHmac(roomNumber, year));
  }

  return expectedTokens.some((expected) => secureCompare(token, expected));
}

function secureCompare(token: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(token.padEnd(expected.length, "\0"));
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
