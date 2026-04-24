#!/usr/bin/env node
// Preflight wrapper around `next dev`.
// If port 3000 is in use, identify what's on it (especially other DriftGrid
// instances) and offer to kill it, fall back to the next free port, or quit.

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

const DEFAULT_PORT = 3000;
const FALLBACK_RANGE = [3001, 3002, 3003, 3004, 3005];
const NEXT_BIN = path.join(__dirname, '..', 'node_modules', '.bin', 'next');

function pidsOnPort(port) {
  // Filter to LISTEN state so Chrome tabs / other clients connected to the
  // port don't get mistaken for the server holding it.
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split('\n').map(Number);
}

function describeProcess(pid) {
  const ps = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  const command = (ps.stdout || '').trim();

  const lsof = spawnSync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  let cwd = null;
  for (const line of (lsof.stdout || '').split('\n')) {
    if (line.startsWith('n')) { cwd = line.slice(1); break; }
  }

  const isNext = /next-server|node.*next/i.test(command);
  const looksLikeDriftGrid = Boolean(
    (cwd && cwd.toLowerCase().includes('driftgrid')) ||
    /driftgrid/i.test(command)
  );

  let label = 'unknown process';
  if (looksLikeDriftGrid) label = 'another DriftGrid';
  else if (isNext) label = 'another Next.js dev server';
  else if (command) label = command.split(/\s+/)[0].split('/').pop() || 'unknown process';

  return { pid, command, cwd, isNext, looksLikeDriftGrid, label };
}

function findFreePort() {
  for (const p of FALLBACK_RANGE) {
    if (pidsOnPort(p).length === 0) return p;
  }
  return null;
}

function ask(prompt) {
  if (!process.stdin.isTTY) {
    return Promise.resolve('q');
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function startNext(port) {
  const args = port === DEFAULT_PORT ? ['dev'] : ['dev', '--port', String(port)];
  console.log(`\n→ DriftGrid on :${port}\n`);
  const child = spawn(NEXT_BIN, args, { stdio: 'inherit' });

  const forward = signal => () => { if (child && !child.killed) child.kill(signal); };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));

  child.on('exit', code => process.exit(code ?? 0));
  child.on('error', err => {
    console.error('Failed to start next dev:', err.message);
    process.exit(1);
  });
}

async function waitForPortFree(port, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pidsOnPort(port).length === 0) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

async function main() {
  // Allow skipping the preflight entirely.
  if (process.env.DRIFTGRID_SKIP_PREFLIGHT === '1') {
    startNext(DEFAULT_PORT);
    return;
  }

  const pids = pidsOnPort(DEFAULT_PORT);
  if (pids.length === 0) {
    startNext(DEFAULT_PORT);
    return;
  }

  const proc = describeProcess(pids[0]);
  const free = findFreePort();

  console.log('');
  console.log(`⚠  Port ${DEFAULT_PORT} is in use by ${proc.label} (pid ${proc.pid}).`);
  if (proc.cwd) console.log(`   Working dir: ${proc.cwd}`);
  console.log('');
  console.log(`   [K] Kill it and start fresh on :${DEFAULT_PORT}`);
  if (free) console.log(`   [N] Start this one on :${free} instead`);
  console.log(`   [Q] Quit`);
  console.log('');

  const ans = await ask('   ? ');

  if (ans === 'k' || ans === 'kill') {
    console.log(`   Killing pid ${proc.pid}...`);
    spawnSync('kill', ['-9', String(proc.pid)]);
    const cleared = await waitForPortFree(DEFAULT_PORT);
    if (!cleared) {
      console.error(`   Port ${DEFAULT_PORT} still busy after kill — something else holds it. Exiting.`);
      process.exit(1);
    }
    startNext(DEFAULT_PORT);
    return;
  }

  if ((ans === 'n' || ans === 'next') && free) {
    startNext(free);
    return;
  }

  console.log('   Exiting.');
  process.exit(0);
}

main().catch(err => {
  console.error('driftgrid-dev preflight error:', err);
  process.exit(1);
});
