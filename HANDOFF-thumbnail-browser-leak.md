# HANDOFF — Thumbnail generation leaks headless Chromium (tanks the machine)

**Severity:** High (developer-machine DoS). DriftGrid itself stays "up" but the host gets starved and every page spins/Times out.

**TL;DR:** `lib/thumbnails.ts → generateThumbnail()` launches a fresh Chromium **per thumbnail**, with **no `try/finally`**, waiting on **`networkidle`**. Our boards load Google Fonts via `<link>`, so `networkidle` can hang; when it does, `browser.close()` is never reached and the Chromium (plus its renderer/GPU helper processes) is orphaned. Across a heavy session (24 versions × ~20 `--force` runs) this leaked hundreds of processes and pushed system load to ~177, at which point the dev server (`localhost:3000`) became unusable.

---

## Symptom (observed 2026-06-04)
- After many `npm run generate-thumbs -- recovryai promo-film-hifi --force` runs, `localhost:3000` pages took 15–36s or never finished ("not loading" / spinner).
- `lsof -ti:3000` was UP and `curl` returned 200, but slowly — so it was **not** a server crash.
- `uptime` showed **load average 177** (healthy is < ~10). No node/next processes were the cause.
- Killing stray browsers dropped load 177 → 44 and made the server instant again (admin 77ms, board 19ms):
  ```bash
  pkill -9 -f -- "--headless"; pkill -9 -f ms-playwright; pkill -9 -f playwright
  # NOTE: this does NOT kill a normal GUI Chrome — that process has no --headless flag.
  ```

---

## Root cause (confirmed in code)

`/Users/jeffbzy/driftgrid/lib/thumbnails.ts`:
```ts
import { chromium } from 'playwright';
import sharp from 'sharp';

export async function generateThumbnail(htmlPath, outputPath, width, height): Promise<void> {
  const browser = await chromium.launch();              // (1) NEW browser PER thumbnail
  const page = await browser.newPage({ viewport: {...}, deviceScaleFactor: 3 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });  // (2) can HANG on Google Fonts <link>
  const pngBuffer = await page.screenshot({ type: 'png' });
  await browser.close();                                 // (3) only runs if nothing above throws/hangs
  await sharp(pngBuffer).webp({ quality: 85 }).toFile(outputPath);
}
```
Three compounding issues:
1. **Browser-per-thumbnail.** `scripts/generate-thumbnails.ts` calls this in a loop over every version (24 in this project), so one `--force` run = 24 full Chromium launches.
2. **No `try/finally`.** If `goto`/`screenshot` throws or times out, `browser.close()` is skipped → orphaned browser.
3. **`waitUntil: 'networkidle'`.** All boards include `<link href="https://fonts.googleapis.com/...">`. `networkidle` waits for 500ms of network silence and is flaky with font/keepalive requests; it can hang to the default timeout (or beyond), which both slows the run and triggers (2).

Net effect: leaked Chromium accumulates across runs until the host thrashes.

---

## Fix plan

1. **Reuse one browser per run.** Launch Chromium once, render each thumbnail in its own `page` (closed after each), close the browser once at the end.
2. **Guarantee cleanup with `try/finally`** at both levels (per-page and per-browser), so a throw/timeout still closes everything.
3. **Stop using `networkidle`.** Use `waitUntil: 'load'` + an explicit font wait, with a bounded timeout:
   ```ts
   page.setDefaultTimeout(20000);
   await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
   await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
   ```
4. **Handle signals.** On `SIGINT`/`SIGTERM` and uncaught errors in the script, close the browser before exit.
5. **Audit other Playwright callers** — same pattern likely exists in the PDF export / share-render path. Grep and fix all of them:
   ```bash
   grep -rn "chromium.launch\|playwright\|puppeteer\|generateThumbnail" /Users/jeffbzy/driftgrid --include=*.ts --include=*.tsx -l
   ```
   In particular, check whether the **dev server lazily generates thumbnails on-demand** (an API route calling `generateThumbnail` per request). If so, that leaks one browser per HTTP request under load and is even higher priority than the CLI script.

### Suggested refactor sketch (`lib/thumbnails.ts`)
```ts
import { chromium, Browser } from 'playwright';
import sharp from 'sharp';

export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try { return await fn(browser); }
  finally { await browser.close(); }
}

export async function renderThumbnail(
  browser: Browser, htmlPath: string, outputPath: string, width: number, height: number | 'auto'
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height: height === 'auto' ? 900 : height },
    deviceScaleFactor: 3,
  });
  try {
    page.setDefaultTimeout(20000);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).webp({ quality: 85 }).toFile(outputPath);
  } finally {
    await page.close();
  }
}

// Back-compat wrapper if other callers still need a one-shot (e.g. lazy API route):
export async function generateThumbnail(htmlPath, outputPath, width, height) {
  return withBrowser(b => renderThumbnail(b, htmlPath, outputPath, width, height));
}
```
Then update `scripts/generate-thumbnails.ts` to launch once and reuse:
```ts
await withBrowser(async (browser) => {
  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      // ...skip logic...
      await renderThumbnail(browser, htmlPath, outputPath, width, height);
    }
  }
});
// write manifest after, in a finally if needed
```

---

## Reproduce
```bash
cd /Users/jeffbzy/driftgrid
npm run dev          # terminal A
# terminal B:
for i in $(seq 1 12); do npm run generate-thumbs -- recovryai promo-film-hifi --force; done
# watch them accumulate:
watch -n1 'echo "headless: $(pgrep -fc -- "--headless")  chromium: $(pgrep -ifc chromium)"; uptime'
```
Before the fix: the count climbs and never returns to 0; load rises. After the fix: count returns to 0 after each run; load stays flat.

## Verify the fix
After each `generate-thumbs` run:
```bash
pgrep -fc -- "--headless"   # expect 0
pgrep -ifc chromium         # expect 0 (no residual)
```
Load average should not climb across repeated runs.

---

## Notes / context
- DriftGrid = Next.js 14 (App Router), repo `/Users/jeffbzy/driftgrid`, dev server `localhost:3000`. The `drift` skill governs project work.
- Thumbnails live at `projects/{client}/{project}/.thumbs/{conceptId}-{versionId}.webp`, referenced by `manifest.json`.
- `scripts/generate-thumbnails.ts` iterates `manifest.concepts`. This project is **rounds-based** (`manifest.rounds[0].concepts`); confirm `getManifest()` normalizes rounds → `concepts` (it appears to, since all versions render). If you touch that path, mind the documented "rounds-alias footgun" in `.claude/rules/architecture.md`.
- Optional perf win: drop `--force` re-rendering all 24 every call; only regenerate thumbnails whose source HTML `mtime` is newer than the existing `.webp`.
- Separately, `.claude/rules/architecture.md` notes an **SSE watcher leak** regression guard — long-lived dev sessions may also leak watchers; worth a glance while you're in here, though it's not the cause of this incident.
