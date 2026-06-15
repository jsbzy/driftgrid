import { chromium } from 'playwright';

export async function exportPng(
  htmlPath: string,
  width: number,
  height: number | 'auto'
): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: height === 'auto' ? 900 : height },
      deviceScaleFactor: 2,
    });
    page.setDefaultTimeout(20000);
    // 'load' + font wait instead of 'networkidle' (hangs on Google Fonts <link>).
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});

    // Full-page screenshot for scrollable content; clipped viewport otherwise.
    return await page.screenshot({ type: 'png', fullPage: height === 'auto' }) as Buffer;
  } finally {
    await browser.close();
  }
}
