const fs = require("node:fs");
const path = require("node:path");

function backendName(platform = process.platform) {
  return platform === "win32" ? "astrotip-backend.exe" : "astrotip-backend";
}

function venvPython(repoRoot, platform = process.platform) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  return platform === "win32"
    ? paths.join(repoRoot, ".venv", "Scripts", "python.exe")
    : paths.join(repoRoot, ".venv", "bin", "python");
}

function backendLaunch({ packaged, repoRoot, resourcesPath, platform = process.platform,
  env = process.env, exists = fs.existsSync }) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  if (packaged) {
    const command = paths.join(resourcesPath, backendName(platform));
    if (!exists(command)) throw new Error(`Bundled AstroLife backend is missing: ${command}`);
    return { command, args: [], cwd: resourcesPath };
  }
  const localPython = venvPython(repoRoot, platform);
  const command = env.ASTROTIP_PYTHON || (exists(localPython) ? localPython : platform === "win32" ? "python" : "python3");
  return { command, args: ["-m", "astrotip.bridge.service"], cwd: paths.join(repoRoot, "software") };
}

module.exports = { backendName, venvPython, backendLaunch };
