import { NextResponse, connection } from "next/server";
import { currentUser } from "@/lib/auth";
import { tursoConfigured } from "@/lib/turso";

export async function GET(request: Request) {
  await connection();
  if (!tursoConfigured()) return NextResponse.json({ email: null, configured: false });
  try {
    const user = await currentUser(request);
    return NextResponse.json({ email: user?.email ?? null, configured: true });
  } catch (error) {
    console.error("Auth check failed:", error);
    return NextResponse.json({ email: null, configured: true });
  }
}
