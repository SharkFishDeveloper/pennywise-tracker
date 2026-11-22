import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
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

  try {
    const rows = await query("SELECT id, password_hash FROM users WHERE email = ?", [email]);
    const row = rows[0];
    if (!row || !(await verifyPassword(password, String(row.password_hash)))) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await createSession(String(row.id));
    return NextResponse.json({ email });
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
