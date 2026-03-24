// ---------------------------------------------------------------------------
// GardenOS – Forum Replies API (E2)
// ---------------------------------------------------------------------------
// POST   /api/forum/reply           → Create a reply to a thread
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { threadId, body, imageData } = await request.json();

    if (!threadId || !body?.trim()) {
      return NextResponse.json({ error: "threadId and body are required" }, { status: 400 });
    }

    // Check thread exists and is not locked
    const thread = await prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (thread.locked) {
      return NextResponse.json({ error: "Thread is locked" }, { status: 403 });
    }

    const reply = await prisma.forumReply.create({
      data: {
        threadId,
        userId: session.user.id,
        body: body.trim().slice(0, 5000),
        imageData: imageData?.slice(0, 500_000) || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        likes: { select: { userId: true } },
      },
    });

    // Touch thread updatedAt
    await prisma.forumThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(reply, { status: 201 });
  } catch (err) {
    console.error("Forum reply error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
