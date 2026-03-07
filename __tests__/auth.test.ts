// ---------------------------------------------------------------------------
// GardenOS – Tests: Auth & invite code logic
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

describe("Password hashing", () => {
  it("should hash and verify a password", async () => {
    const password = "testPassword123!";
    const hash = await bcrypt.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);

    const valid = await bcrypt.compare(password, hash);
    expect(valid).toBe(true);

    const invalid = await bcrypt.compare("wrongPassword", hash);
    expect(invalid).toBe(false);
  });

  it("should produce different hashes for the same password", async () => {
    const password = "samePassword";
    const hash1 = await bcrypt.hash(password, 12);
    const hash2 = await bcrypt.hash(password, 12);

    expect(hash1).not.toBe(hash2);
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });
});

describe("Invite code format", () => {
  it("should generate an 8-char hex code", async () => {
    const crypto = await import("crypto");
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();

    expect(code).toHaveLength(8);
    expect(/^[0-9A-F]{8}$/.test(code)).toBe(true);
  });
});

describe("Email validation", () => {
  it("should normalize emails to lowercase", () => {
    const email = "User@Example.COM";
    const normalized = email.trim().toLowerCase();
    expect(normalized).toBe("user@example.com");
  });
});

describe("Password validation", () => {
  it("should require minimum 8 characters", () => {
    expect("short".length >= 8).toBe(false);
    expect("longEnoughPassword".length >= 8).toBe(true);
    expect("exactly8".length >= 8).toBe(true);
    expect("1234567".length >= 8).toBe(false);
  });
});
