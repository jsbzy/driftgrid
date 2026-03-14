import { chromium } from 'playwright';

export async function generateThumbnail(
  htmlPath: string,
  outputPath: string,
  width: number,
  height: number | 'auto'
): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: height === 'auto' ? 900 : height },
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}
