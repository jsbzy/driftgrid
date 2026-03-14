import { chromium } from 'playwright';

export async function exportPng(
  htmlPath: string,
  width: number,
  height: number | 'auto'
): Promise<Buffer> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: height === 'auto' ? 900 : height },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  let buffer: Buffer;
  if (height === 'auto') {
    // Full-page screenshot for scrollable content
    buffer = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
  } else {
    buffer = await page.screenshot({ type: 'png' }) as Buffer;
  }

  await browser.close();
  return buffer;
}
