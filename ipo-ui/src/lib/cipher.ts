const ALGO = "AES-GCM";
const IV_LENGTH = 12;

function getKeyHex(): string {
  const key = process.env.NEXT_PUBLIC_API_CIPHER_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_API_CIPHER_KEY");
  return key;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  const raw = hexToBytes(hexKey);
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, ALGO, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey(getKeyHex());
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv.buffer as ArrayBuffer },
    key,
    encoded,
  );
  return bytesToHex(iv) + "." + bytesToHex(new Uint8Array(ciphertext));
}

export async function decrypt(payload: string): Promise<string> {
  const [ivHex, dataHex] = payload.split(".");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted payload");
  const key = await importKey(getKeyHex());
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(dataHex);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(decrypted);
}

export function encryptedJson(data: unknown): Promise<Response> {
  return encrypt(JSON.stringify(data)).then(
    (encrypted) =>
      new Response(JSON.stringify({ encrypted }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
}

export async function fetchEncrypted<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const body = await res.json();
  if (body.encrypted) {
    const json = await decrypt(body.encrypted);
    return JSON.parse(json) as T;
  }
  return body as T;
}
