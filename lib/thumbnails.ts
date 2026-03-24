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
    // 2x for retina sharpness without excessive file size
    // The viewport is the full canvas size so content renders correctly,
    // and 2x gives a crisp image when displayed at card size (440px)
    deviceScaleFactor: 2,
  });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}
