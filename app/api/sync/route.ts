import { NextResponse, connection } from "next/server";
import { currentUser } from "@/lib/auth";
import { query, tursoConfigured } from "@/lib/turso";

async function requireUser(request: Request) {
  if (!tursoConfigured()) return null;
  try {
    return await currentUser(request);
  } catch (error) {
    console.error("Session lookup failed:", error);
    return null;
  }
}

export async function GET(request: Request) {
  await connection();
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const rows = await query(
      "SELECT payload, updated_at FROM snapshots WHERE user_id = ?",
      [user.id],
    );
    const row = rows[0];
    if (!row) return NextResponse.json({ payload: null, updatedAt: 0 });
    return NextResponse.json({
      payload: JSON.parse(String(row.payload)),
      updatedAt: Number(row.updated_at),
    });
  } catch (error) {
    console.error("Sync read failed:", error);
    return NextResponse.json({ error: "Could not load the cloud snapshot." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    payload?: unknown;
    updatedAt?: unknown;
  };
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return NextResponse.json({ error: "Invalid snapshot." }, { status: 400 });
  }
  const updatedAt = typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
    ? body.updatedAt
    : Date.now();
  const payload = JSON.stringify(body.payload);
  if (payload.length > 25_000_000) {
    return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
  }

  try {
    const rows = await query(
      "SELECT payload, updated_at FROM snapshots WHERE user_id = ?",
      [user.id],
    );
    const current = rows[0];
    const currentAt = current ? Number(current.updated_at) : 0;
    if (current && String(current.payload) === payload) {
      return NextResponse.json({ ok: true, updatedAt: currentAt });
    }
    if (current && updatedAt <= currentAt) {
      return NextResponse.json({
        ok: false,
        payload: JSON.parse(String(current.payload)),
        updatedAt: currentAt,
      });
    }

    await query(
      "INSERT INTO snapshots (user_id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      [user.id, payload, updatedAt],
    );
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    console.error("Sync write failed:", error);
    return NextResponse.json({ error: "Could not save the cloud snapshot." }, { status: 500 });
  }
}
