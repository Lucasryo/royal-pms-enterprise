// HMAC-SHA256 token for QR code URLs — prevents room number enumeration
// Set VITE_QR_SECRET in .env for a custom secret; falls back to a default.
// Token rotates annually (YYYY included in HMAC input) — no reprinting needed.
const QR_SECRET = import.meta.env.VITE_QR_SECRET || "royal-pms-default-qr-secret";

async function hmac(roomNumber: string): Promise<string> {
  const year  = new Date().getFullYear().toString(); // rotação anual
  const input = `${roomNumber}:${year}`;
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

// 1C: constant-time comparison — prevents timing attacks
export async function validateQRToken(token: string, roomNumber: string): Promise<boolean> {
  if (!token) return false;
  const expected = await hmac(roomNumber);
  const enc = new TextEncoder();
  const a = enc.encode(token.padEnd(expected.length, "\0"));
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
