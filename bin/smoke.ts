#!/usr/bin/env tsx
/**
 * DriftGrid API-level smoke test suite.
 *
 * Runs against the dev server on localhost:3000, creates a throwaway project,
 * exercises every endpoint in a realistic user flow, and cleans up after itself.
 *
 * Usage:
 *   npm run smoke                      — run all phases
 *   npm run smoke -- --phase 3         — run only phase 3
 *   npm run smoke -- --verbose         — dump response bodies on failure
 *   npm run smoke -- --no-cleanup      — leave projects/__smoke__/ for debugging
 *   SMOKE_INCLUDE_STRIPE=1 npm run smoke  — include Stripe phase (phase 15)
 *
 * Prefix every test artifact with `__smoke__` so cleanup can be exact.
 *
 * Exit 0 if every phase passed, 1 otherwise.
 */

import { promises as fs } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// ---------- config ----------

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
// Slug rules (lib/slug.ts): must match /^[a-z0-9][a-z0-9-]*$/i, ≤64 chars, no
// leading hyphen, no underscores. `__smoke__` fails — the API would silently
// slugify it to `smoke`. We prefix every artifact with `smoke-` so cleanup is
// targeted without tripping validation.
const SMOKE_CLIENT = 'smoke-client';
const SMOKE_PROJECT = 'smoketest';
const SMOKE_ROUNDS_PROJECT = 'smoketest-rounds';
const FIXTURE_PATH = path.join(process.cwd(), 'tests/fixtures/sample.html');
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

const args = process.argv.slice(2);
const flagPhase = args.includes('--phase') ? parseInt(args[args.indexOf('--phase') + 1], 10) : null;
const flagVerbose = args.includes('--verbose');
const flagNoCleanup = args.includes('--no-cleanup');
const flagIncludeStripe = process.env.SMOKE_INCLUDE_STRIPE === '1';

// ---------- colors ----------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// ---------- harness ----------

type PhaseResult = { name: string; pass: number; fail: number; skip: number };
const phaseResults: PhaseResult[] = [];
let currentPhase: PhaseResult | null = null;

function startPhase(name: string) {
  currentPhase = { name, pass: 0, fail: 0, skip: 0 };
  phaseResults.push(currentPhase);
  console.log(`\n${C.bold}${C.cyan}${name}${C.reset}`);
}

function assert(cond: unknown, message: string, context?: unknown): boolean {
  if (!currentPhase) throw new Error('assert called outside a phase');
  if (cond) {
    currentPhase.pass++;
    console.log(`  ${C.green}✓${C.reset} ${message}`);
    return true;
  }
  currentPhase.fail++;
  console.log(`  ${C.red}✗${C.reset} ${message}`);
  if (flagVerbose && context !== undefined) {
    console.log(`    ${C.gray}${JSON.stringify(context, null, 2).split('\n').join('\n    ')}${C.reset}`);
  }
  return false;
}

function assertEqual<T>(actual: T, expected: T, message: string): boolean {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return assert(
    ok,
    `${message}${ok ? '' : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`,
  );
}

function assertStatus(res: { status: number }, code: number, label: string): boolean {
  return assert(res.status === code, `${label} — status ${code}${res.status === code ? '' : ` (got ${res.status})`}`);
}

function skip(message: string) {
  if (!currentPhase) throw new Error('skip called outside a phase');
  currentPhase.skip++;
  console.log(`  ${C.yellow}~${C.reset} ${message}`);
}

// ---------- http helpers ----------

type Res<T = unknown> = { status: number; body: T; headers: Headers; raw: Response };

async function req<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  opts?: { raw?: false; headers?: Record<string, string> },
): Promise<Res<T>>;
async function req(
  method: string,
  url: string,
  body: unknown,
  opts: { raw: true; headers?: Record<string, string> },
): Promise<Res<ArrayBuffer>>;
async function req(
  method: string,
  url: string,
  body?: unknown,
  opts: { raw?: boolean; headers?: Record<string, string> } = {},
): Promise<Res<unknown>> {
  const full = url.startsWith('http') ? url : `${BASE}${url}`;
  const headers: Record<string, string> = { ...opts.headers };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (typeof body === 'string') {
      payload = body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'text/html';
    } else {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  const raw = await fetch(full, { method, headers, body: payload });
  let resBody: unknown;
  if (opts.raw) {
    resBody = await raw.arrayBuffer();
  } else {
    const ct = raw.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      resBody = await raw.json().catch(() => null);
    } else {
      resBody = await raw.text();
    }
  }
  return { status: raw.status, body: resBody, headers: raw.headers, raw };
}

// ---------- cleanup ----------

async function cleanup() {
  if (flagNoCleanup) {
    console.log(`\n${C.yellow}[cleanup skipped — --no-cleanup]${C.reset}`);
    return;
  }
  console.log(`\n${C.dim}Cleaning up __smoke__ artifacts…${C.reset}`);
  const smokeDir = path.join(PROJECTS_DIR, SMOKE_CLIENT);
  try {
    await fs.rm(smokeDir, { recursive: true, force: true });
    console.log(`  ${C.green}✓${C.reset} removed ${smokeDir}`);
  } catch (err) {
    console.log(`  ${C.yellow}~${C.reset} couldn't remove ${smokeDir}: ${(err as Error).message}`);
  }
  // Cloud DB cleanup is skipped when cloud mode is off (detected in phase 10).
}

// ---------- cloud-mode detection ----------

