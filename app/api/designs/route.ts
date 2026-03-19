// ---------------------------------------------------------------------------
// GardenOS – Saved Designs API
// ---------------------------------------------------------------------------
// GET    /api/designs             → List user's saved designs
// POST   /api/designs             → Create new design (max 3)
// PATCH  /api/designs?id=<id>     → Update existing design (auto-snapshots previous version)
// DELETE /api/designs?id=<id>     → Delete a design
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

const db = prisma as any;
const DEFAULT_MAX_DESIGNS = 3;
const MAX_VERSIONS_PER_DESIGN = 5;

// ── GET: List all designs for current user ──
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [designs, userRecord] = await Promise.all([
    db.savedDesign.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        layout: true,
        plants: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { maxDesigns: true },
    }),
  ]);

  return NextResponse.json({
    designs,
    maxDesigns: userRecord?.maxDesigns ?? DEFAULT_MAX_DESIGNS,
  });
}

// ── POST: Create a new saved design ──
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get per-user limit
  const userRecord = await db.user.findUnique({
    where: { id: session.user.id },
    select: { maxDesigns: true },
  });
  const maxDesigns = userRecord?.maxDesigns ?? DEFAULT_MAX_DESIGNS;

  // Check current count
  const count = await db.savedDesign.count({
    where: { userId: session.user.id },
  });
  if (count >= maxDesigns) {
    return NextResponse.json(
      { error: `Du kan maks gemme ${maxDesigns} designs. Slet et eksisterende design først.` },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { name, layout, plants, thumbnail } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Navn er påkrævet" }, { status: 400 });
  }
  if (!layout || typeof layout !== "string") {
    return NextResponse.json({ error: "Layout data mangler" }, { status: 400 });
  }

  const design = await db.savedDesign.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      layout,
      plants: plants ?? "[]",
      thumbnail: thumbnail ?? null,
    },
  });

  return NextResponse.json(design, { status: 201 });
}

// ── PATCH: Update an existing design ──
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Mangler design id" }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.savedDesign.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  }

  const body = await request.json();
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.layout !== undefined) updateData.layout = body.layout;
  if (body.plants !== undefined) updateData.plants = body.plants;
  if (body.thumbnail !== undefined) updateData.thumbnail = body.thumbnail;

  // If layout or plants are being changed, snapshot the CURRENT version first
  const isContentChange = body.layout !== undefined || body.plants !== undefined;
  if (isContentChange) {
    // Save a snapshot of the current data before overwriting
    await db.designVersion.create({
      data: {
        designId: id,
        layout: existing.layout,
        plants: existing.plants ?? "[]",
      },
    });

    // Prune old versions – keep only the last MAX_VERSIONS_PER_DESIGN
    const allVersions = await db.designVersion.findMany({
      where: { designId: id },
      orderBy: { savedAt: "desc" },
      select: { id: true },
    });
    if (allVersions.length > MAX_VERSIONS_PER_DESIGN) {
      const idsToDelete = allVersions
        .slice(MAX_VERSIONS_PER_DESIGN)
        .map((v: { id: string }) => v.id);
      await db.designVersion.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  }

  const updated = await db.savedDesign.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

// ── DELETE: Remove a saved design ──
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Mangler design id" }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.savedDesign.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  }

  await db.savedDesign.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
