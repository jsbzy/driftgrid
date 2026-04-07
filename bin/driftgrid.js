#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

const driftgridDir = path.resolve(__dirname, '..');

function runScript(scriptPath, extraArgs = '') {
  try {
    execSync(`npx tsx ${path.join(driftgridDir, scriptPath)} ${extraArgs}`, {
      stdio: 'inherit',
      cwd: driftgridDir,
    });
  } catch {
    process.exit(1);
  }
}

switch (command) {
  case 'init':
    runScript('scripts/init-project.ts', args.slice(1).join(' '));
    break;

  case 'doctor':
    runScript('scripts/doctor.ts');
    break;

  case 'generate-thumbs':
    runScript('scripts/generate-thumbnails.ts', args.slice(1).join(' '));
    break;

  case 'login':
    runScript('scripts/cloud-login.ts');
    break;

  case 'push':
    runScript('scripts/cloud-push.ts', args.slice(1).join(' '));
    break;

  case 'logout': {
    const fs = require('fs');
    const configPath = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.driftgrid', 'config.json');
    try {
      fs.unlinkSync(configPath);
      console.log('\n  Logged out. Config removed.\n');
    } catch {
      console.log('\n  Not logged in.\n');
    }
    break;
  }

  case 'help':
  case '--help':
  case '-h':
    console.log(`
  DriftGrid CLI

  Usage: driftgrid <command>

  Commands:
    (default)         Start the dev server
    init              Create a new project interactively
    doctor            Validate all projects
    generate-thumbs   Generate thumbnails for all versions

  Cloud:
    login             Authenticate with DriftGrid Cloud
    push [client/proj] Upload project(s) to the cloud
    logout            Remove stored credentials

  Options:
    --help, -h        Show this help
`);
    break;

  default: {
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
    break;
  }
}
