import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const python = process.env.ASTROTIP_PYTHON || path.join(root, ".venv/bin/python");
const isBundledSidecar = path.basename(python) === "astrotip-backend";
const proofHistory = path.join(os.tmpdir(), `astrotip-bridge-proof-${process.pid}.sqlite3`);
const backend = spawn(python, isBundledSidecar ? [] : ["-m", "astrotip.bridge.service"], {
  cwd: path.join(root, "software"),
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, ASTROTIP_HISTORY_PATH: proofHistory },
});

const lines = createInterface({ input: backend.stdout });
let nextId = 1;
const pending = new Map();

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.ok ? resolve(message.result) : reject(new Error(message.error?.message));
  }
});

function call(method, params = {}) {
  const id = `proof-${nextId++}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge timeout: ${method}`));
    }, isBundledSidecar ? 15000 : 5000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    backend.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

try {
  const ping = await call("system.ping");
  const assessment = await call("health.assess", { heart_rate: 72, spo2: 98 });
  if (ping.protocol !== 2 || !assessment.assessment_id || assessment.checkin.heart_rate !== 72) {
    throw new Error("Unexpected bridge proof response");
  }
  process.stdout.write(`Bridge proof OK: ${ping.service} / ${assessment.assessment.level}\n`);
  await call("system.shutdown");
  backend.stdin.end();
  await new Promise((resolve) => backend.once("exit", resolve));
  await unlink(proofHistory).catch(() => undefined);
} catch (error) {
  backend.kill();
  await unlink(proofHistory).catch(() => undefined);
  throw error;
}
