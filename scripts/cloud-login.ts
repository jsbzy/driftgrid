/**
 * driftgrid login — Authenticate with DriftGrid Cloud
 *
 * Stores credentials in ~/.driftgrid/config.json for use by
 * the MCP server and `driftgrid push`.
 */

import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.driftgrid');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

interface CloudConfig {
  url: string;
  apiKey: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
}

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      // Hide password input
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on('data', (ch) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          process.stdin.setRawMode?.(false);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          process.exit(0);
        } else if (c === '\u007F') {
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function loadConfig(): Promise<CloudConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveConfig(config: CloudConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  // Restrict permissions to owner only
  await fs.chmod(CONFIG_PATH, 0o600);
}

async function main() {
  console.log('\n  DriftGrid Cloud Login\n');

  // Check for existing config
  const existing = await loadConfig();
  if (existing) {
    console.log(`  Currently logged in as: ${existing.email}`);
    console.log(`  Workspace: ${existing.workspaceName}`);
    console.log(`  Server: ${existing.url}\n`);

    const reauth = await prompt('  Re-authenticate? (y/N) ');
    if (reauth.toLowerCase() !== 'y') {
      console.log('  Keeping existing credentials.\n');
      return;
    }
    console.log('');
  }

  // Get server URL
  const defaultUrl = existing?.url || 'https://app.driftgrid.com';
  const url = await prompt(`  Server URL [${defaultUrl}]: `) || defaultUrl;

  // Get credentials
  const email = await prompt('  Email: ');
  const password = await prompt('  Password: ', true);

  if (!email || !password) {
    console.error('  Error: Email and password required.\n');
    process.exit(1);
  }

  // Authenticate
  console.log('\n  Authenticating...');

  try {
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error(`  Error: ${data.error || 'Login failed'}\n`);
      process.exit(1);
    }

    // Get user info and generate API key
    const cookies = res.headers.get('set-cookie') || '';

    // Fetch workspaces
    const wsRes = await fetch(`${url}/api/workspaces`, {
      headers: { Cookie: cookies },
    });

    if (!wsRes.ok) {
      console.error('  Error: Could not fetch workspaces.\n');
      process.exit(1);
    }

    const workspaces = await wsRes.json();
    if (workspaces.length === 0) {
      console.error('  Error: No workspaces found.\n');
      process.exit(1);
    }

    // Select workspace
    let workspace;
    if (workspaces.length === 1) {
      workspace = workspaces[0];
    } else {
      console.log('\n  Select workspace:');
      workspaces.forEach((ws: any, i: number) => {
        console.log(`    ${i + 1}. ${ws.name} (${ws.plan})`);
      });
      const choice = await prompt(`\n  Choice [1]: `) || '1';
      workspace = workspaces[parseInt(choice, 10) - 1];
      if (!workspace) {
        console.error('  Invalid selection.\n');
        process.exit(1);
      }
    }

    // Generate a local API key
    const rawKey = `dg_${createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32)}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Register the API key on the server
    const keyRes = await fetch(`${url}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookies },
      body: JSON.stringify({
        workspaceId: workspace.id,
        name: `CLI - ${new Date().toISOString().split('T')[0]}`,
        keyHash,
        keyPrefix: rawKey.slice(0, 11),
      }),
    });

    // Save config (even if key registration fails — we can retry later)
    const config: CloudConfig = {
      url,
      apiKey: rawKey,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: workspace.user_id || '',
      email,
    };

    await saveConfig(config);

    console.log(`\n  Logged in as: ${email}`);
    console.log(`  Workspace: ${workspace.name}`);
    console.log(`  Config saved to: ${CONFIG_PATH}`);

    if (keyRes && !keyRes.ok) {
      console.log('\n  Note: API key registration failed (server may not support it yet).');
      console.log('  Push will fall back to session auth.');
    }

    console.log('\n  Run `driftgrid push` to upload a project to the cloud.\n');
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : 'Connection failed'}`);
    console.error(`  Make sure ${url} is reachable.\n`);
    process.exit(1);
  }
}

main();
