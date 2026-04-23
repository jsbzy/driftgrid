# DriftGrid Smoke Test

API-level smoke suite that exercises every DriftGrid endpoint in a realistic
user flow. It creates a throwaway project under `__smoke__/`, runs through
15 phases, and cleans up — pass before every beta release.

## How to run

1. Start the dev server in a separate terminal:
   ```bash
   cd /Users/jeffbzy/driftgrid && npm run dev
   ```
2. In another terminal, run the suite:
   ```bash
   cd /Users/jeffbzy/driftgrid && npm run smoke
   ```

Exit code `0` if every phase passed, `1` otherwise. A summary table prints
at the end regardless.

### Flags

| flag | effect |
|---|---|
| `-- --phase <N>` | run only phase N (e.g. `npm run smoke -- --phase 9`) |
| `-- --verbose` | dump response bodies on failure |
| `-- --no-cleanup` | leave `projects/__smoke__/` in place to inspect |
| `SMOKE_INCLUDE_STRIPE=1` env | run the Stripe phase (skipped by default) |
| `SMOKE_BASE_URL=...` env | target a non-localhost dev server |

## What it tests

1. **Project lifecycle** — CLI init + `POST /api/create-project`, manifest shape, brand folder, 409 on duplicate
2. **Frame editing** — `PUT`/`GET /api/html/...`, path-traversal guard (**regression**), `GET /api/brand/:client`, `POST /api/thumbs-generate`
3. **Drift** — `POST /api/iterate` chained v1 → v2 → v3, verifies copy-of-source + array order
4. **Branch** — `POST /api/branch` forks into a new concept
5. **Paste** — `POST /api/paste` copies a version into a target concept
6. **Stars** — manifest PUT mutation, multi-star across a column, Set semantics
7. **Reorder** — concept reorder + within-column version reorder via manifest PUT (array position = source of truth)
8. **Annotations** — create pinned, list, thread reply via `parentId`, resolve via PATCH, delete
9. **Rounds** — opt-in to rounds, `action=close` with selects, `action=create` duplicates HTML, drift in **non-latest** round via `roundId` (**regression**), annotations on a rounds project (**regression**)
10. **Sharing** — `POST /api/share` dedup (same project returns same token, **regression**), free-tier limit, anon GET/POST/DELETE `/api/s/[token]/comments`
11. **Cloud push-and-share** — TODO stub; skips when not in cloud mode or no auth session
12. **Export** — single HTML, single PDF, working-set multi-page PDF; magic-byte check on binaries
13. **Watch (SSE)** — connect, mutate file, assert `file-changed` event within 2s, then abort-cycle to guard the **SSE watcher leak** (**regression**)
14. **Delete + undo** — delete version via manifest PUT (manifest shrinks), undo by PUTting it back
15. **Stripe** — checkout, portal, webhook without signature; opt-in via `SMOKE_INCLUDE_STRIPE=1`

### Regression guards

Tests flagged as `REGRESSION GUARD` in `bin/smoke.ts` comments exist to catch
specific bugs that shipped and were fixed. Don't delete these — if the guard
starts failing, it means the original bug is back:

- **path traversal** — frame-editing route must reject `..` in the file path
- **share dedup** — repeat `POST /api/share` for the same `(client, project)` must return the same token
- **rounds-alias** — drift / annotations on a rounds project must resolve the correct round, not fall through to the stale `manifest.concepts` alias
- **SSE watcher leak** — repeated mid-acquire aborts must not pin the fs watcher

## How to add a case

Each phase is a plain async function. To add a case to an existing phase:

```ts
async function phase3() {
  startPhase('Phase 3 — Drift (iterate)');
  // …existing calls…
  const res = await req('POST', '/api/iterate', { /* … */ });
  assertStatus(res, 200, 'iterate returns 200');
  assert(res.body.versionId === 'v2', 'returned versionId is v2');
}
```

- `assert(cond, message, context?)` — boolean check; `context` gets dumped on `--verbose`
- `assertEqual(a, b, message)` — deep-equal via `JSON.stringify`
- `assertStatus(res, code, label)` — HTTP status check
- `skip(message)` — logged as yellow `~`, counted separately

To add a new phase: write an async function, register it in the `phases` array
in `main()`, and give it a number. Keep phase functions independent so
`--phase N` runs any one of them in isolation (shared state between phases is
allowed, but each phase should gracefully `skip()` when prerequisites are missing).

## Cleanup

Runs in a `finally` block. Deletes `projects/__smoke__/` recursively. On cloud
mode (phase 10+) this would also need to DELETE share_links rows where
`client LIKE '__smoke__%'` — currently skipped while cloud mode is off locally.
Pass `--no-cleanup` to inspect artifacts after a run.

## Known limitations

- Phase 11 (cloud push-and-share) is a stub — needs a session-bootstrap helper
  that mints an `accessToken` / `refreshToken` pair so the NDJSON stream can be
  consumed end-to-end.
- Phase 10 (sharing) requires cloud mode + an authenticated cookie in the dev
  server. It self-skips when neither is present.
- Thumbnail + PDF/PPTX tests tolerate a `500` if Playwright chromium isn't
  installed (`npx playwright install chromium`) — they don't hard-fail, they
  log a yellow skip with the reason.
