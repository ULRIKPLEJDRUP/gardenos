// ---------------------------------------------------------------------------
// GardenOS – API: Icon Bank (user-facing)
// ---------------------------------------------------------------------------
// GET  /api/icon-bank          → list approved icons (all users)
// POST /api/icon-bank          → submit a generated icon (any logged-in user)
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// ── GET: Fetch all approved icons ──
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
    }

    const icons = await prisma.iconBank.findMany({
      where: { status: "approved" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        imageData: true,
        prompt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ icons });
  } catch (err) {
    console.error("icon-bank GET error:", err);
    return NextResponse.json({ error: "Kunne ikke hente ikoner." }, { status: 500 });
  }
}

// ── POST: Submit a generated icon to the bank ──
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
    }

    const body = await request.json();
    const { imageData, prompt } = body as { imageData?: string; prompt?: string };

    if (!imageData?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Ugyldigt billeddata." }, { status: 400 });
    }

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Beskrivelse mangler." }, { status: 400 });
    }

    const icon = await prisma.iconBank.create({
      data: {
        imageData,
        prompt: prompt.trim(),
        submittedBy: session.user.id,
      },
    });

    return NextResponse.json({
      id: icon.id,
      status: icon.status,
      message: "Ikon indsendt til godkendelse!",
    });
  } catch (err) {
    console.error("icon-bank POST error:", err);
    return NextResponse.json({ error: "Kunne ikke gemme ikon." }, { status: 500 });
  }
}
