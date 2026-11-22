import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { query } from "./turso";

const derive = promisify(scrypt);
const COOKIE = "pennywise_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export function newUserId() {
  return randomUUID();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await derive(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readToken(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const entry = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  return entry ? entry.slice(COOKIE.length + 1) : null;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [tokenHash(token), userId, Date.now() + MAX_AGE * 1000],
  );
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function currentUser(request: Request) {
  const token = readToken(request);
  if (!token) return null;
  const rows = await query(
    "SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
    [tokenHash(token)],
  );
  const row = rows[0];
  if (!row || Number(row.expires_at) < Date.now()) return null;
  return { id: String(row.id), email: String(row.email) };
}

export async function destroySession(request: Request) {
  const token = readToken(request);
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = ?", [tokenHash(token)]);
  }
  const store = await cookies();
  store.delete(COOKIE);
}
