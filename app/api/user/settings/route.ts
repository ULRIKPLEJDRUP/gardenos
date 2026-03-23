// ---------------------------------------------------------------------------
// GardenOS – User Settings API
// ---------------------------------------------------------------------------
// GET  /api/user/settings    → Get current user profile
// PUT  /api/user/settings    → Update password / name
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

// ── GET: Get user profile ──
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Bruger ikke fundet" }, { status: 404 });
  }

  return NextResponse.json({ user });
}

// ── PUT: Update password or name ──
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    action: "change-password" | "change-name";
    currentPassword?: string;
    newPassword?: string;
    name?: string;
  };

  if (body.action === "change-password") {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Nuværende og nyt kodeord er påkrævet." },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Nyt kodeord skal være mindst 8 tegn." },
        { status: 400 },
      );
    }

    // Fetch current hash
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    if (!user?.password) {
      return NextResponse.json(
        { error: "Bruger ikke fundet." },
        { status: 404 },
      );
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Nuværende kodeord er forkert." },
        { status: 403 },
      );
    }

    // Hash and save
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashed },
    });

    return NextResponse.json({ ok: true, message: "Kodeord opdateret." });
  }

  if (body.action === "change-name") {
    const { name } = body;
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Navn må ikke være tomt." },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: name.trim() },
    });

    return NextResponse.json({ ok: true, message: "Navn opdateret." });
  }

  return NextResponse.json(
    { error: "Ukendt handling." },
    { status: 400 },
  );
}
