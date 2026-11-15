import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import runtime from "../electron/backend-runtime.cjs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sidecar = process.argv[2] === "--sidecar" ? path.resolve(process.argv[3]) : null;
const python = sidecar || process.env.ASTROTIP_PYTHON || runtime.venvPython(root);
const isBundledSidecar = Boolean(sidecar) || /^astrotip-backend(?:\.exe)?$/.test(path.basename(python));
const scratch = await mkdtemp(path.join(os.tmpdir(), "astrolife-proof-"));
const proofHistory = path.join(scratch, "history.sqlite3");
const backend = spawn(python, isBundledSidecar ? [] : ["-m", "astrotip.bridge.service"], {
  cwd: isBundledSidecar ? scratch : path.join(root, "software"),
  windowsHide: true,
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, ASTROTIP_HISTORY_PATH: proofHistory },
});

const lines = createInterface({ input: backend.stdout });
let nextId = 1;
const pending = new Map();
const exited = new Promise((resolve) => { backend.once("exit", resolve); backend.once("error", () => resolve(-1)); });
function fail(error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}
backend.on("error", fail);
backend.on("exit", (code) => fail(new Error(`Backend exited (${code})`)));
backend.stdin.on("error", fail);

lines.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { fail(new Error(`Invalid bridge output: ${line}`)); return; }
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
    }, isBundledSidecar ? 60000 : 10000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    backend.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

try {
  const ping = await call("system.ping");
  const config = await call("system.config");
  assert.ok(config.missions.mars);
  await call("knowledge.get");
  await call("ports.list");
  await call("nasa.radlab.get", { refresh: false });
  const assessment = await call("health.assess", { heart_rate: 72, spo2: 98 });
  if (ping.protocol !== 2 || !assessment.assessment_id || assessment.checkin.heart_rate !== 72) {
    throw new Error("Unexpected bridge proof response");
  }
  await call("health.save", { assessment_id: assessment.assessment_id });
  assert.equal((await call("history.list")).entries.length, 1);
  await call("history.trends");
  assert.equal((await call("sensor.simulate")).source, "simulated");
  await call("sensor.disconnect");
  await call("system.shutdown");
  backend.stdin.end();
  assert.equal(await exited, 0);
  console.log("Bridge proof OK: protocol, NASA resources, serial enumeration, assessment, SQLite history, trends and simulated sensor.");
} finally {
  if (backend.exitCode === null) backend.kill();
  await exited;
  lines.close();
  await rm(scratch, { recursive: true, force: true });
}
