import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { build, Platform, archFromString } from "electron-builder";
import runtime from "../electron/backend-runtime.cjs";

const target = process.argv[2];
if (process.argv.length !== 3 || !["dir", "mac", "win"].includes(target)) {
  throw new Error("Use npm run package:mac, package:win or package:dir without extra flags. Build on the target OS and architecture.");
}
if (!["darwin", "win32"].includes(process.platform)
    || (target === "mac" && process.platform !== "darwin")
    || (target === "win" && process.platform !== "win32")) {
  throw new Error("Build the macOS installer on a Mac and the Windows installer on Windows (the Python backend is platform-specific).");
}
const desktop = resolve(import.meta.dirname, "..");
const python = process.env.ASTROTIP_PYTHON || runtime.venvPython(resolve(desktop, ".."));
const info = spawnSync(python, ["-c", "import platform, struct; print(platform.machine().lower()); print(struct.calcsize('P') * 8)"], { encoding: "utf8" });
if (info.error || info.status !== 0) throw new Error(`Cannot run build Python: ${python}\n${info.error || info.stderr}`);
const [machine, bits] = info.stdout.trim().split(/\r?\n/);
const pythonArch = { arm64: "arm64", aarch64: "arm64", amd64: "x64", x86_64: "x64" }[machine];
if (bits !== "64" || pythonArch !== process.arch) throw new Error(`Python (${machine}, ${bits}-bit) and Node (${process.arch}) must use the same 64-bit architecture.`);

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: desktop, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build step failed: ${script} (exit ${result.status})`);
}
run(process.env.npm_execpath, ["run", "build"]);
run(resolve(desktop, "scripts/build-backend.mjs"));
run(resolve(desktop, "scripts/bridge-proof.mjs"), ["--sidecar", resolve(desktop, "sidecar-dist", runtime.backendName())]);
const platform = process.platform === "darwin" ? Platform.MAC : Platform.WINDOWS;
await build({
  projectDir: desktop,
  targets: platform.createTarget(target === "dir" ? "dir" : target === "mac" ? "dmg" : "nsis", archFromString(process.arch)),
  publish: "never",
});
