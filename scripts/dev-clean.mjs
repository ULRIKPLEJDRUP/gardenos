import { existsSync, rmSync } from "node:fs";
import { spawn, execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// GardenOS – Dev Clean Start
// ---------------------------------------------------------------------------
// Ensures a fresh Turbopack cache on every dev start.
// This is CRITICAL because the workspace lives inside a OneDrive-synced
// folder — OneDrive's background sync conflicts with Turbopack's embedded
// key-value store (file locking / write batches), causing:
//   "Persisting failed: Another write batch or compaction is already active"
//
// Solution: Nuke the entire .next/ directory before starting.
// ---------------------------------------------------------------------------

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("close", () => resolve(out));
    child.on("error", () => resolve(out));
  });
}

async function killPort3000() {
  // Works on macOS/Linux. If lsof is unavailable, we just skip.
  const out = await run("lsof", ["-nP", "-iTCP:3000", "-sTCP:LISTEN"]);
  const lines = out.split("\n").map((l) => l.trim());
  // Skip header; PID is 2nd column.
  const pids = lines
    .slice(1)
    .map((line) => line.split(/\s+/)[1])
    .filter((v) => v && /^\d+$/.test(v));

  // Kill all processes on port 3000 (there can be multiple)
  for (const pid of [...new Set(pids)]) {
    await run("kill", ["-9", pid]);
  }
}

function nukeNextCache() {
  // distDir is now /tmp/gardenos-next (outside OneDrive), but clean it
  // on every dev start for a guaranteed fresh Turbopack state.
  const distDir = "/tmp/gardenos-next";
  if (existsSync(distDir)) {
    console.log(`🧹 Renser ${distDir} cache...`);
    rmSync(distDir, { recursive: true, force: true });
  }

  // Also clean any legacy .next/ that might still exist in the project
  if (existsSync(".next")) {
    console.log("🧹 Fjerner gammel .next/ mappe (nu ubrugt)...");
    rmSync(".next", { recursive: true, force: true });
  }
}

function ensurePrismaClient() {
  // If node_modules/.prisma/client doesn't exist, regenerate.
  // This can happen when OneDrive corrupts node_modules or after fresh installs.
  const prismaClientPath = "node_modules/.prisma/client";
  if (!existsSync(prismaClientPath)) {
    console.log("🔄 Genererer Prisma Client...");
    try {
      execSync("npx prisma generate", { stdio: "inherit" });
    } catch {
      console.warn("⚠️  Prisma generate fejlede — fortsætter alligevel");
    }
  }
}

async function main() {
  console.log("🌱 GardenOS dev server starter...\n");

  // 1. Kill anything on port 3000
  try {
    await killPort3000();
  } catch {
    // ignore
  }

  // 2. Nuke the entire .next/ cache (prevents Turbopack corruption)
  try {
    nukeNextCache();
  } catch (err) {
    console.warn("⚠️  Kunne ikke slette .next/:", err.message);
  }

  // 3. Ensure Prisma Client is generated
  try {
    ensurePrismaClient();
  } catch {
    // ignore
  }

  // 4. Start the dev server
  console.log("🚀 Starter Next.js dev server på http://localhost:3000\n");
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:raw"], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
