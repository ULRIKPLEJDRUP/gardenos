// ---------------------------------------------------------------------------
// GardenOS – Admin API: Icon Bank Management
// ---------------------------------------------------------------------------
// GET    /api/admin/icon-bank          → list all icons (any status)
// PATCH  /api/admin/icon-bank          → approve/reject an icon
// DELETE /api/admin/icon-bank          → delete an icon
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Helper: check admin
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "admin") return null;
  return user;
}

// ── GET: list all icons with submitter info ──
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Adgang nægtet." }, { status: 403 });
  }

  try {
    const icons = await prisma.iconBank.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    return NextResponse.json({ icons });
  } catch (err) {
    console.error("admin icon-bank GET error:", err);
    return NextResponse.json({ error: "Fejl ved hentning." }, { status: 500 });
  }
}

// ── PATCH: approve or reject ──
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Adgang nægtet." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, status } = body as { id?: string; status?: string };

    if (!id || !status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Ugyldigt id eller status." }, { status: 400 });
    }

    const icon = await prisma.iconBank.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    return NextResponse.json({ id: icon.id, status: icon.status });
  } catch (err) {
    console.error("admin icon-bank PATCH error:", err);
    return NextResponse.json({ error: "Kunne ikke opdatere." }, { status: 500 });
  }
}

// ── DELETE: remove an icon ──
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Adgang nægtet." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Manglende id." }, { status: 400 });
    }

    await prisma.iconBank.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("admin icon-bank DELETE error:", err);
    return NextResponse.json({ error: "Kunne ikke slette." }, { status: 500 });
  }
}
