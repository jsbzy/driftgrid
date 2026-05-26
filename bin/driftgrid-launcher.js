#!/usr/bin/env node
// driftgrid-launcher.js — lightweight always-on service that manages the
// DriftGrid dev server on demand. Runs on port 3100 (outside the dev server's
// 3000-3005 range). A LaunchAgent keeps this alive; the actual dev server only
// runs when explicitly started via POST /start.
//
// Endpoints:
//   GET  /health    — launcher is alive
//   GET  /status    — dev server running? port? pid? uptime?
//   POST /start     — start the dev server (no-op if already running)
//   POST /stop      — stop the dev server
//   POST /keepalive — reset idle timeout
//
// Env:
//   DRIFTGRID_LAUNCHER_PORT  — default 3100
//   DRIFTGRID_DEV_PORT       — preferred dev port, default 3000
//   DRIFTGRID_IDLE_MINUTES   — auto-stop after N idle minutes, default 30 (0 = disabled)

const http = require('http');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const LAUNCHER_PORT = parseInt(process.env.DRIFTGRID_LAUNCHER_PORT || '3100', 10);
const DEV_PORT = parseInt(process.env.DRIFTGRID_DEV_PORT || '3000', 10);
const IDLE_MINUTES = parseInt(process.env.DRIFTGRID_IDLE_MINUTES || '30', 10);
const IDLE_TIMEOUT_MS = IDLE_MINUTES * 60 * 1000;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const NEXT_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'next');

// ── State ──────────────────────────────────────────────────────────────

let devProcess = null;   // child process handle (null if not managed by us)
let devPort = null;       // port the managed dev server is on
let devStartedAt = null;  // Date.now() when started
let lastActivityAt = null; // resets on /start and /keepalive

// ── Helpers ────────────────────────────────────────────────────────────

function pidsOnPort(port) {
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split('\n').map(Number);
}

function findFreePort() {
  if (pidsOnPort(DEV_PORT).length === 0) return DEV_PORT;
  for (const p of [3001, 3002, 3003, 3004, 3005]) {
    if (pidsOnPort(p).length === 0) return p;
  }
  return null;
}

/** Check whether our managed child is still alive. */
function reapIfDead() {
  if (!devProcess) return;
  try {
    process.kill(devProcess.pid, 0); // signal 0 = just check
  } catch {
    devProcess = null;
    devPort = null;
    devStartedAt = null;
  }
}

function getStatus() {
  reapIfDead();

  // Also detect externally-started dev servers on the default port.
  const checkPort = devPort || DEV_PORT;
  const externalPids = pidsOnPort(checkPort);
  const managed = devProcess !== null;
  const running = managed || externalPids.length > 0;
  const port = managed ? devPort : externalPids.length > 0 ? checkPort : null;

  return {
    running,
    port,
    pid: devProcess?.pid || (externalPids.length > 0 ? externalPids[0] : null),
    managed,
    uptime: devStartedAt ? Math.floor((Date.now() - devStartedAt) / 1000) : null,
    idleTimeoutMinutes: IDLE_MINUTES || null,
  };
}

async function waitForHealthy(port, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://localhost:${port}/api/clients`, {
        signal: controller.signal,
      });
      clearTimeout(id);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Server lifecycle ───────────────────────────────────────────────────

async function startDevServer() {
  const status = getStatus();
  if (status.running) {
    return { ok: true, already: true, port: status.port, pid: status.pid };
  }

  const port = findFreePort();
  if (!port) {
    throw new Error('No free port in range 3000-3005');
  }

  return new Promise((resolve, reject) => {
    const args = port === DEV_PORT ? ['dev'] : ['dev', '--port', String(port)];
    const child = spawn(NEXT_BIN, args, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, DRIFTGRID_SKIP_PREFLIGHT: '1' },
    });

    devProcess = child;
    devPort = port;
    devStartedAt = Date.now();
    lastActivityAt = Date.now();

    child.stdout.on('data', (d) => process.stdout.write(`[dev:${port}] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[dev:${port}] ${d}`));

    child.on('error', (err) => {
      console.error(`[launcher] Dev server spawn error: ${err.message}`);
      devProcess = null;
      devPort = null;
      devStartedAt = null;
      reject(err);
    });

    child.on('exit', (code, signal) => {
      console.log(
        `[launcher] Dev server exited (code=${code}, signal=${signal})`
      );
      devProcess = null;
      devPort = null;
      devStartedAt = null;
    });

    waitForHealthy(port).then((ok) => {
      if (ok) {
        console.log(`[launcher] Dev server healthy on :${port}`);
        resolve({ ok: true, started: true, port, pid: child.pid });
      } else {
        // Kill the unhealthy server
        child.kill('SIGTERM');
        devProcess = null;
        devPort = null;
        devStartedAt = null;
        reject(new Error(`Dev server on :${port} failed health check after 60s`));
      }
    });
  });
}

function stopDevServer() {
  const status = getStatus();
  if (!status.running) {
    return { ok: true, already: true, stopped: false };
  }

  const pid = devProcess?.pid || status.pid;

  if (devProcess) {
    devProcess.kill('SIGTERM');
    devProcess = null;
  } else if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  devPort = null;
  devStartedAt = null;
  lastActivityAt = null;

  return { ok: true, stopped: true, pid };
}

// ── Idle timeout ───────────────────────────────────────────────────────

if (IDLE_MINUTES > 0) {
  setInterval(() => {
    if (!devProcess || !lastActivityAt) return;
    if (Date.now() - lastActivityAt > IDLE_TIMEOUT_MS) {
      console.log(
        `[launcher] Idle timeout (${IDLE_MINUTES}min) — stopping dev server`
      );
      stopDevServer();
    }
  }, 60_000);
}

// ── HTTP server ────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${LAUNCHER_PORT}`);
  const route = url.pathname;

  try {
    switch (true) {
      case route === '/health' && req.method === 'GET':
        return json(res, { ok: true, launcher: true });

      case route === '/status' && req.method === 'GET':
        return json(res, getStatus());

      case route === '/start' && req.method === 'POST':
        lastActivityAt = Date.now();
        return json(res, await startDevServer());

      case route === '/stop' && req.method === 'POST':
        return json(res, stopDevServer());

      case route === '/keepalive' && req.method === 'POST':
        lastActivityAt = Date.now();
        return json(res, { ok: true, lastActivityAt });

      default:
        return json(res, { error: 'Not found' }, 404);
    }
  } catch (err) {
    console.error(`[launcher] Error on ${route}: ${err.message}`);
    return json(res, { error: err.message }, 500);
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`[launcher] ${signal} — shutting down`);
  if (devProcess) {
    console.log(`[launcher] Stopping managed dev server (pid ${devProcess.pid})`);
    devProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
  // Force exit after 5s if server doesn't close cleanly
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start ──────────────────────────────────────────────────────────────

server.listen(LAUNCHER_PORT, '0.0.0.0', () => {
  console.log(`[launcher] DriftGrid launcher on :${LAUNCHER_PORT}`);
  console.log(`[launcher] Dev port preference: ${DEV_PORT}`);
  if (IDLE_MINUTES > 0) {
    console.log(`[launcher] Idle auto-stop: ${IDLE_MINUTES} minutes`);
  } else {
    console.log(`[launcher] Idle auto-stop: disabled`);
  }
});
