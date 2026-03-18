// ---------------------------------------------------------------------------
// GardenOS – Admin: Invite User (create account + send email)
// ---------------------------------------------------------------------------
// POST /api/admin/invite-user
// Body: { email: string, name?: string }
// → Creates user with generated password, optionally sends invite email
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { sendInviteEmail } from "@/app/lib/mail";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function isAdmin(session: { user?: { role?: string } } | null): boolean {
  return (
    session?.user != null &&
    (session.user as { role?: string }).role === "admin"
  );
}

/** Generate a readable random password (10 chars, base64url) */
function generatePassword(): string {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { email, name } = body as { email?: string; name?: string };

  if (!email?.trim()) {
    return NextResponse.json(
      { error: "Email er påkrævet." },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return NextResponse.json(
      { error: "En bruger med denne email findes allerede." },
      { status: 400 },
    );
  }

  // Generate password and hash it
  const password = generatePassword();
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create the user
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: name?.trim() || null,
      password: hashedPassword,
      role: "user",
    },
  });

  // Determine login URL — prefer production URL
  const PRODUCTION_URL = "https://gardenos-nu.vercel.app";
  const origin = process.env.AUTH_URL
    || process.env.NEXTAUTH_URL
    || PRODUCTION_URL;
  const loginUrl = `${origin}/login`;

  // Try to send invite email
  const emailSent = await sendInviteEmail({
    to: normalizedEmail,
    name: name?.trim() || undefined,
    password,
    loginUrl,
  });

  return NextResponse.json(
    {
      ok: true,
      email: normalizedEmail,
      password, // returned so admin can share manually if email fails
      emailSent,
      userId: user.id,
    },
    { status: 201 },
  );
}