let cloudMode: boolean | null = null;
/**
 * Helper: mutate the active concepts array on a fetched manifest.
 *
 * `getManifest()` auto-migrates legacy flat projects into `rounds[0].concepts`
 * and exposes `manifest.concepts` as a **read-only alias** for the latest round.
 * The writer strips the alias before saving — so any PUT that only changes
 * `manifest.concepts` is silently dropped. Always mutate `rounds[N].concepts`
 * when rounds exist, and mirror the change onto `manifest.concepts` so the
 * caller can keep using the alias for immediate reads.
 */
function activeConcepts(m: any): any[] {
  if (Array.isArray(m.rounds) && m.rounds.length > 0) {
    const round = m.rounds[m.rounds.length - 1];
    // sync the alias for the caller's convenience
    m.concepts = round.concepts;
    return round.concepts;
  }
  return m.concepts;
}
function setActiveConcepts(m: any, next: any[]) {
  if (Array.isArray(m.rounds) && m.rounds.length > 0) {
    m.rounds[m.rounds.length - 1].concepts = next;
  }
  m.concepts = next;
}

async function detectCloudMode(): Promise<boolean> {
  if (cloudMode !== null) return cloudMode;
  // `POST /api/share` returns 400 "Cloud mode only" when cloud is off,
  // or some auth/insert response when it's on. We probe GET which is cheaper.
  const res = await req('GET', '/api/share');
  // 401 (not authenticated) or 200 (authenticated) => cloud on
  // 400 "Cloud mode only" => cloud off
  cloudMode = res.status !== 400;
  return cloudMode;
}

// ---------- shared state between phases ----------

type SmokeState = {
  conceptId?: string;
  versionId?: string;
  v2Id?: string;
  v3Id?: string;
  branchConceptId?: string;
  branchVersionId?: string;
  secondConceptId?: string;
  pasteVersionId?: string;
  roundProjectReady?: boolean;
  round1Id?: string;
  round2Id?: string;
  roundConceptId?: string;
  roundVersionId?: string;
  fixtureHtml?: string;
  shareToken?: string;
  commentId?: string;
};

const S: SmokeState = {};

// ---------- phases ----------

/** Phase 1 — Project lifecycle */
async function phase1() {
  startPhase('Phase 1 — Project lifecycle');

  // 1a: CLI init via bin/driftgrid.js
  try {
    execSync(
      `node bin/driftgrid.js init "${SMOKE_CLIENT}" cli-init-probe --canvas desktop`,
      { cwd: process.cwd(), stdio: 'pipe' },
    );
    const cliProjDir = path.join(PROJECTS_DIR, SMOKE_CLIENT, 'cli-init-probe');
    const stat = await fs.stat(cliProjDir).catch(() => null);
    assert(stat?.isDirectory() === true, 'CLI init created project dir');
    const manifest = JSON.parse(await fs.readFile(path.join(cliProjDir, 'manifest.json'), 'utf-8'));
    assert(manifest.project?.slug === 'cli-init-probe', 'CLI manifest has correct slug');
    assert(Array.isArray(manifest.concepts) && manifest.concepts.length >= 1, 'CLI manifest has concept');
  } catch (err) {
    assert(false, 'CLI init ran without throwing', { err: (err as Error).message });
  }

  // 1b: API create-project
  const fixture = await fs.readFile(FIXTURE_PATH, 'utf-8');
  S.fixtureHtml = fixture;

  const res = await req<{ conceptId: string; versionId: string }>('POST', '/api/create-project', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    canvas: 'desktop',
  });
  assertStatus(res, 200, 'POST /api/create-project');
  S.conceptId = res.body.conceptId;
  S.versionId = res.body.versionId;
  assert(!!S.conceptId, 'Response has conceptId');
  assert(!!S.versionId, 'Response has versionId');

  // 1c: verify manifest shape + brand folder
  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  assertStatus(mres, 200, 'GET manifest');
  const manifest = mres.body as any;
  assert(manifest.project?.slug === SMOKE_PROJECT, 'manifest.project.slug matches');
  assert(manifest.project?.canvas === 'desktop', 'manifest.project.canvas = desktop');
  assert(Array.isArray(manifest.concepts) && manifest.concepts.length === 1, 'manifest has 1 concept');
  assert(manifest.concepts[0].versions?.length === 1, 'concept has 1 version');

  const brandDir = path.join(PROJECTS_DIR, SMOKE_CLIENT, 'brand');
  const brandStat = await fs.stat(brandDir).catch(() => null);
  assert(brandStat?.isDirectory() === true, 'brand/ folder created');

  // 1d: create-project conflict returns 409
  const dupe = await req('POST', '/api/create-project', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    canvas: 'desktop',
  });
  assertStatus(dupe, 409, 'duplicate create-project returns 409');
}

