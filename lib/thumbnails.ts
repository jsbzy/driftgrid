import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';

/**
 * Run `fn` with a freshly launched Chromium, guaranteeing the browser is closed
 * even if `fn` throws or hangs (try/finally). For batch work, launch once here
 * and call `renderThumbnail` many times inside the callback so we don't relaunch
 * Chromium per item — see scripts/generate-thumbnails.ts.
 */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Render one HTML file to a .webp thumbnail using an existing browser.
 * The page is always closed (try/finally), so a throw/timeout can't orphan it.
 */
export async function renderThumbnail(
  browser: Browser,
  htmlPath: string,
  outputPath: string,
  width: number,
  height: number | 'auto'
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height: height === 'auto' ? 900 : height },
    // 2x is sharp enough at card size (an 1440-wide board renders at 2880px) and
    // roughly halves the pixels of a 3x render — the dominant cost in the render
    // and the sharp encode when a cold grid regenerates many thumbnails at once.
    deviceScaleFactor: 2,
  });
  try {
    page.setDefaultTimeout(20000);
    // 'load' + an explicit font wait instead of 'networkidle': every board pulls
    // Google Fonts via <link>, and networkidle can hang on those keepalive
    // connections, which both stalls the run and (without finally) orphans Chromium.
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    const pngBuffer = await page.screenshot({ type: 'png' });
    await sharp(pngBuffer).webp({ quality: 85 }).toFile(outputPath);
  } finally {
    await page.close();
  }
}

/**
 * Global cap on concurrent one-shot thumbnail generations. Each generateThumbnail
 * call launches its own Chromium; a cold grid open fans out one lazy request per
 * missing/stale thumbnail, so without a cap dozens of browsers launch at once
 * (this is the load-177 incident's failure mode — the try/finally fixed the leak,
 * not the fan-out). Excess calls queue and run as slots free.
 */
const MAX_CONCURRENT_THUMBNAILS = 3;
let activeThumbnailRenders = 0;
const thumbnailWaiters: Array<() => void> = [];

async function acquireThumbnailSlot(): Promise<void> {
  if (activeThumbnailRenders < MAX_CONCURRENT_THUMBNAILS) {
    activeThumbnailRenders++;
    return;
  }
  await new Promise<void>(resolve => thumbnailWaiters.push(resolve));
  activeThumbnailRenders++;
}

function releaseThumbnailSlot(): void {
  activeThumbnailRenders--;
  const next = thumbnailWaiters.shift();
  if (next) next();
}

/**
 * One-shot: launch a browser, render a single thumbnail, close the browser.
 * Used by the lazy API routes (one thumbnail per request). For batch work prefer
 * withBrowser + renderThumbnail to avoid relaunching Chromium per item.
 */
export async function generateThumbnail(
  htmlPath: string,
  outputPath: string,
  width: number,
  height: number | 'auto'
): Promise<void> {
  await acquireThumbnailSlot();
  try {
    return await withBrowser(browser => renderThumbnail(browser, htmlPath, outputPath, width, height));
  } finally {
    releaseThumbnailSlot();
  }
}
