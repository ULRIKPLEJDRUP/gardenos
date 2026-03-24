// ---------------------------------------------------------------------------
// GardenOS – Forum Like API (E2)
// ---------------------------------------------------------------------------
// POST   /api/forum/like            → Toggle like on thread or reply
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
    const { threadId, replyId } = await request.json();
    const userId = session.user.id;

    if (!threadId && !replyId) {
      return NextResponse.json({ error: "threadId or replyId required" }, { status: 400 });
    }

    if (threadId) {
      const existing = await prisma.forumLike.findUnique({
        where: { userId_threadId: { userId, threadId } },
      });
      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        return NextResponse.json({ liked: false });
      }
      await prisma.forumLike.create({ data: { userId, threadId } });
      return NextResponse.json({ liked: true });
    }

    if (replyId) {
      const existing = await prisma.forumLike.findUnique({
        where: { userId_replyId: { userId, replyId } },
      });
      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        return NextResponse.json({ liked: false });
      }
      await prisma.forumLike.create({ data: { userId, replyId } });
      return NextResponse.json({ liked: true });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (err) {
    console.error("Forum like error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
