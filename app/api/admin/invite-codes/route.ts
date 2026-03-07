// ---------------------------------------------------------------------------
// GardenOS – Admin: Invite Code Management API
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import crypto from "crypto";

function generateCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // 8-char hex
}

// ── GET: List all invite codes (admin only) ──
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const codes = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usedBy: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json({ codes });
}

// ── POST: Create new invite code (admin only) ──
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { count = 1, expiresInDays } = body as {
    count?: number;
    expiresInDays?: number;
  };

  const numCodes = Math.min(Math.max(1, count), 20); // max 20 at a time
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000)
    : null;

  const created = [];
  for (let i = 0; i < numCodes; i++) {
    const code = await prisma.inviteCode.create({
      data: {
        code: generateCode(),
        createdById: session.user.id,
        expiresAt,
      },
    });
    created.push(code);
  }

  return NextResponse.json({ created }, { status: 201 });
}

// ── DELETE: Revoke an unused invite code (admin only) ──
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const codeId = searchParams.get("id");

  if (!codeId) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  const invite = await prisma.inviteCode.findUnique({ where: { id: codeId } });
  if (!invite) {
    return NextResponse.json({ error: "Kode ikke fundet." }, { status: 404 });
  }
  if (invite.usedById) {
    return NextResponse.json(
      { error: "Kan ikke slette en brugt kode." },
      { status: 400 },
    );
  }

  await prisma.inviteCode.delete({ where: { id: codeId } });

  return NextResponse.json({ ok: true });
}
