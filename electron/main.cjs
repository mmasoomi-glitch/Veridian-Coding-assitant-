// Veridian Electron main process.
// Spawns the bundled Express server (dist/server.cjs) using Electron's bundled
// Node runtime, waits for it to come up on port 3000, then opens a window.
//
// IMPORTANT path/cwd reasoning:
// server.ts reads ALL runtime files relative to process.cwd():
//   - telemetry/*.ps1
//   - dist/ (static web, in production)
//   - node_modules (dist/server.cjs was bundled with --packages=external, so
//     express / dotenv / vite are require()'d at runtime)
//   - it writes data JSONs (workspace-sessions.json, etc.) into cwd too.
// In a packaged build, dist/, telemetry/, autopilot/, ai/ and node_modules are
// shipped as extraResources, so they live under process.resourcesPath. We set
// the child server's cwd to that folder so every process.cwd()-relative read
// resolves correctly. In dev (unpackaged) we use the repo root.

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Force the app identity so app.getPath('userData') resolves to %APPDATA%\Veridian
// (not %APPDATA%\<package.json name>). The server's data root (VERIDIAN_DATA_DIR) is
// set to this path below so user data lives outside the install dir and survives upgrades.
app.setName('Veridian');

const PORT = 3000;
const SERVER_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let serverProcess = null;

// Resolve the directory that should be the server's working directory.
// Packaged: process.resourcesPath (where extraResources land).
// Dev:      the repo root (two levels up from electron/main.js).
function resolveServerCwd() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..');
}

const SERVER_CWD = resolveServerCwd();
const SERVER_ENTRY = path.join(SERVER_CWD, 'dist', 'server.cjs');
const ICON_PATH = path.join(SERVER_CWD, 'windows-app', 'veridian.ico');
// In dev, windows-app sits in repo root; in packaged build we also ship it.
const ICON_FALLBACK = path.join(__dirname, '..', 'windows-app', 'veridian.ico');

function iconPath() {
  if (fs.existsSync(ICON_PATH)) return ICON_PATH;
  if (fs.existsSync(ICON_FALLBACK)) return ICON_FALLBACK;
  return undefined;
}

// Probe whether something already answers on PORT.
function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await checkServer()) return resolve(true);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Server did not start within timeout'));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function spawnServer() {
  // Reuse Electron's bundled Node by setting ELECTRON_RUN_AS_NODE.
  const watchDir = app.getPath('userData');
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_CWD,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      VERIDIAN_WATCH_DIR: process.env.VERIDIAN_WATCH_DIR || watchDir,
      // FIX-INSTALLER-DATADIR: persist user data under %APPDATA%\Veridian (userData), NOT the
      // install dir, so data survives upgrade/uninstall. lib/paths.ts reads this; CODE/RESOURCE
      // paths (.ps1, dist) intentionally keep using cwd/resourcesPath.
      VERIDIAN_DATA_DIR: process.env.VERIDIAN_DATA_DIR || watchDir,
      TELEMETRY_POLL_MS: process.env.TELEMETRY_POLL_MS || '30000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code, signal) => {
    console.log(`[server] exited code=${code} signal=${signal}`);
    serverProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    icon: iconPath(),
    title: 'Veridian',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showFatal(message) {
  const win = new BrowserWindow({
    width: 700,
    height: 360,
    autoHideMenuBar: true,
    icon: iconPath(),
    title: 'Veridian — startup error',
  });
  const html =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      `<body style="background:#0a0a0a;color:#eee;font-family:Segoe UI,sans-serif;padding:32px">
       <h2>Veridian could not start its server</h2>
       <pre style="white-space:pre-wrap;color:#f88">${message}</pre>
       <p style="color:#888">Server entry: ${SERVER_ENTRY}<br>cwd: ${SERVER_CWD}</p>
       </body>`
    );
  win.loadURL(html);
}

function killServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      // Kill the whole tree on Windows; the server may spawn powershell children.
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], {
          windowsHide: true,
        });
      } else {
        serverProcess.kill();
      }
    } catch (e) {
      // best-effort
    }
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  // If a server is already running on 3000 (e.g. dev), just attach to it.
  const alreadyUp = await checkServer();
  if (!alreadyUp) {
    spawnServer();
  }

  try {
    await waitForServer(30000);
    createWindow();
  } catch (err) {
    showFatal(String((err && err.message) || err));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killServer();
});

process.on('exit', killServer);