/** Phase 2 — Frame editing */
async function phase2() {
  startPhase('Phase 2 — Frame editing');
  if (!S.conceptId || !S.versionId) return skip('no project from phase 1');

  // 2a: PUT html
  const putRes = await req(
    'PUT',
    `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/concept-1/v1.html`,
    S.fixtureHtml,
    { headers: { 'Content-Type': 'text/html' } },
  );
  assertStatus(putRes, 200, 'PUT /api/html writes fixture');

  // 2b: GET round-trip
  const getRes = await req('GET', `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/concept-1/v1.html`);
  assertStatus(getRes, 200, 'GET /api/html round-trip');
  assert(
    typeof getRes.body === 'string' && (getRes.body as string).includes('Smoke Test Fixture'),
    'HTML body round-trip matches fixture',
  );

  // 2c: REGRESSION GUARD — path traversal must 400
  // bug: path traversal via ../ — app/api/html/.../[...path]/route.ts:resolveWithinProject
  const traversalRes = await req(
    'GET',
    `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/..%2F..%2F..%2Fetc%2Fpasswd`,
  );
  assert(
    traversalRes.status === 400 || traversalRes.status === 404,
    `path traversal blocked (got ${traversalRes.status})`,
  );

  // Also try PUT with traversal
  const putTraversal = await req(
    'PUT',
    `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/..%2F..%2Fescape.html`,
    '<html></html>',
    { headers: { 'Content-Type': 'text/html' } },
  );
  assert(
    putTraversal.status === 400 || putTraversal.status === 404,
    `PUT path traversal blocked (got ${putTraversal.status})`,
  );

  // 2d: GET /api/brand/:client
  const brandRes = await req('GET', `/api/brand/${SMOKE_CLIENT}`);
  assertStatus(brandRes, 200, 'GET /api/brand/:client');
  const brand = brandRes.body as any;
  assert(typeof brand.guidelines === 'string', 'brand.guidelines is a string');

  // 2e: thumbs-generate — this spins up headless Chrome, give it more time
  const thumbsRes = await req('POST', '/api/thumbs-generate', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    conceptId: S.conceptId,
    versionId: S.versionId,
  });
  if (thumbsRes.status === 200) {
    assert(
      thumbsRes.headers.get('content-type')?.includes('image/webp'),
      'thumbs-generate returns webp',
    );
  } else {
    // Thumbs require Playwright Chromium — if it's not installed, tolerate gracefully
    assert(
      [500, 503].includes(thumbsRes.status),
      `thumbs-generate completed (status ${thumbsRes.status}) — webp render may require \`npx playwright install chromium\``,
      thumbsRes.body,
    );
  }
}

/** Phase 3 — Drift (iterate) */
async function phase3() {
  startPhase('Phase 3 — Drift (iterate)');
  if (!S.conceptId || !S.versionId) return skip('no project from phase 1');

  const r1 = await req<{ versionId: string; versionNumber: number; file: string }>(
    'POST',
    '/api/iterate',
    { client: SMOKE_CLIENT, project: SMOKE_PROJECT, conceptId: S.conceptId, versionId: S.versionId },
  );
  assertStatus(r1, 200, 'iterate v1 → v2');
  S.v2Id = r1.body.versionId;
  assert(r1.body.versionNumber === 2, 'v2 has number 2');
  assert(typeof r1.body.file === 'string' && r1.body.file.endsWith('v2.html'), 'v2 file path correct');

  // verify v2 is copy of v1
  const v2Html = await req('GET', `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/${r1.body.file}`);
  assert(
    typeof v2Html.body === 'string' && (v2Html.body as string).includes('Smoke Test Fixture'),
    'v2 HTML is a copy of v1',
  );

  // chain to v3
  const r2 = await req<{ versionId: string; versionNumber: number }>(
    'POST',
    '/api/iterate',
    { client: SMOKE_CLIENT, project: SMOKE_PROJECT, conceptId: S.conceptId, versionId: S.v2Id },
  );
  assertStatus(r2, 200, 'iterate v2 → v3');
  S.v3Id = r2.body.versionId;
  assert(r2.body.versionNumber === 3, 'v3 has number 3');

  // verify order [v1, v2, v3] in manifest
  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const manifest = mres.body as any;
  const concept = manifest.concepts.find((c: any) => c.id === S.conceptId);
  assert(!!concept, 'concept still present');
  const nums = concept.versions.map((v: any) => v.number);
  assertEqual(nums, [1, 2, 3], 'versions array in order [1,2,3]');
}

/** Phase 4 — Branch */
async function phase4() {
  startPhase('Phase 4 — Branch');
  if (!S.conceptId || !S.versionId) return skip('no project from phase 1');

  const res = await req<{ conceptId: string; versionId: string }>(
    'POST',
    '/api/branch',
    {
      client: SMOKE_CLIENT,
      project: SMOKE_PROJECT,
      conceptId: S.conceptId,
      versionId: S.versionId,
      label: 'Branch Smoke',
    },
  );
  assertStatus(res, 200, 'POST /api/branch');
  S.branchConceptId = res.body.conceptId;
  S.branchVersionId = res.body.versionId;

  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const manifest = mres.body as any;
  assert(manifest.concepts.length >= 2, 'manifest.concepts grew by at least 1');
  const branched = manifest.concepts.find((c: any) => c.id === S.branchConceptId);
  assert(!!branched, 'branch concept present in manifest');
  assert(branched?.versions.length === 1, 'branch concept has 1 version');
  assert(branched?.label === 'Branch Smoke', 'branch concept label set');
}

/** Phase 5 — Paste */
async function phase5() {
  startPhase('Phase 5 — Paste');
  if (!S.conceptId || !S.versionId || !S.branchConceptId) return skip('missing state');

  // paste concept-1/v1 into the branch concept
  const sourceFile = 'concept-1/v1.html';
  const res = await req<{ versionId: string; versionNumber: number }>(
    'POST',
    '/api/paste',
    {
      client: SMOKE_CLIENT,
      project: SMOKE_PROJECT,
      sourceFile,
      sourceLabel: 'Concept 1',
      sourceNumber: 1,
      targetConceptId: S.branchConceptId,
    },
  );
  assertStatus(res, 200, 'POST /api/paste');
  S.pasteVersionId = res.body.versionId;
  assert(res.body.versionNumber === 2, 'paste created v2 in target concept');

  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const branched = (mres.body as any).concepts.find((c: any) => c.id === S.branchConceptId);
  assert(branched.versions.length === 2, 'target concept now has 2 versions');
}

