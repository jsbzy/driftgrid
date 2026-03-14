import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

/**
 * Export a single HTML file as a PDF.
 * Strategy: screenshot → embed in a page-sized HTML → pdf() for pixel-perfect output.
 */
export async function exportPdf(
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

  // Get actual content dimensions
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));

  const pxWidth = height === 'auto' ? width : width;
  const pxHeight = height === 'auto' ? dimensions.height : height;

  // Screenshot the full content
  const pngBuffer = await page.screenshot({
    type: 'png',
    fullPage: height === 'auto',
  });

  // Create a new page with the screenshot embedded, then PDF it
  const imgPage = await browser.newPage();
  const pngBase64 = Buffer.from(pngBuffer).toString('base64');
  await imgPage.setContent(`
    <html><body style="margin:0;padding:0;">
      <img src="data:image/png;base64,${pngBase64}"
           style="display:block;width:${pxWidth}px;height:${pxHeight}px;" />
    </body></html>
  `, { waitUntil: 'load' });

  const pdfBuffer = await imgPage.pdf({
    width: `${pxWidth}px`,
    height: `${pxHeight}px`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}

/**
 * Merge multiple single-page PDFs into one multi-page document.
 */
export async function mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const buf of pdfBuffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
}
