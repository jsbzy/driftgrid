import { PDFDocument } from 'pdf-lib';

async function launchBrowser(width: number, height: number) {
  if (process.env.VERCEL) {
    // Production: use @sparticuz/chromium-min (downloads binary at runtime)
    const chromium = (await import('@sparticuz/chromium-min')).default;
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width, height, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(
        'https://github.com/nicholasgasior/chromium-binaries/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
      ),
      headless: true,
    });
    return { browser, type: 'puppeteer' as const };
  } else {
    // Local dev: use Playwright
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    return { browser, type: 'playwright' as const };
  }
}

/**
 * Export a single HTML file as a PDF.
 * Strategy: screenshot → embed in a page-sized HTML → pdf() for pixel-perfect output.
 */
export async function exportPdf(
  htmlPath: string,
  width: number,
  height: number | 'auto'
): Promise<Buffer> {
  const { browser, type } = await launchBrowser(width, height === 'auto' ? 900 : height);

  if (type === 'puppeteer') {
    const page = await browser.newPage();
    await page.setViewport({ width, height: height === 'auto' ? 900 : height, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    const pxHeight = height === 'auto' ? dimensions.height : height;
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: height === 'auto' });
    const imgPage = await browser.newPage();
    const pngBase64 = Buffer.from(pngBuffer).toString('base64');
    await imgPage.setContent(`<html><body style="margin:0;padding:0;"><img src="data:image/png;base64,${pngBase64}" style="display:block;width:${width}px;height:${pxHeight}px;" /></body></html>`);
    await imgPage.setViewport({ width, height: pxHeight as number });
    const pdfBuffer = await imgPage.pdf({
      width: `${width}px`,
      height: `${pxHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  } else {
    // Playwright path
    const page = await browser.newPage({ viewport: { width, height: height === 'auto' ? 900 : height }, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    const pxHeight = height === 'auto' ? dimensions.height : height;
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: height === 'auto' });
    const imgPage = await browser.newPage();
    const pngBase64 = Buffer.from(pngBuffer).toString('base64');
    await imgPage.setContent(`<html><body style="margin:0;padding:0;"><img src="data:image/png;base64,${pngBase64}" style="display:block;width:${width}px;height:${pxHeight}px;" /></body></html>`, { waitUntil: 'load' });
    const pdfBuffer = await imgPage.pdf({ width: `${width}px`, height: `${pxHeight}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}

/**
 * Export HTML content string as PDF (for edited versions).
 */
export async function exportPdfFromHtml(
  htmlContent: string,
  width: number,
  height: number | 'auto'
): Promise<Buffer> {
  const { browser, type } = await launchBrowser(width, height === 'auto' ? 900 : height);

  if (type === 'puppeteer') {
    const page = await browser.newPage();
    await page.setViewport({ width, height: height === 'auto' ? 900 : height, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    const pxHeight = height === 'auto' ? dimensions.height : height;
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: height === 'auto' });
    const imgPage = await browser.newPage();
    const pngBase64 = Buffer.from(pngBuffer).toString('base64');
    await imgPage.setContent(`<html><body style="margin:0;padding:0;"><img src="data:image/png;base64,${pngBase64}" style="display:block;width:${width}px;height:${pxHeight}px;" /></body></html>`);
    await imgPage.setViewport({ width, height: pxHeight as number });
    const pdfBuffer = await imgPage.pdf({
      width: `${width}px`,
      height: `${pxHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  } else {
    const page = await browser.newPage({ viewport: { width, height: height === 'auto' ? 900 : height }, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    const pxHeight = height === 'auto' ? dimensions.height : height;
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: height === 'auto' });
    const imgPage = await browser.newPage();
    const pngBase64 = Buffer.from(pngBuffer).toString('base64');
    await imgPage.setContent(`<html><body style="margin:0;padding:0;"><img src="data:image/png;base64,${pngBase64}" style="display:block;width:${width}px;height:${pxHeight}px;" /></body></html>`, { waitUntil: 'load' });
    const pdfBuffer = await imgPage.pdf({ width: `${width}px`, height: `${pxHeight}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }
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
