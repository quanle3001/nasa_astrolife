// Start AstroLife on a demo database that is separate from the real local history.
//
//   npm run demo          a fresh start every time: intro, mission choice, first check-in
//   npm run demo:resume   reopen the same demo data, to show that the app remembers
//
// Only the demo's own folder in the system temp directory is ever created or removed.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const electron = createRequire(import.meta.url)("electron");
const demoDir = path.join(os.tmpdir(), "astrolife-demo");
const resume = process.argv.includes("--resume");

if (!resume) rmSync(demoDir, { recursive: true, force: true });
mkdirSync(demoDir, { recursive: true });
console.log(`${resume ? "Reopening" : "Fresh"} demo data in ${demoDir}`);

const child = spawn(electron, ["."], {
  cwd: path.resolve(here, ".."),
  stdio: "inherit",
  env: { ...process.env, ASTROTIP_HISTORY_PATH: path.join(demoDir, "demo.sqlite3") },
});
child.on("exit", (code) => process.exit(code ?? 0));