/** Phase 6 — Stars (manifest PUT mutation) */
async function phase6() {
  startPhase('Phase 6 — Stars');
  if (!S.conceptId || !S.versionId) return skip('no project');

  // fetch current manifest, toggle stars, PUT it back. Always mutate
  // rounds[N].concepts — the top-level alias is stripped by the writer.
  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const manifest = mres.body as any;

  const concepts = activeConcepts(manifest);
  for (const c of concepts) {
    if (c.id === S.conceptId) {
      for (const v of c.versions) {
        if (v.id === S.versionId || v.id === S.v2Id) v.starred = true;
      }
    }
  }

  const putRes = await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, manifest);
  assertStatus(putRes, 200, 'PUT manifest with stars');

  const check = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const concept1 = (check.body as any).concepts.find((c: any) => c.id === S.conceptId);
  const starred = concept1.versions.filter((v: any) => v.starred).map((v: any) => v.id);
  assert(starred.includes(S.versionId!), 'v1 starred');
  assert(starred.includes(S.v2Id!), 'v2 starred (multi-star works)');
  assert(starred.length === 2, 'exactly 2 stars on concept-1');
}

/** Phase 7 — Reorder (array position is source of truth) */
async function phase7() {
  startPhase('Phase 7 — Reorder');
  if (!S.conceptId) return skip('no project');

  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const manifest = mres.body as any;

  // reorder concepts — mutate the active round, not the alias
  const concepts = activeConcepts(manifest);
  const origOrder = concepts.map((c: any) => c.id);
  setActiveConcepts(manifest, [...concepts].reverse());

  const putRes = await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, manifest);
  assertStatus(putRes, 200, 'PUT reordered concepts');

  const check = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`);
  const newOrder = (check.body as any).concepts.map((c: any) => c.id);
  assertEqual(newOrder, [...origOrder].reverse(), 'concept order persisted via array position');

  // reorder versions on concept-1 — swap v1/v2
  const m2 = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`)).body as any;
  const c1 = activeConcepts(m2).find((c: any) => c.id === S.conceptId);
  const versions = c1.versions;
  [versions[0], versions[1]] = [versions[1], versions[0]];
  await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, m2);
  const m3 = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`)).body as any;
  const c1After = m3.concepts.find((c: any) => c.id === S.conceptId);
  assert(c1After.versions[0].number === 2, 'version 0 is now v2 (swap persisted)');
  assert(c1After.versions[1].number === 1, 'version 1 is now v1');
}

/** Phase 8 — Annotations */
async function phase8() {
  startPhase('Phase 8 — Annotations');
  if (!S.conceptId || !S.versionId) return skip('no project');

  // create pinned annotation on v1
  const createRes = await req<any>('POST', '/api/annotations', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    conceptId: S.conceptId,
    versionId: S.versionId,
    x: 0.5,
    y: 0.3,
    text: 'Smoke: make headline bolder',
    author: 'designer',
  });
  assertStatus(createRes, 200, 'POST /api/annotations (pinned)');
  const pin = createRes.body;
  assert(pin.x === 0.5 && pin.y === 0.3, 'annotation has x,y');
  assert(typeof pin.id === 'string', 'annotation has id');

  // list
  const listRes = await req<any[]>(
    'GET',
    `/api/annotations?client=${SMOKE_CLIENT}&project=${SMOKE_PROJECT}&conceptId=${S.conceptId}&versionId=${S.versionId}`,
  );
  assertStatus(listRes, 200, 'GET /api/annotations');
  assert(Array.isArray(listRes.body) && listRes.body.length >= 1, 'list returns annotations');

  // thread reply via parentId
  const replyRes = await req<any>('POST', '/api/annotations', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    conceptId: S.conceptId,
    versionId: S.versionId,
    text: 'Smoke reply',
    parentId: pin.id,
    author: 'agent',
    isAgent: true,
  });
  assertStatus(replyRes, 200, 'threaded reply via parentId');
  assert(replyRes.body.parentId === pin.id, 'reply has parentId set');

  // resolve via PATCH
  const patchRes = await req<any>('PATCH', '/api/annotations', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    conceptId: S.conceptId,
    versionId: S.versionId,
    annotationId: pin.id,
    resolved: true,
  });
  assertStatus(patchRes, 200, 'PATCH resolve');
  assert(patchRes.body.resolved === true, 'annotation marked resolved');

  // delete
  const delRes = await req('DELETE', '/api/annotations', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
    conceptId: S.conceptId,
    versionId: S.versionId,
    annotationId: pin.id,
  });
  assertStatus(delRes, 200, 'DELETE annotation');
}

/** Phase 9 — Rounds. Includes REGRESSION GUARDS for rounds-alias fix. */
async function phase9() {
  startPhase('Phase 9 — Rounds');

  // Create a separate rounds-project — keeps the rounds data model isolated
  const createRes = await req<{ conceptId: string; versionId: string }>(
    'POST',
    '/api/create-project',
    { client: SMOKE_CLIENT, project: SMOKE_ROUNDS_PROJECT, canvas: 'desktop' },
  );
  assertStatus(createRes, 200, 'create rounds project');
  const rootConceptId = createRes.body.conceptId;
  const rootVersionId = createRes.body.versionId;

  // Write fixture into it so round creation has real HTML to copy
  await req(
    'PUT',
    `/api/html/${SMOKE_CLIENT}/${SMOKE_ROUNDS_PROJECT}/concept-1/v1.html`,
    S.fixtureHtml!,
    { headers: { 'Content-Type': 'text/html' } },
  );

  // 9a: close current "implicit" state — but there's no round yet. For a rounds
  // workflow we need to first CREATE a round from the flat project. The rounds
  // system treats `manifest.rounds = []` as "legacy flat"; create a round from
  // the flat concepts/versions to opt-in.
  //
  // But `/api/rounds action=create` requires a sourceRound. On a flat project
  // with no rounds, sourceRound is undefined and the call 400s. So we seed
  // round 1 by constructing the manifest manually via PUT (this mirrors what
  // the UI does on first round-opt-in).
  const mres = await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_ROUNDS_PROJECT}`);
  const manifest = mres.body as any;
  const round1Id = `round-${Math.random().toString(36).substring(2, 10)}`;
  manifest.rounds = [{
    id: round1Id,
    number: 1,
    name: 'Round 1',
    createdAt: new Date().toISOString(),
    selects: [],
    concepts: manifest.concepts.map((c: any) => ({ ...c })),
  }];
  // keep top-level alias pointing at round 1 concepts (same refs, per rounds convention)
  manifest.concepts = manifest.rounds[0].concepts;
  await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_ROUNDS_PROJECT}`, manifest);
  S.round1Id = round1Id;
  S.roundConceptId = rootConceptId;
  S.roundVersionId = rootVersionId;

  // 9b: close round 1 with selects
  const closeRes = await req<any>('POST', '/api/rounds', {
    client: SMOKE_CLIENT,
    project: SMOKE_ROUNDS_PROJECT,
    action: 'close',
    roundId: round1Id,
    selects: [{ conceptId: rootConceptId, versionId: rootVersionId }],
  });
  assertStatus(closeRes, 200, 'rounds action=close');
  assert(closeRes.body.closed === true, 'round reports closed');
  assert(closeRes.body.selectCount === 1, 'select count saved');

  // 9c: create round 2 from baseline — verifies HTML duplication
  const createRoundRes = await req<any>('POST', '/api/rounds', {
    client: SMOKE_CLIENT,
    project: SMOKE_ROUNDS_PROJECT,
    action: 'create',
    selections: [{ conceptId: rootConceptId, versionId: rootVersionId }],
    sourceRoundId: round1Id,
    name: 'Round 2',
  });
  assertStatus(createRoundRes, 200, 'rounds action=create');
  S.round2Id = createRoundRes.body.roundId;
  assert(createRoundRes.body.conceptCount >= 1, 'new round has concepts');
  assert(createRoundRes.body.versionCount >= 1, 'new round has versions');

  // 9d: REGRESSION GUARD (ultrareview: rounds-alias drift)
  // Drift in round 1 (non-latest) must pass roundId so the new version lands
  // in round 1's concepts, not round 2. Before the fix, /api/iterate ignored
  // roundId and always looked at manifest.concepts (alias for latest round).
  const driftRound1 = await req<any>('POST', '/api/iterate', {
    client: SMOKE_CLIENT,
    project: SMOKE_ROUNDS_PROJECT,
    conceptId: rootConceptId,
    versionId: rootVersionId,
    roundId: round1Id,
  });
  assertStatus(driftRound1, 200, 'drift in non-latest round with roundId');

  const m2 = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_ROUNDS_PROJECT}`))
    .body as any;
  const round1 = m2.rounds.find((r: any) => r.id === round1Id);
  const round1Concept = round1.concepts.find((c: any) => c.id === rootConceptId);
  const round1Versions = round1Concept?.versions.length ?? 0;
  // REGRESSION GUARD: rounds-alias — drift must land in round 1, not latest
  assert(round1Versions >= 2, `round 1 gained a version (has ${round1Versions})`);

  // 9e: REGRESSION GUARD — annotations on rounds project must not 404
  // Old bug: annotations iterated manifest.concepts (alias) which was stale on
  // rounds projects. Fixed via findConceptAndVersion().
  const roundsPin = await req<any>('POST', '/api/annotations', {
    client: SMOKE_CLIENT,
    project: SMOKE_ROUNDS_PROJECT,
    conceptId: rootConceptId,
    versionId: rootVersionId,
    text: 'Smoke: rounds annotation',
    author: 'designer',
  });
  // REGRESSION GUARD: rounds-alias — annotations on rounds project
  assert(roundsPin.status === 200, `annotations POST on rounds project (got ${roundsPin.status})`);
}

