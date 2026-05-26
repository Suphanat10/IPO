import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!storedHash) return false;

  const [prefix, salt, hash] = storedHash.split(":");
  if (prefix !== HASH_PREFIX || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
