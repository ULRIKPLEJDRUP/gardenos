// ---------------------------------------------------------------------------
// GardenOS – Feedback Reply API
// ---------------------------------------------------------------------------
// POST /api/feedback/reply  → Add a reply to a feedback item
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

const db = prisma as any;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { feedbackId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { feedbackId, message } = body;
  if (!feedbackId || !message?.trim()) {
    return NextResponse.json(
      { error: "feedbackId og besked er påkrævet." },
      { status: 400 },
    );
  }

  // Check the feedback exists and user has access
  const feedback = await db.feedback.findUnique({
    where: { id: feedbackId },
    select: { userId: true },
  });

  if (!feedback) {
    return NextResponse.json({ error: "Feedback ikke fundet." }, { status: 404 });
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (feedback.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const reply = await db.feedbackReply.create({
    data: {
      feedbackId,
      userId: session.user.id,
      message: message.trim(),
    },
    include: {
      user: { select: { name: true, email: true, role: true } },
    },
  });

  // If admin replies, mark feedback as "read" if it was "new"
  if (isAdmin) {
    await db.feedback.update({
      where: { id: feedbackId },
      data: {
        status: "read",
        updatedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true, reply }, { status: 201 });
}
