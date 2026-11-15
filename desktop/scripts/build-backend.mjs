import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import process from "node:process";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "..");
const python = process.env.ASTROTIP_PYTHON || resolve(repoRoot, ".venv", "bin", "python");

if (!existsSync(python)) {
  throw new Error(`Python runtime not found: ${python}`);
}

const result = spawnSync(python, [
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--name", "astrotip-backend",
  "--paths", resolve(repoRoot, "software"),
  "--add-data", `${resolve(repoRoot, "software", "resources")}${delimiter}resources`,
  "--distpath", resolve(desktopRoot, "sidecar-dist"),
  "--workpath", resolve(desktopRoot, "sidecar-build"),
  "--specpath", desktopRoot,
  resolve(repoRoot, "software", "astrotip", "bridge", "service.py"),
], {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, PYINSTALLER_CONFIG_DIR: resolve(desktopRoot, "sidecar-build", "config") },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
