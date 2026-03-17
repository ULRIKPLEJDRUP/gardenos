// ---------------------------------------------------------------------------
// GardenOS – Data Sync API
// ---------------------------------------------------------------------------
// GET  /api/sync          → returns all user data keys + values + timestamps
// PUT  /api/sync          → upserts one or more keys
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

// Prisma adapter-based client: TS server sometimes caches stale types after
// schema changes.  `tsc --noEmit` passes; this cast silences the IDE.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// Keys eligible for server sync (garden data, NOT ephemeral UI prefs)
const SYNCABLE_KEYS = new Set([
  "layout:v1",
  "view:v1",
  "kinds:v1",
  "groups:v1",
  "hiddenKinds:v1",
  "hiddenVisKinds:v1",
  "bookmarks:v1",
  "anchors:v1",
  "scanHistory:v1",
  "kindIcons:v1",
  "conflicts:resolved:v1",
  "plants:custom:v1",
  "plants:instances:v1",
  "tasks:v1",
  "yearwheel:custom:v1",
  "yearwheel:completed:v1",
  // Intentionally excluded:
  //   chat:history:v1, chat:persona:v1  — chat is ephemeral
  //   weather:cache:v1, weather:history:v1  — location-based, re-fetched
  //   mobile:pinnedTabs:v1, sidebar:pinnedTabs:v2  — device-specific UI
  //   df:user, df:pass  — credentials, device-specific
]);

// ───────────────────────────────────────────────────────────────────────────
// GET – pull all synced data for the authenticated user
// ───────────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.userData.findMany({
    where: { userId: session.user.id },
    select: { key: true, value: true, updatedAt: true },
  });

  // Check for _reset marker (set by admin when resetting a user's account)
  const resetRow = rows.find((r: { key: string }) => r.key === "_reset");
  if (resetRow) {
    // Delete the marker so it only fires once
    await db.userData.delete({
      where: { userId_key: { userId: session.user.id, key: "_reset" } },
    });
    // Return empty data with reset flag — client will wipe localStorage
    return NextResponse.json({ data: {}, _reset: true });
  }

  const data: Record<string, { value: string; updatedAt: string }> = {};
  for (const row of rows) {
    data[row.key] = { value: row.value, updatedAt: row.updatedAt.toISOString() };
  }

  return NextResponse.json({ data });
}

// ───────────────────────────────────────────────────────────────────────────
// PUT – push changed keys  { entries: [{ key, value }] }
// ───────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { entries?: Array<{ key: string; value: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No entries" }, { status: 400 });
  }

  // Filter to only syncable keys and enforce size limits
  const MAX_VALUE_SIZE = 5 * 1024 * 1024; // 5 MB per key
  const valid = entries.filter(
    (e) =>
      typeof e.key === "string" &&
      typeof e.value === "string" &&
      SYNCABLE_KEYS.has(e.key) &&
      e.value.length <= MAX_VALUE_SIZE
  );

  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid entries" }, { status: 400 });
  }

  // Upsert all entries in a transaction
  const userId = session.user.id;

  // Verify user exists (session may reference a deleted user after DB reset)
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await db.$transaction(
      valid.map((e) =>
        db.userData.upsert({
          where: { userId_key: { userId, key: e.key } },
          create: { userId, key: e.key, value: e.value },
          update: { value: e.value },
        })
      )
    );
  } catch (err) {
    console.error("[sync] Push failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, synced: valid.length });
}

// ───────────────────────────────────────────────────────────────────────────
// POST – alias for PUT (sendBeacon always sends POST)
// ───────────────────────────────────────────────────────────────────────────
export { PUT as POST };
