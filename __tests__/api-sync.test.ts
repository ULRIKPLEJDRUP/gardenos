// ---------------------------------------------------------------------------
// GardenOS – Tests: /api/sync route (GET + PUT)
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks (vi.hoisted runs before vi.mock hoisting) ───────────────────────
const { mockAuth, mockPrisma } = vi.hoisted(() => {
  const mockAuth = vi.fn();
  const mockPrisma = {
    userData: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { mockAuth, mockPrisma };
});

vi.mock("@/auth", () => ({ auth: () => mockAuth() }));
vi.mock("@/app/lib/db", () => ({ prisma: mockPrisma }));

// Import route handlers AFTER mocks are set up
import { GET, PUT } from "@/app/api/sync/route";

// ── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(method: string, body?: unknown): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest("http://localhost/api/sync", init as never);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("/api/sync – GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns all synced data for authenticated user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const now = new Date("2025-06-01T12:00:00Z");
    mockPrisma.userData.findMany.mockResolvedValue([
      { key: "layout:v1", value: '{"features":[]}', updatedAt: now },
      { key: "tasks:v1", value: '[]', updatedAt: now },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data["layout:v1"].value).toBe('{"features":[]}');
    expect(json.data["tasks:v1"].value).toBe("[]");
    expect(json.data["layout:v1"].updatedAt).toBe("2025-06-01T12:00:00.000Z");
  });

  it("handles _reset marker: returns empty data + deletes marker", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.userData.findMany.mockResolvedValue([
      { key: "_reset", value: "1", updatedAt: new Date() },
      { key: "layout:v1", value: "{}", updatedAt: new Date() },
    ]);
    mockPrisma.userData.delete.mockResolvedValue({});

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json._reset).toBe(true);
    expect(json.data).toEqual({});
    expect(mockPrisma.userData.delete).toHaveBeenCalledWith({
      where: { userId_key: { userId: "user-1", key: "_reset" } },
    });
  });

  it("returns empty data when user has no stored data", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.userData.findMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({});
  });
});

describe("/api/sync – PUT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const req = makeRequest("PUT", { entries: [{ key: "layout:v1", value: "{}" }] });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    // Create a request with unparseable body
    const req = new NextRequest("http://localhost/api/sync", {
      method: "PUT",
      body: "not-json{{{",
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON");
  });

  it("returns 400 when entries array is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const req = makeRequest("PUT", { foo: "bar" });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No entries");
  });

  it("returns 400 when entries array is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const req = makeRequest("PUT", { entries: [] });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No entries");
  });

  it("returns 400 when all keys are non-syncable", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const req = makeRequest("PUT", {
      entries: [
        { key: "chat:history:v1", value: "[]" },
        { key: "weather:cache:v1", value: "{}" },
      ],
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No valid entries");
  });

  it("filters out non-syncable keys and syncs valid ones", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.$transaction.mockResolvedValue([]);

    const req = makeRequest("PUT", {
      entries: [
        { key: "layout:v1", value: '{"features":[]}' },
        { key: "chat:history:v1", value: "[]" }, // non-syncable
        { key: "tasks:v1", value: "[]" },
      ],
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.synced).toBe(2); // only layout + tasks
  });

  it("rejects values exceeding 5 MB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const hugeValue = "x".repeat(5 * 1024 * 1024 + 1);
    const req = makeRequest("PUT", {
      entries: [{ key: "layout:v1", value: hugeValue }],
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No valid entries");
  });

  it("returns 404 when user no longer exists in DB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "deleted-user" } });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = makeRequest("PUT", {
      entries: [{ key: "layout:v1", value: "{}" }],
    });
    const res = await PUT(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("User not found");
  });

  it("returns 500 when transaction fails", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.$transaction.mockRejectedValue(new Error("DB down"));

    const req = makeRequest("PUT", {
      entries: [{ key: "layout:v1", value: "{}" }],
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Sync failed");
  });

  it("syncs all SYNCABLE_KEYS successfully", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.$transaction.mockResolvedValue([]);

    const allKeys = [
      "layout:v1", "view:v1", "kinds:v1", "groups:v1",
      "hiddenKinds:v1", "hiddenVisKinds:v1", "bookmarks:v1",
      "anchors:v1", "scanHistory:v1", "kindIcons:v1",
      "conflicts:resolved:v1", "plants:custom:v1",
      "plants:instances:v1", "tasks:v1", "yearwheel:custom:v1",
      "yearwheel:completed:v1", "soil:profiles:v1", "soil:log:v1",
      "journal:v1",
    ];

    const entries = allKeys.map((key) => ({ key, value: "{}" }));
    const req = makeRequest("PUT", { entries });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.synced).toBe(allKeys.length);
  });
});
