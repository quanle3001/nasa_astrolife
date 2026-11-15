import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const desktop = path.resolve(import.meta.dirname, "..");
const defaultApp = process.platform === "darwin"
  ? path.join(desktop, "release", process.arch === "x64" ? "mac" : `mac-${process.arch}`, "AstroLife.app", "Contents", "MacOS", "AstroLife")
  : path.join(desktop, "release", process.arch === "x64" ? "win-unpacked" : `win-${process.arch}-unpacked`, "AstroLife.exe");
const app = process.argv[2] ? path.resolve(process.argv[2]) : defaultApp;
const scratch = await mkdtemp(path.join(os.tmpdir(), "astrolife-package-"));
const env = { ...process.env, ASTROTIP_HISTORY_PATH: path.join(scratch, "history.sqlite3"), ASTROTIP_SMOKE_TEST: "1" };
for (const key of Object.keys(env)) {
  if (/^(ASTROTIP_PYTHON|ASTROTIP_SCREENSHOT.*|VITE_DEV_SERVER_URL|PYTHONPATH|PYTHONHOME|ELECTRON_RUN_AS_NODE)$/.test(key)) delete env[key];
}
const child = spawn(app, ["--smoke-test", `--user-data-dir=${path.join(scratch, "electron")}`], { cwd: scratch, env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (data) => { output += data.toString(); process.stdout.write(data); });
child.stderr.on("data", (data) => process.stderr.write(data));
const timeout = setTimeout(() => child.kill(), 120000);
try {
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  assert.equal(code, 0, "Packaged application must exit successfully");
  assert.match(output, /ASTROLIFE_PACKAGE_OK/, "Packaged renderer and backend must complete the smoke test");
} finally {
  clearTimeout(timeout);
  await rm(scratch, { recursive: true, force: true });
}
