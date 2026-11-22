import { NextResponse } from "next/server";
import { createSession, hashPassword, newUserId } from "@/lib/auth";
import { query, tursoConfigured } from "@/lib/turso";

export async function POST(request: Request) {
  if (!tursoConfigured()) {
    return NextResponse.json({ error: "Cloud saving is not configured yet." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 8-128 characters." }, { status: 400 });
  }

  try {
    const existing = await query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    const id = newUserId();
    await query(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [id, email, await hashPassword(password), Date.now()],
    );
    await createSession(id);
    return NextResponse.json({ email });
  } catch (error) {
    console.error("Signup failed:", error);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
