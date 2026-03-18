// ---------------------------------------------------------------------------
// GardenOS – Admin: User Management API
// ---------------------------------------------------------------------------
// DELETE /api/admin/users?id=<userId>  → Delete user + all their data
// PATCH  /api/admin/users?id=<userId>  → Reset user (clear synced data only)
// PUT    /api/admin/users              → Change user password
// GET    /api/admin/users              → List all users (for admin panel)
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

function isAdmin(session: { user?: { role?: string } } | null): boolean {
  return session?.user != null && (session.user as { role?: string }).role === "admin";
}

// ── GET: List all users ──
export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const db = prisma as any;
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      feedbackEnabled: true,
      maxDesigns: true,
      createdAt: true,
    },
  });

  // Count synced data keys per user
  const dataCounts = await db.userData.groupBy({
    by: ["userId"],
    _count: { _all: true },
  });
  const countMap = new Map(
    (dataCounts as Array<{ userId: string; _count: { _all: number } }>).map(
      (d) => [d.userId, d._count._all]
    )
  );

  const enriched = (users as Array<{ id: string; [k: string]: unknown }>).map((u) => ({
    ...u,
    dataKeys: countMap.get(u.id) ?? 0,
  }));

  return NextResponse.json({ users: enriched });
}

// ── DELETE: Remove user + all their data ──
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("id");
  if (!userId) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  // Prevent admin from deleting themselves
  if (userId === session!.user!.id) {
    return NextResponse.json(
      { error: "Du kan ikke slette dig selv." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Bruger ikke fundet." }, { status: 404 });
  }

  // Free up invite code (if user used one) so it's not orphaned
  await prisma.inviteCode.updateMany({
    where: { usedById: userId },
    data: { usedById: null, usedAt: null },
  });

  // Delete user — UserData cascades automatically (onDelete: Cascade)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true, deleted: user.email });
}

// ── PATCH: Reset user account (clear all synced data) ──
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("id");
  if (!userId) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Bruger ikke fundet." }, { status: 404 });
  }

  // Delete all synced data for this user (they keep their login)
  const db = prisma as any;
  const deleted = await db.userData.deleteMany({
    where: { userId },
  });

  // Insert a _reset marker so the client knows to wipe localStorage on next pull
  await db.userData.create({
    data: { userId, key: "_reset", value: new Date().toISOString() },
  });

  return NextResponse.json({
    ok: true,
    reset: user.email,
    keysCleared: deleted.count,
  });
}

// ── PUT: Change user password or toggle feedbackEnabled ──
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  let body: { id?: string; password?: string; feedbackEnabled?: boolean; maxDesigns?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const userId = body.id;
  if (!userId) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Bruger ikke fundet." }, { status: 404 });
  }

  // Update maxDesigns
  if (typeof body.maxDesigns === "number") {
    const clamped = Math.max(1, Math.min(20, Math.round(body.maxDesigns)));
    const db = prisma as any;
    await db.user.update({
      where: { id: userId },
      data: { maxDesigns: clamped },
    });
    return NextResponse.json({ ok: true, maxDesigns: clamped });
  }

  // Toggle feedbackEnabled
  if (typeof body.feedbackEnabled === "boolean") {
    const db = prisma as any;
    await db.user.update({
      where: { id: userId },
      data: { feedbackEnabled: body.feedbackEnabled },
    });
    return NextResponse.json({ ok: true, feedbackEnabled: body.feedbackEnabled });
  }

  // Change password
  const { password } = body;
  if (!password) {
    return NextResponse.json(
      { error: "Mangler password." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Adgangskoden skal være mindst 8 tegn." },
      { status: 400 },
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  return NextResponse.json({ ok: true, updated: user.email });
}
