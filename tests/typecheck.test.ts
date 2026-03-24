import test from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('TypeScript compilation succeeds (tsc --noEmit)', () => {
  try {
    execSync('npx tsc --noEmit', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (err: unknown) {
    const error = err as { stdout?: Buffer; stderr?: Buffer };
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    assert.fail(`tsc --noEmit failed:\n${stdout}\n${stderr}`);
  }
});
