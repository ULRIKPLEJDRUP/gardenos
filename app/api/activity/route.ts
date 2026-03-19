// ---------------------------------------------------------------------------
// GardenOS – Activity Tracking API
// ---------------------------------------------------------------------------
// POST /api/activity  → Record a feature usage event for the logged-in user
//   Body: { action: string, detail?: string }
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// Rate limit: max 60 events per minute per user (in-memory, resets on deploy)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const ALLOWED_ACTIONS = new Set([
  "tab:create",
  "tab:content",
  "tab:groups",
  "tab:plants",
  "tab:view",
  "tab:scan",
  "tab:chat",
  "tab:tasks",
  "tab:conflicts",
  "tab:designs",
  "tab:climate",
  "chat:message",
  "scan:plant",
  "scan:disease",
  "scan:soil",
  "scan:weed",
  "design:save",
  "design:load",
  "feature:create",
  "feature:edit",
  "advisor:open",
  "guide:open",
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit check
  const now = Date.now();
  const rl = rateLimits.get(userId);
  if (rl && rl.resetAt > now) {
    if (rl.count >= 60) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    rl.count++;
  } else {
    rateLimits.set(userId, { count: 1, resetAt: now + 60_000 });
  }

  let body: { action?: string; detail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  // Only allow known actions (prevent abuse)
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const detail = typeof body.detail === "string" ? body.detail.slice(0, 200) : null;

  // Fire-and-forget insert (don't block the response)
  db.activityLog.create({
    data: { userId, action, detail },
  }).catch(() => {/* ignore */});

  return NextResponse.json({ ok: true });
}
