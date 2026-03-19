// ---------------------------------------------------------------------------
// GardenOS – Design Version History API
// ---------------------------------------------------------------------------
// GET  /api/designs/versions?designId=<id>    → List version snapshots
// POST /api/designs/versions?versionId=<id>   → Restore a version
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

// ── GET: List version snapshots for a design ──
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const designId = searchParams.get("designId");
  if (!designId) {
    return NextResponse.json({ error: "Mangler designId" }, { status: 400 });
  }

  // Verify the design belongs to the user
  const design = await prisma.savedDesign.findUnique({ where: { id: designId } });
  if (!design || design.userId !== session.user.id) {
    return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  }

  const versions = await prisma.designVersion.findMany({
    where: { designId },
    orderBy: { savedAt: "desc" },
    select: {
      id: true,
      savedAt: true,
    },
  });

  return NextResponse.json({ versions });
}

// ── POST: Restore a version snapshot back into the parent design ──
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId");
  if (!versionId) {
    return NextResponse.json({ error: "Mangler versionId" }, { status: 400 });
  }

  // Fetch the version + its parent design
  const version = await prisma.designVersion.findUnique({
    where: { id: versionId },
    include: { design: true },
  });
  if (!version || version.design.userId !== session.user.id) {
    return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  }

  // Snapshot the CURRENT state before restoring (so user can undo the restore)
  await prisma.designVersion.create({
    data: {
      designId: version.designId,
      layout: version.design.layout,
      plants: version.design.plants ?? "[]",
    },
  });

  // Prune old versions – keep only the last 5
  const allVersions = await prisma.designVersion.findMany({
    where: { designId: version.designId },
    orderBy: { savedAt: "desc" },
    select: { id: true },
  });
  if (allVersions.length > 5) {
    const idsToDelete = allVersions
      .slice(5)
      .map((v: { id: string }) => v.id);
    await prisma.designVersion.deleteMany({
      where: { id: { in: idsToDelete } },
    });
  }

  // Restore the version's layout/plants into the design
  const updated = await prisma.savedDesign.update({
    where: { id: version.designId },
    data: {
      layout: version.layout,
      plants: version.plants,
    },
  });

  return NextResponse.json(updated);
}
