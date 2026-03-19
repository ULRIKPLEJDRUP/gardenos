// ---------------------------------------------------------------------------
// GardenOS – Feedback API
// ---------------------------------------------------------------------------
// GET    /api/feedback              → List user's own feedback items
// POST   /api/feedback              → Create new feedback item
// GET    /api/feedback?id=<id>      → Get single feedback with replies
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

// ── GET: List user's feedback or single item with replies ──
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const feedbackId = searchParams.get("id");

  // Single item with replies
  if (feedbackId) {
    const item = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { name: true, email: true, role: true } },
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Only allow owner or admin to view
    const isAdmin = (session.user as { role?: string }).role === "admin";
    if (item.userId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ feedback: item });
  }

  // Check if feedback is enabled for this user (admin always allowed)
  const isAdmin = (session.user as { role?: string }).role === "admin";
  const userRecord = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { feedbackEnabled: true },
  });
  const feedbackEnabled = isAdmin || !!userRecord?.feedbackEnabled;

  // List all for current user
  const items = await prisma.feedback.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { replies: true } },
    },
  });

  return NextResponse.json({ feedback: items, feedbackEnabled });
}

// ── POST: Create new feedback ──
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check that feedback is enabled for this user
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { feedbackEnabled: true },
  });

  if (!user?.feedbackEnabled) {
    const isAdmin = (session.user as { role?: string }).role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Feedback er ikke aktiveret for din konto." },
        { status: 403 },
      );
    }
  }

  let body: {
    type?: string;
    title?: string;
    description?: string;
    imageData?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, title, description, imageData } = body;

  if (!type || !title?.trim() || !description?.trim()) {
    return NextResponse.json(
      { error: "Type, titel og beskrivelse er påkrævet." },
      { status: 400 },
    );
  }

  const validTypes = ["bug", "idea", "question", "other"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Ugyldig type." },
      { status: 400 },
    );
  }

  // Limit image to 2MB base64
  if (imageData && imageData.length > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Billedet er for stort (max 2MB)." },
      { status: 400 },
    );
  }

  const item = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      type,
      title: title.trim(),
      description: description.trim(),
      imageData: imageData || null,
    },
  });

  return NextResponse.json({ ok: true, feedback: item }, { status: 201 });
}
