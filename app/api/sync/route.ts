import { gunzipSync, gzipSync } from "node:zlib";
import { NextResponse, connection } from "next/server";
import { currentUser } from "@/lib/auth";
import { query, tursoConfigured } from "@/lib/turso";

const COMPRESSED_LIMIT = 4_000_000;
const PLAIN_LIMIT = 25_000_000;

async function requireUser(request: Request) {
  if (!tursoConfigured()) return null;
  try {
    return await currentUser(request);
  } catch (error) {
    console.error("Session lookup failed:", error);
    return null;
  }
}

function wantsGzip(request: Request) {
  return request.headers.get("x-sync-gzip") === "1";
}

function snapshotResponse(payload: unknown, updatedAt: number, gzip: boolean) {
  if (!gzip || payload === null) return { payload, updatedAt };
  const json = JSON.stringify(payload);
  return {
    compressed: gzipSync(Buffer.from(json, "utf8")).toString("base64"),
    updatedAt,
  };
}

function parseSnapshot(json: string) {
  const value = JSON.parse(json) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid snapshot");
  }
  return value;
}

export async function GET(request: Request) {
  await connection();
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const gzip = wantsGzip(request);

  try {
    const rows = await query(
      "SELECT payload, updated_at FROM snapshots WHERE user_id = ?",
      [user.id],
    );
    const row = rows[0];
    if (!row) return NextResponse.json(snapshotResponse(null, 0, gzip));
    return NextResponse.json(
      snapshotResponse(parseSnapshot(String(row.payload)), Number(row.updated_at), gzip),
    );
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
    compressed?: string;
    updatedAt?: unknown;
  };

  let source: unknown = body.payload;
  if (typeof body.compressed === "string") {
    if (body.compressed.length > COMPRESSED_LIMIT) {
      return NextResponse.json({ error: "Snapshot is too large." }, { status: 413 });
    }
    try {
      source = parseSnapshot(gunzipSync(Buffer.from(body.compressed, "base64")).toString("utf8"));
    } catch {
      return NextResponse.json({ error: "Invalid compressed snapshot." }, { status: 400 });
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return NextResponse.json({ error: "Invalid snapshot." }, { status: 400 });
  }

  const updatedAt = typeof body.updatedAt === "number" && Number.isFinite(body.updatedAt)
    ? body.updatedAt
    : Date.now();
  const payload = JSON.stringify(source);
  if (payload.length > PLAIN_LIMIT) {
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
        ...snapshotResponse(parseSnapshot(String(current.payload)), currentAt, wantsGzip(request)),
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
