// ---------------------------------------------------------------------------
// GardenOS – Admin Feedback API
// ---------------------------------------------------------------------------
// GET    /api/admin/feedback              → List ALL feedback (all users)
// PATCH  /api/admin/feedback?id=<id>      → Update status of a feedback item
// POST   /api/admin/feedback/toggle       → Toggle feedback for a user
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

function isAdmin(session: { user?: { role?: string } } | null): boolean {
  return session?.user != null && (session.user as { role?: string }).role === "admin";
}

// ── GET: List all feedback across all users ──
export async function GET() {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { replies: true } },
    },
  });

  return NextResponse.json({ feedback: items });
}

// ── PATCH: Update feedback status ──
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const feedbackId = searchParams.get("id");
  if (!feedbackId) {
    return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const validStatuses = ["new", "read", "in-progress", "fixed", "closed"];
  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "Ugyldig status. Tilladte: " + validStatuses.join(", ") },
      { status: 400 },
    );
  }

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: { status: body.status },
  });

  return NextResponse.json({ ok: true, feedback: updated });
}