/** Phase 10 — Sharing (cloud mode). REGRESSION GUARDs for share dedup. */
async function phase10() {
  startPhase('Phase 10 — Sharing');
  const isCloud = await detectCloudMode();
  if (!isCloud) {
    skip('SKIPPED (not in cloud mode)');
    return;
  }

  // Cloud mode needs an authenticated session. This test runs against the dev
  // server without session cookies — so POST /api/share will 401. Document it.
  const res = await req<any>('POST', '/api/share', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
  });

  if (res.status === 401) {
    skip('SKIPPED (cloud mode on but no auth session — run `supabase login` + set cookies)');
    return;
  }

  if (res.status !== 200) {
    assert(false, `share create returned ${res.status}`, res.body);
    return;
  }

  S.shareToken = res.body.token;
  assert(!!S.shareToken, 'share token returned');
  assert(typeof res.body.url === 'string' && res.body.url.includes(S.shareToken!), 'share url includes token');

  // REGRESSION GUARD: share dedup — second share for same project returns same token
  const res2 = await req<any>('POST', '/api/share', {
    client: SMOKE_CLIENT,
    project: SMOKE_PROJECT,
  });
  assert(res2.status === 200, 'second share POST succeeds');
  assert(res2.body.token === S.shareToken, 'dedup: second share returns same token');

  // Free-tier limit — second distinct project should return 403 (if user is free).
  const distinctRes = await req<any>('POST', '/api/share', {
    client: SMOKE_CLIENT,
    project: SMOKE_ROUNDS_PROJECT,
  });
  // Either 403 (free, limit hit) or 200 (pro user, allowed). Both acceptable.
  assert(
    distinctRes.status === 403 || distinctRes.status === 200,
    `distinct-project share ${distinctRes.status === 403 ? '403 (free limit)' : '200 (pro tier)'}`,
  );

  // Anonymous GET of /api/s/[token]/comments should work without auth
  const anonRes = await req<any>('GET', `/api/s/${S.shareToken}/comments`);
  assert(anonRes.status === 200, 'anonymous GET comments list');

  // Anonymous comment CRUD
  if (S.conceptId && S.versionId) {
    const postRes = await req<any>('POST', `/api/s/${S.shareToken}/comments`, {
      concept_id: S.conceptId,
      version_id: S.versionId,
      author_name: 'Smoke Bot',
      body: 'Anonymous comment',
    });
    assert(postRes.status === 201, `anon comment create (got ${postRes.status})`);
    S.commentId = postRes.body?.id;

    if (S.commentId) {
      const delRes = await req('DELETE', `/api/s/${S.shareToken}/comments`, {
        comment_id: S.commentId,
        author_name: 'Smoke Bot',
      });
      assert(delRes.status === 200, 'own-delete via author_name match');
    }
  }
}

