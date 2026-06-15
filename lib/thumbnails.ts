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
    // 3x for sharp thumbnails even at z4 zoom (card fills viewport)
    deviceScaleFactor: 3,
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
  return withBrowser(browser => renderThumbnail(browser, htmlPath, outputPath, width, height));
}
