const { app, BrowserWindow, ipcMain, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let allowQuit = false;

class PythonBridge {
  constructor() {
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = null;
  }

  paths() {
    const repoRoot = path.resolve(__dirname, "../..");
    const softwareRoot = app.isPackaged
      ? path.join(process.resourcesPath, "software")
      : path.join(repoRoot, "software");
    const candidates = [
      process.env.ASTROTIP_PYTHON,
      app.isPackaged ? path.join(process.resourcesPath, "astrotip-backend") : null,
      path.join(repoRoot, ".venv", "bin", "python"),
      "python3",
    ].filter(Boolean);
    return { softwareRoot, candidates };
  }

  start() {
    if (this.child) return this.ready;
    const { softwareRoot, candidates } = this.paths();
    const python = candidates.find((candidate) => !candidate.includes(path.sep) || fs.existsSync(candidate));
    if (!python) throw new Error("No AstroLife Python runtime is available.");
    const packagedSidecar = app.isPackaged && path.basename(python) === "astrotip-backend";
    const args = packagedSidecar ? [] : ["-m", "astrotip.bridge.service"];
    this.child = spawn(python, args, {
      cwd: softwareRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const lines = createInterface({ input: this.child.stdout });
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("AstroLife backend startup timed out.")), 15000);
      lines.on("line", (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.event === "backend.ready") {
          clearTimeout(timeout);
          resolve(message.payload);
        }
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          clearTimeout(pending.timeout);
          message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error?.message || "Backend request failed."));
        } else if (message.event && mainWindow && !mainWindow.isDestroyed()) {
          // Raw optical batches arrive many times per second. They get their own
          // channel so they never pass through the general app-state listener.
          if (message.event === "sensor.ppg.batch") mainWindow.webContents.send("backend:ppg", message.payload);
          else mainWindow.webContents.send("backend:event", message);
        }
      });
      this.child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      this.child.once("exit", (code) => {
        clearTimeout(timeout);
        this.child = null;
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`AstroLife backend stopped (${code ?? "unknown"}).`));
        }
        this.pending.clear();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("backend:event", { event: "backend.stopped", payload: { code } });
        }
      });
    });
    this.child.stderr.on("data", (data) => console.error(`[python] ${data.toString().trim()}`));
    return this.ready;
  }

  async call(method, params = {}, timeoutMs = 8000) {
    await this.start();
    if (!this.child?.stdin.writable) throw new Error("AstroLife backend is unavailable.");
    const id = `desktop-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Backend request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    try { await this.call("system.shutdown", {}, 2000); } catch { /* process may already be unavailable */ }
    child.stdin.end();
    await new Promise((resolve) => {
      let finished = false;
      let timer = null;
      const done = () => { if (!finished) { finished = true; if (timer) clearTimeout(timer); resolve(); } };
      child.once("exit", done);
      timer = setTimeout(() => { if (this.child === child) child.kill(); done(); }, 2500);
    });
  }
}

const bridge = new PythonBridge();

function validSender(event) {
  const url = event.senderFrame?.url || "";
  return url.startsWith("file://") || url.startsWith("http://127.0.0.1:5173");
}

function handle(channel, method) {
  ipcMain.handle(channel, async (event, params = {}) => {
    if (!validSender(event)) throw new Error("Rejected untrusted desktop request.");
    return bridge.call(method, params);
  });
}

handle("backend:ping", "system.ping");
handle("backend:config", "system.config");
handle("backend:ports", "ports.list");
handle("backend:sensor-connect", "sensor.connect");
handle("backend:sensor-disconnect", "sensor.disconnect");
handle("backend:sensor-simulate", "sensor.simulate");
handle("backend:assess", "health.assess");
handle("backend:save", "health.save");
handle("backend:history", "history.list");
handle("backend:knowledge", "knowledge.get");
handle("backend:mission-get", "mission.get");
handle("backend:mission-save", "mission.save");
handle("backend:session-current", "session.current");
handle("backend:session-start", "session.start");
handle("backend:session-save", "session.save");
handle("backend:session-preview", "session.preview");
handle("backend:session-submit", "session.submit");
handle("backend:actions-list", "actions.list");
handle("backend:actions-update", "actions.update");
handle("backend:radlab", "nasa.radlab.get");

ipcMain.handle("external:nasa", async (event, value) => {
  if (!validSender(event)) throw new Error("Rejected untrusted desktop request.");
  const url = new URL(String(value));
  if (url.protocol !== "https:" || !(url.hostname === "nasa.gov" || url.hostname.endsWith(".nasa.gov"))) {
    throw new Error("Only official NASA HTTPS sources can be opened.");
  }
  await shell.openExternal(url.toString());
  return true;
});

const APP_ICON = path.join(__dirname, "../build/icon.png");

async function createWindow() {
  await bridge.start();
  // Packaged builds take the icon from electron-builder; in development set it explicitly.
  if (!app.isPackaged && process.platform === "darwin" && fs.existsSync(APP_ICON)) app.dock.setIcon(nativeImage.createFromPath(APP_ICON));
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#050814",
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? url.startsWith("http://127.0.0.1:5173") : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });
  const page = process.env.ASTROTIP_SCREENSHOT_PAGE;
  if (isDev) await mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${page ? `?page=${encodeURIComponent(page)}` : ""}`);
  else await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"), page ? { query: { page } } : undefined);
  mainWindow.once("ready-to-show", async () => {
    mainWindow.show();
    if (process.env.ASTROTIP_SCREENSHOT) {
      // Development-only capture aid: optionally start the labelled simulated stream first.
      if (process.env.ASTROTIP_SCREENSHOT_SIMULATE) await bridge.call("sensor.simulate").catch(() => undefined);
      const screenshotDelay = Number(process.env.ASTROTIP_SCREENSHOT_DELAY || 2800);
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(screenshotDelay) ? screenshotDelay : 2800));
      // Development-only capture aid: run a local script in the page first (to walk
      // to the screen being captured), then optionally bring one element into view.
      if (process.env.ASTROTIP_SCREENSHOT_SCRIPT) {
        // The script can request extra captures by setting document.title to "capture:<name>".
        mainWindow.webContents.on("page-title-updated", async (_event, title) => {
          if (!title.startsWith("capture:")) return;
          const name = title.slice(8).replace(/[^a-z0-9-]/gi, "");
          const shot = await mainWindow.webContents.capturePage();
          await fs.promises.writeFile(path.join(path.dirname(process.env.ASTROTIP_SCREENSHOT), `${name}.png`), shot.toPNG());
        });
        const source = await fs.promises.readFile(process.env.ASTROTIP_SCREENSHOT_SCRIPT, "utf8");
        await mainWindow.webContents.executeJavaScript(`(async () => { ${source} })()`).catch((error) => console.error(`[capture script] ${error.message}`));
      }
      const target = process.env.ASTROTIP_SCREENSHOT_SCROLL;
      if (target) {
        await mainWindow.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(target)})?.scrollIntoView({ block: "center" })`).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      const image = await mainWindow.webContents.capturePage();
      await fs.promises.writeFile(process.env.ASTROTIP_SCREENSHOT, image.toPNG());
      await bridge.stop();
      app.quit();
    }
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("before-quit", (event) => {
  if (allowQuit || !bridge.child) return;
  event.preventDefault();
  void bridge.stop().finally(() => { allowQuit = true; app.quit(); });
});
