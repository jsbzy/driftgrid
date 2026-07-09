import test from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import {
  PAT_PREFIX,
  generatePat,
  hashToken,
  bearerFromHeader,
} from '../lib/cloud-auth-server';

test('generatePat mints a prefixed token with matching hash + display prefix', () => {
  const { plaintext, hash, prefix } = generatePat();

  assert.ok(plaintext.startsWith(PAT_PREFIX), 'plaintext should carry the dg_pat_ prefix');
  assert.strictEqual(hash, createHash('sha256').update(plaintext).digest('hex'), 'hash must be sha256(plaintext)');
  assert.ok(plaintext.startsWith(prefix), 'display prefix must be a prefix of the plaintext');
  // The display prefix must NOT be enough to reconstruct the token.
  assert.ok(prefix.length < plaintext.length, 'display prefix must be shorter than the full token');
});

test('generatePat produces unique tokens', () => {
  const a = generatePat();
  const b = generatePat();
  assert.notStrictEqual(a.plaintext, b.plaintext, 'tokens must be unique');
  assert.notStrictEqual(a.hash, b.hash, 'hashes must be unique');
});

test('hashToken is stable and never returns the plaintext', () => {
  const secret = 'dg_pat_example';
  const h1 = hashToken(secret);
  const h2 = hashToken(secret);
  assert.strictEqual(h1, h2, 'hashing is deterministic');
  assert.notStrictEqual(h1, secret, 'hash must differ from plaintext');
  assert.strictEqual(h1.length, 64, 'sha256 hex is 64 chars');
});

test('bearerFromHeader extracts the token or returns null', () => {
  assert.strictEqual(bearerFromHeader('Bearer abc123'), 'abc123');
  assert.strictEqual(bearerFromHeader('Bearer   spaced  '), 'spaced', 'trims surrounding whitespace');
  assert.strictEqual(bearerFromHeader(null), null, 'null header → null');
  assert.strictEqual(bearerFromHeader(''), null, 'empty header → null');
  assert.strictEqual(bearerFromHeader('Basic abc'), null, 'non-bearer scheme → null');
  assert.strictEqual(bearerFromHeader('Bearer '), null, 'empty token → null');
});
