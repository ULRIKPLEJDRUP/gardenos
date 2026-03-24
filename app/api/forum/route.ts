// ---------------------------------------------------------------------------
// GardenOS – Forum API (E2)
// ---------------------------------------------------------------------------
// GET    /api/forum                 → List threads (with pagination/filter)
// POST   /api/forum                 → Create new thread
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

const CATEGORIES = ["general", "bed-design", "pests", "harvest", "varieties", "tips"] as const;
const PAGE_SIZE = 20;

// ── GET: List threads ──
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const search = searchParams.get("q")?.trim();
  const threadId = searchParams.get("id");

  // Single thread with replies
  if (threadId) {
    const thread = await prisma.forumThread.findUnique({
      where: { id: threadId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
            likes: { select: { userId: true } },
          },
        },
        likes: { select: { userId: true } },
        _count: { select: { replies: true, likes: true } },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(thread);
  }

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (category && CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    where.category = category;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { body: { contains: search, mode: "insensitive" } },
    ];
  }

  const [threads, total] = await Promise.all([
    prisma.forumThread.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true, likes: true } },
      },
    }),
    prisma.forumThread.count({ where }),
  ]);

  return NextResponse.json({ threads, total, page, pageSize: PAGE_SIZE });
}

// ── POST: Create thread ──
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, body, category, imageData } = await request.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "Title and body are required" }, { status: 400 });
    }

    const cat = CATEGORIES.includes(category) ? category : "general";

    const thread = await prisma.forumThread.create({
      data: {
        userId: session.user.id,
        title: title.trim().slice(0, 200),
        body: body.trim().slice(0, 10000),
        category: cat,
        imageData: imageData?.slice(0, 500_000) || null, // limit ~375KB
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { replies: true, likes: true } },
      },
    });

    return NextResponse.json(thread, { status: 201 });
  } catch (err) {
    console.error("Forum create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
