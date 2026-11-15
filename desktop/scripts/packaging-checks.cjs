const { test } = require("node:test");
const assert = require("node:assert/strict");
const { backendLaunch, venvPython } = require("../electron/backend-runtime.cjs");

test("Windows development launches the venv Python with module arguments", () => {
  const launch = backendLaunch({ packaged: false, repoRoot: "C:\\Astro Life", platform: "win32", env: {}, exists: () => true });
  assert.equal(launch.command, "C:\\Astro Life\\.venv\\Scripts\\python.exe");
  assert.deepEqual(launch.args, ["-m", "astrotip.bridge.service"]);
  assert.equal(launch.cwd, "C:\\Astro Life\\software");
});
test("installed Windows app runs its exe without Python module arguments", () => {
  const launch = backendLaunch({ packaged: true, resourcesPath: "C:\\Program Files\\AstroLife\\resources", platform: "win32",
    env: { ASTROTIP_PYTHON: "C:\\unrelated-python.exe" }, exists: () => true });
  assert.equal(launch.command, "C:\\Program Files\\AstroLife\\resources\\astrotip-backend.exe");
  assert.deepEqual(launch.args, []);
});
test("installed Mac app uses its own Resources directory", () => {
  const resourcesPath = "/Applications/AstroLife.app/Contents/Resources";
  assert.deepEqual(backendLaunch({ packaged: true, resourcesPath, platform: "darwin", exists: () => true }),
    { command: `${resourcesPath}/astrotip-backend`, args: [], cwd: resourcesPath });
  assert.equal(venvPython("/project", "darwin"), "/project/.venv/bin/python");
});
test("missing packaged backend fails instead of falling back to system Python", () => {
  assert.throws(() => backendLaunch({ packaged: true, resourcesPath: "/missing", platform: "darwin", exists: () => false }), /Bundled AstroLife backend is missing/);
});
test("development can still use an explicitly selected Python", () => {
  const launch = backendLaunch({ packaged: false, repoRoot: "/project", platform: "darwin", env: { ASTROTIP_PYTHON: "/custom/python" }, exists: () => false });
  assert.equal(launch.command, "/custom/python");
});
