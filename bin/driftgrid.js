#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];

const driftgridDir = path.resolve(__dirname, '..');

if (command === '--help' || command === '-h' || command === 'help') {
  console.log(`
  DriftGrid CLI

  Usage:
    driftgrid                         Start the dev server (default)
    driftgrid init [client] [project] [--canvas <preset>] [--output <type>]
                                      Scaffold a new project
    driftgrid doctor                  Check the local install for problems
    driftgrid generate-thumbs [...]   Regenerate project thumbnails
    driftgrid --help, -h              Show this help

  Canvas presets:
    desktop, mobile, tablet, landscape-16-9, a4-portrait, freeform

  Output types (--output):
    vector  HTML/CSS/SVG (default — most projects)
    image   raster PNG per frame (needs an image-gen model)
    hybrid  HTML canvas with regenerable <img> slots

  Examples:
    driftgrid                         # start dev server on :3000
    driftgrid init Acme "Landing Page"
    driftgrid init Acme "Pitch Deck"  --canvas landscape-16-9
    driftgrid init Acme Moodboard     --canvas desktop --output image
  `);
  process.exit(0);
}

if (command === 'init') {
  // Forward to the init script
  const initArgs = args.slice(1).join(' ');
  try {
    execSync(`npx tsx ${path.join(driftgridDir, 'scripts/init-project.ts')} ${initArgs}`, {
      stdio: 'inherit',
      cwd: driftgridDir,
    });
  } catch {
    process.exit(1);
  }
} else if (command === 'doctor') {
  try {
    execSync(`npx tsx ${path.join(driftgridDir, 'scripts/doctor.ts')}`, {
      stdio: 'inherit',
      cwd: driftgridDir,
    });
  } catch {
    process.exit(1);
  }
} else if (command === 'generate-thumbs') {
  const thumbArgs = args.slice(1).join(' ');
  try {
    execSync(`npx tsx ${path.join(driftgridDir, 'scripts/generate-thumbnails.ts')} ${thumbArgs}`, {
      stdio: 'inherit',
      cwd: driftgridDir,
    });
  } catch {
    process.exit(1);
  }
} else {
  // Default: start the dev server
  const port = process.env.PORT || '3000';

  console.log(`
  ╔══════════════════════════════════╗
  ║         DriftGrid v0.1.0        ║
  ║   localhost:${port.padEnd(4)}                 ║
  ╚══════════════════════════════════╝
  `);

  const next = spawn('npx', ['next', 'dev', '-p', port], {
    stdio: 'inherit',
    cwd: driftgridDir,
    env: { ...process.env },
  });

  // Open browser after a short delay
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    const platform = process.platform;
    try {
      if (platform === 'darwin') execSync(`open ${url}`);
      else if (platform === 'win32') execSync(`start ${url}`);
      else execSync(`xdg-open ${url}`);
    } catch {
      // Couldn't open browser — that's fine
    }
  }, 3000);

  next.on('exit', (code) => process.exit(code || 0));
  process.on('SIGINT', () => { next.kill('SIGINT'); process.exit(0); });
  process.on('SIGTERM', () => { next.kill('SIGTERM'); process.exit(0); });
}
