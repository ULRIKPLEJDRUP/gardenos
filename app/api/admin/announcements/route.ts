import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

// ─── GET: List active announcements ───
export async function GET() {
  try {
    const announcements = await prisma.announcement.findMany({
      where: {
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return NextResponse.json(announcements);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

function isAdmin(session: { user?: { role?: string } } | null): boolean {
  return session?.user != null && (session.user as { role?: string }).role === "admin";
}

// ─── POST: Create announcement (admin only) ───
export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { email: session!.user!.email! } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { message, type = "info", expiresInHours } = body as {
    message?: string;
    type?: string;
    expiresInHours?: number;
  };

  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600_000) : null;

  const announcement = await prisma.announcement.create({
    data: {
      message: message.trim(),
      type,
      expiresAt,
      createdById: user.id,
    },
  });

  return NextResponse.json(announcement, { status: 201 });
}

// ─── DELETE: Deactivate announcement (admin only) ───
export async function DELETE(req: Request) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.announcement.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
