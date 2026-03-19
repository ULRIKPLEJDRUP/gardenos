// ---------------------------------------------------------------------------
// GardenOS – Admin: User Activity API
// ---------------------------------------------------------------------------
// GET /api/admin/activity         → Activity summary per user (last 30 days)
// GET /api/admin/activity?id=xyz  → Detailed activity for one user
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

function isAdmin(session: { user?: { role?: string } } | null): boolean {
  return session?.user != null && (session.user as { role?: string }).role === "admin";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("id");

  // ── Single user detail view ──
  if (userId) {
    const logs = await prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ logs });
  }

  // ── Summary for all users (last 30 days) ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get all users with their lastLoginAt
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // Get activity counts grouped by userId + action for last 30 days
  const activityCounts = await prisma.activityLog.groupBy({
    by: ["userId", "action"],
    where: { createdAt: { gte: thirtyDaysAgo } },
    _count: { _all: true },
  });

  // Get total login count (all time) per user
  const loginCounts = await prisma.activityLog.groupBy({
    by: ["userId"],
    where: { action: "login" },
    _count: { _all: true },
  });

  // Get last activity timestamp per user
  const lastActivities = await prisma.activityLog.groupBy({
    by: ["userId"],
    _max: { createdAt: true },
  });

  // Build lookup maps
  const loginCountMap = new Map(
    (loginCounts as Array<{ userId: string; _count: { _all: number } }>).map(
      (r) => [r.userId, r._count._all]
    )
  );

  const lastActivityMap = new Map(
    (lastActivities as Array<{ userId: string; _max: { createdAt: Date } }>).map(
      (r) => [r.userId, r._max.createdAt]
    )
  );

  // Build per-user action summary
  const userActions = new Map<string, Record<string, number>>();
  for (const row of activityCounts as Array<{ userId: string; action: string; _count: { _all: number } }>) {
    const existing = userActions.get(row.userId) ?? {};
    existing[row.action] = row._count._all;
    userActions.set(row.userId, existing);
  }

  const enriched = (users as Array<{
    id: string;
    email: string;
    name: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  }>).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastActivity: lastActivityMap.get(u.id)?.toISOString() ?? null,
    totalLogins: loginCountMap.get(u.id) ?? 0,
    createdAt: u.createdAt.toISOString(),
    actions: userActions.get(u.id) ?? {},
  }));

  return NextResponse.json({ users: enriched });
}
