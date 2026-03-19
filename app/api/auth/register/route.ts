// ---------------------------------------------------------------------------
// GardenOS – Registration API
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, inviteCode } = body as {
      email?: string;
      password?: string;
      name?: string;
      inviteCode?: string;
    };

    // ── Validate input ──
    if (!email?.trim() || !password || !inviteCode?.trim()) {
      return NextResponse.json(
        { error: "Email, adgangskode og invitationskode er påkrævet." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Adgangskoden skal være mindst 8 tegn." },
        { status: 400 },
      );
    }

    // ── Validate invite code ──
    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode.trim().toUpperCase() },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "Ugyldig invitationskode." },
        { status: 400 },
      );
    }

    if (invite.usedById) {
      return NextResponse.json(
        { error: "Denne invitationskode er allerede brugt." },
        { status: 400 },
      );
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitationskoden er udløbet." },
        { status: 400 },
      );
    }

    // ── Check if email already exists ──
    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: "En bruger med denne email findes allerede." },
        { status: 400 },
      );
    }

    // ── Create user + mark invite as used ──
    const hashedPassword = await bcrypt.hash(password.normalize("NFC"), 12);

    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        name: name?.trim() || null,
        password: hashedPassword,
        role: "user",
        usedInviteId: invite.id,
      },
    });

    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedById: user.id, usedAt: new Date() },
    });

    return NextResponse.json(
      { ok: true, message: "Bruger oprettet! Du kan nu logge ind." },
      { status: 201 },
    );
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "Der opstod en fejl. Prøv igen." },
      { status: 500 },
    );
  }
}