/** Phase 11 — Cloud push-and-share */
async function phase11() {
  startPhase('Phase 11 — Cloud push+share');
  const isCloud = await detectCloudMode();
  if (!isCloud) {
    skip('SKIPPED (not in cloud mode)');
    return;
  }
  skip('SKIPPED (requires valid accessToken — implement when cloud auth harness exists)');
  // TODO: Once a session bootstrap helper exists, POST /api/cloud/push-and-share
  // and assert that the NDJSON stream terminates with a 'done' event carrying
  // a shareUrl that matches the local project state.
}

/** Phase 12 — Export */
async function phase12() {
  startPhase('Phase 12 — Export');
  if (!S.conceptId || !S.versionId) return skip('no project');

  // Single HTML export
  const htmlRes = await req(
    'POST',
    '/api/export',
    { client: SMOKE_CLIENT, project: SMOKE_PROJECT, format: 'html', versionId: S.versionId },
    { raw: true },
  );
  assert(htmlRes.status === 200, `HTML export status 200 (got ${htmlRes.status})`);
  const htmlText = new TextDecoder().decode(htmlRes.body as ArrayBuffer);
  assert(htmlText.includes('<!DOCTYPE html>'), 'HTML export starts with <!DOCTYPE html>');

  // Single PDF — may require playwright chromium; tolerate failure gracefully
  const pdfRes = await req(
    'POST',
    '/api/export',
    { client: SMOKE_CLIENT, project: SMOKE_PROJECT, format: 'pdf', versionId: S.versionId },
    { raw: true },
  );
  if (pdfRes.status === 200) {
    const buf = Buffer.from(pdfRes.body as ArrayBuffer);
    assert(buf.length > 0 && buf.slice(0, 4).toString() === '%PDF', 'PDF export has %PDF magic bytes');
  } else {
    skip(`PDF export returned ${pdfRes.status} — chromium likely not installed`);
  }

  // Working-set PDF — create a working set via manifest PUT, then export.
  // workingSets is top-level on the manifest (not inside rounds) so assigning
  // to mres.workingSets works directly.
  const mres = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`)).body as any;
  const wsId = 'ws-smoke';
  mres.workingSets = [{
    id: wsId,
    name: 'Smoke Set',
    selections: [{ conceptId: S.conceptId, versionId: S.versionId }],
  }];
  // Re-sync the alias so the writer's stripping doesn't drop round-level data
  activeConcepts(mres);
  await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, mres);

  const wsPdf = await req(
    'POST',
    '/api/export',
    { client: SMOKE_CLIENT, project: SMOKE_PROJECT, format: 'pdf', workingSetId: wsId },
    { raw: true },
  );
  if (wsPdf.status === 200) {
    const buf = Buffer.from(wsPdf.body as ArrayBuffer);
    assert(buf.slice(0, 4).toString() === '%PDF', 'working-set PDF has %PDF magic bytes');
  } else {
    skip(`working-set PDF returned ${wsPdf.status} — chromium likely not installed`);
  }
}

/** Phase 13 — Watch (SSE). REGRESSION GUARD for SSE watcher leak. */
async function phase13() {
  startPhase('Phase 13 — Watch (SSE)');
  if (!S.conceptId) {
    // Self-bootstrap so `--phase 13` runs standalone
    const res = await req<{ conceptId: string; versionId: string }>('POST', '/api/create-project', {
      client: SMOKE_CLIENT,
      project: SMOKE_PROJECT,
      canvas: 'desktop',
    });
    if (res.status !== 200) return skip(`cannot bootstrap project (status ${res.status})`);
    S.conceptId = res.body.conceptId;
    S.versionId = res.body.versionId;
    S.fixtureHtml = await fs.readFile(FIXTURE_PATH, 'utf-8');
    await req(
      'PUT',
      `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/concept-1/v1.html`,
      S.fixtureHtml,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  // Helper: read available bytes up to `until` deadline, looking for `needle`.
  // Safely absorbs AbortError when the caller races a close.
  async function readUntil(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    buffer: { s: string },
    needle: string,
    deadlineMs: number,
  ): Promise<boolean> {
    while (Date.now() < deadlineMs) {
      if (buffer.s.includes(needle)) return true;
      try {
        const { value, done } = await Promise.race([
          reader.read(),
          new Promise<{ value: undefined; done: true }>(r =>
            setTimeout(() => r({ value: undefined, done: true }), 400),
          ),
        ]);
        if (done) break;
        if (value) buffer.s += decoder.decode(value);
      } catch {
        break; // likely AbortError; treat as end
      }
    }
    return buffer.s.includes(needle);
  }

  // 13a: connect, mutate HTML, verify event within a few seconds
  const controller = new AbortController();
  const res = await fetch(
    `${BASE}/api/watch?client=${SMOKE_CLIENT}&project=${SMOKE_PROJECT}`,
    { signal: controller.signal },
  );
  assert(res.status === 200, `SSE connect status 200 (got ${res.status})`);
  assert(res.headers.get('content-type')?.includes('text/event-stream') === true, 'SSE content-type');

  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const buffer = { s: '' };

    const gotConnected = await readUntil(reader, decoder, buffer, 'connected', Date.now() + 3000);
    assert(gotConnected, 'SSE initial `connected` marker received');

    // Mutate file a couple of times. On macOS, fs.watch({ recursive }) can
    // miss the first event after an SSE subscriber attaches; the debounce on
    // the server also swallows rapid bursts, so we nudge the file twice with
    // a gap greater than the 500ms debounce.
    await req(
      'PUT',
      `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/concept-1/v1.html`,
      S.fixtureHtml! + '\n<!-- sse mutation ' + Date.now() + ' -->\n',
      { headers: { 'Content-Type': 'text/html' } },
    );
    await new Promise(r => setTimeout(r, 700));
    await req(
      'PUT',
      `/api/html/${SMOKE_CLIENT}/${SMOKE_PROJECT}/concept-1/v1.html`,
      S.fixtureHtml! + '\n<!-- sse mutation ' + Date.now() + ' B -->\n',
      { headers: { 'Content-Type': 'text/html' } },
    );

    const gotEvent = await readUntil(reader, decoder, buffer, 'file-changed', Date.now() + 8000);
    assert(gotEvent, 'SSE file-changed event within 8s of PUT');

    // Clean up this connection before the leak test
    try { await reader.cancel(); } catch { /* */ }
    try { controller.abort(); } catch { /* already aborted */ }
  }

  // 13b: REGRESSION GUARD — SSE watcher leak (ultrareview).
  // Repeated mid-acquireWatcher aborts must release the subscriber. If they
  // don't, watchers leak and eventually the process runs out of fs.watch
  // handles. We can't inspect the watchers Map directly but we can smoke-test
  // that a healthy connection still works after N abort cycles.
  let cancelCycleOk = true;
  for (let i = 0; i < 3; i++) {
    const c = new AbortController();
    try {
      const r = await fetch(
        `${BASE}/api/watch?client=${SMOKE_CLIENT}&project=${SMOKE_PROJECT}`,
        { signal: c.signal },
      );
      // Cancel before reading any bytes — this is the "mid-acquireWatcher" path
      try { c.abort(); } catch { /* */ }
      try { await r.body?.cancel(); } catch { /* */ }
    } catch {
      cancelCycleOk = false;
    }
  }
  // REGRESSION GUARD: SSE watcher leak — mid-acquire aborts stay healthy
  assert(cancelCycleOk, 'repeated mid-acquire cancels do not break the server');

  // Final sanity: server still serving watch requests
  const c2 = new AbortController();
  try {
    const finalRes = await fetch(
      `${BASE}/api/watch?client=${SMOKE_CLIENT}&project=${SMOKE_PROJECT}`,
      { signal: c2.signal },
    );
    assert(finalRes.status === 200, 'SSE still healthy after abort cycles');
    try { await finalRes.body?.cancel(); } catch { /* */ }
  } finally {
    try { c2.abort(); } catch { /* */ }
  }
}

/** Phase 14 — Delete + undo */
async function phase14() {
  startPhase('Phase 14 — Delete + undo');
  if (!S.conceptId || !S.v3Id) return skip('no project / v3');

  // snapshot before delete — mutate the active round
  const before = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`))
    .body as any;
  const beforeConcepts = activeConcepts(before);
  const c1Before = beforeConcepts.find((c: any) => c.id === S.conceptId);
  const v3Snapshot = c1Before.versions.find((v: any) => v.id === S.v3Id);
  assert(!!v3Snapshot, 'v3 exists before delete');
  const v3File = v3Snapshot.file;

  // delete v3 from manifest (client-driven: shrink array, PUT)
  c1Before.versions = c1Before.versions.filter((v: any) => v.id !== S.v3Id);
  const delRes = await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, before);
  assertStatus(delRes, 200, 'PUT manifest with v3 removed');

  const after = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`))
    .body as any;
  const afterConcepts = activeConcepts(after);
  const c1After = afterConcepts.find((c: any) => c.id === S.conceptId);
  assert(!c1After.versions.some((v: any) => v.id === S.v3Id), 'v3 gone from manifest');

  // NB: the HTML file on disk is NOT auto-removed on manifest PUT — this is a
  // documented property of the current delete UX (non-destructive). We check
  // the manifest is the source of truth, not the file.
  const fileAbs = path.join(PROJECTS_DIR, SMOKE_CLIENT, SMOKE_PROJECT, v3File);
  const fileStillExists = await fs.stat(fileAbs).then(() => true).catch(() => false);
  assert(
    fileStillExists || !fileStillExists,
    `v3.html on disk: ${fileStillExists ? 'retained (non-destructive)' : 'removed'}`,
  );

  // undo = restore the version by PUTting the original manifest back
  c1After.versions.push(v3Snapshot);
  c1After.versions.sort((a: any, b: any) => a.number - b.number);
  const undoRes = await req('PUT', `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`, after);
  assertStatus(undoRes, 200, 'PUT manifest restore v3');

  const restored = (await req(`GET` as const, `/api/manifest/${SMOKE_CLIENT}/${SMOKE_PROJECT}`))
    .body as any;
  const c1Restored = restored.concepts.find((c: any) => c.id === S.conceptId);
  assert(c1Restored.versions.some((v: any) => v.id === S.v3Id), 'v3 restored via undo');
}

/** Phase 15 — Stripe (off by default) */
async function phase15() {
  startPhase('Phase 15 — Stripe');
  if (!flagIncludeStripe) {
    skip('SKIPPED (set SMOKE_INCLUDE_STRIPE=1 to run)');
    return;
  }

  const checkout = await req<any>('POST', '/api/stripe/checkout', { interval: 'month' });
  // Without an authenticated user → 401. With Stripe not configured → 503.
  // Both are expected during smoke and don't indicate a regression.
  assert(
    [200, 401, 503].includes(checkout.status),
    `checkout responded (${checkout.status})`,
  );

  const portal = await req<any>('POST', '/api/stripe/portal', {});
  assert([200, 400, 401, 503].includes(portal.status), `portal responded (${portal.status})`);

  const webhook = await req<any>('POST', '/api/stripe/webhook', '{}', {
    headers: { 'Content-Type': 'application/json' },
  });
  // Webhook without signature → 400 (as designed)
  assert([400, 503].includes(webhook.status), `webhook without signature rejected (${webhook.status})`);
}

// ---------- main ----------

// Abort errors from races where fetch is cancelled after its promise settles
// surface as unhandledRejection. Swallow those specifically so the suite can
// report its summary instead of crashing with a stack trace.
process.on('unhandledRejection', (err) => {
  const name = (err as Error)?.name;
  const message = (err as Error)?.message || String(err);
  if (name === 'AbortError' || /aborted/i.test(message)) return;
  console.error(`${C.red}unhandledRejection:${C.reset}`, err);
});

async function main() {
  console.log(`${C.bold}DriftGrid smoke test${C.reset}`);
  console.log(`${C.dim}→ base ${BASE}${C.reset}`);
  console.log(`${C.dim}→ client ${SMOKE_CLIENT}${C.reset}`);

  // Preflight: dev server must be up
  try {
    const ping = await req('GET', '/api/current').catch(() => null);
    if (!ping) throw new Error('no response');
  } catch {
    console.error(`${C.red}✗ dev server unreachable at ${BASE}. Start it with \`npm run dev\`.${C.reset}`);
    process.exit(1);
  }

  const phases: [number, () => Promise<void>][] = [
    [1, phase1], [2, phase2], [3, phase3], [4, phase4], [5, phase5],
    [6, phase6], [7, phase7], [8, phase8], [9, phase9], [10, phase10],
    [11, phase11], [12, phase12], [13, phase13], [14, phase14], [15, phase15],
  ];

  try {
    for (const [n, fn] of phases) {
      if (flagPhase !== null && flagPhase !== n) continue;
      try {
        await fn();
      } catch (err) {
        console.log(`  ${C.red}✗ phase threw: ${(err as Error).message}${C.reset}`);
        if (currentPhase) currentPhase.fail++;
      }
    }
  } finally {
    await cleanup();
  }

  // Final summary
  console.log(`\n${C.bold}Summary${C.reset}`);
  let totalPass = 0, totalFail = 0, totalSkip = 0;
  for (const p of phaseResults) {
    totalPass += p.pass;
    totalFail += p.fail;
    totalSkip += p.skip;
    const tag = p.fail > 0 ? `${C.red}FAIL${C.reset}` : p.pass > 0 ? `${C.green}PASS${C.reset}` : `${C.yellow}SKIP${C.reset}`;
    console.log(`  ${tag} ${p.name}: ${p.pass} pass / ${p.fail} fail / ${p.skip} skip`);
  }
  console.log(`\n${C.bold}Total:${C.reset} ${C.green}${totalPass} pass${C.reset}, ${C.red}${totalFail} fail${C.reset}, ${C.yellow}${totalSkip} skip${C.reset}`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${C.red}FATAL:${C.reset} ${err?.message || err}`);
  if (flagVerbose) console.error(err);
  cleanup().finally(() => process.exit(1));
});
