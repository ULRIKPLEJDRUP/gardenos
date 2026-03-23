// ---------------------------------------------------------------------------
// GardenOS – Tests: /api/auth/register route
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (vi.hoisted runs before vi.mock hoisting) ───────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    inviteCode: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock("@/app/lib/db", () => ({ prisma: mockPrisma }));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
  },
}));

// Import route handler AFTER mocks
import { POST } from "@/app/api/auth/register/route";

// ── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  } as never);
}

const VALID_INVITE = {
  id: "inv-1",
  code: "ABCD1234",
  usedById: null,
  expiresAt: null,
  createdById: "admin-1",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("/api/auth/register – POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validation ──

  it("returns 400 when email is missing", async () => {
    const req = makeRequest({ password: "longPassword", inviteCode: "ABCD1234" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("påkrævet");
  });

  it("returns 400 when password is missing", async () => {
    const req = makeRequest({ email: "a@b.com", inviteCode: "ABCD1234" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when inviteCode is missing", async () => {
    const req = makeRequest({ email: "a@b.com", password: "longPassword" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short (< 8 chars)", async () => {
    const req = makeRequest({ email: "a@b.com", password: "short", inviteCode: "ABCD1234" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("8 tegn");
  });

  // ── Invite code validation ──

  it("returns 400 for invalid invite code", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue(null);
    const req = makeRequest({
      email: "a@b.com",
      password: "longPassword",
      inviteCode: "INVALID1",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Ugyldig");
  });

  it("returns 400 for already-used invite code", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue({
      ...VALID_INVITE,
      usedById: "other-user",
    });
    const req = makeRequest({
      email: "a@b.com",
      password: "longPassword",
      inviteCode: "ABCD1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("allerede brugt");
  });

  it("returns 400 for expired invite code", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue({
      ...VALID_INVITE,
      expiresAt: new Date("2020-01-01"),
    });
    const req = makeRequest({
      email: "a@b.com",
      password: "longPassword",
      inviteCode: "ABCD1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("udløbet");
  });

  // ── Duplicate email ──

  it("returns 400 when email already exists", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue(VALID_INVITE);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

    const req = makeRequest({
      email: "existing@example.com",
      password: "longPassword",
      inviteCode: "ABCD1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("allerede");
  });

  // ── Successful registration ──

  it("creates user and returns 201 on valid registration", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue(VALID_INVITE);
    mockPrisma.user.findUnique.mockResolvedValue(null); // no existing user
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        inviteCode: {
          findUnique: vi.fn().mockResolvedValue({ ...VALID_INVITE }),
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          create: vi.fn().mockResolvedValue({ id: "new-user" }),
        },
      };
      return fn(tx);
    });

    const req = makeRequest({
      email: "  New@Example.COM  ",
      password: "strongPassword123",
      name: " Gartner Ole ",
      inviteCode: "abcd1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain("oprettet");
  });

  it("normalizes email to lowercase", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue(VALID_INVITE);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const mockCreate = vi.fn().mockResolvedValue({ id: "new-user" });
      const tx = {
        inviteCode: {
          findUnique: vi.fn().mockResolvedValue({ ...VALID_INVITE }),
          update: vi.fn().mockResolvedValue({}),
        },
        user: { create: mockCreate },
      };
      await fn(tx);
      // Verify the email was normalized
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "test@example.com",
          }),
        }),
      );
    });

    const req = makeRequest({
      email: "TEST@EXAMPLE.COM",
      password: "strongPassword123",
      inviteCode: "ABCD1234",
    });
    await POST(req);
  });

  // ── Race condition handling ──

  it("handles race condition when invite is used during transaction", async () => {
    mockPrisma.inviteCode.findUnique.mockResolvedValue(VALID_INVITE);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        inviteCode: {
          findUnique: vi.fn().mockResolvedValue({
            ...VALID_INVITE,
            usedById: "race-winner",
          }),
        },
        user: { create: vi.fn() },
      };
      return fn(tx);
    });

    const req = makeRequest({
      email: "racer@example.com",
      password: "strongPassword123",
      inviteCode: "ABCD1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("allerede brugt");
  });

  // ── Server error handling ──

  it("returns 500 on unexpected error", async () => {
    mockPrisma.inviteCode.findUnique.mockRejectedValue(new Error("DB down"));

    const req = makeRequest({
      email: "a@b.com",
      password: "longPassword",
      inviteCode: "ABCD1234",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Prøv igen");
  });
});
