import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";

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
  const pid = lines
    .slice(1)
    .map((line) => line.split(/\s+/)[1])
    .find((v) => v && /^\d+$/.test(v));

  if (!pid) return;

  // Best-effort kill.
  await run("kill", [pid]);
}

function removeDevLock() {
  const lockPath = ".next/dev/lock";
  if (existsSync(lockPath)) {
    rmSync(lockPath, { force: true });
  }
}

async function main() {
  try {
    await killPort3000();
  } catch {
    // ignore
  }

  try {
    removeDevLock();
  } catch {
    // ignore
  }

  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:raw"], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
