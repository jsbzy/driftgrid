import { PDFDocument } from 'pdf-lib';
import path from 'path';
import { promises as fs } from 'fs';

async function launchBrowser(width: number, height: number) {
  if (process.env.VERCEL) {
    // Production: use @sparticuz/chromium + puppeteer-core
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width, height, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
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

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

/**
 * Embed all image references in HTML as base64 data URIs.
 * Resolves relative paths (url(), img src) against sourceDir.
 */
async function embedImagesAsBase64(html: string, sourceDir: string): Promise<string> {
  // Collect all unique image paths from CSS url() and <img src="">
  const urls = new Set<string>();
  const urlPattern = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/g;
  const imgPattern = /<img[^>]+src=["']((?!data:)[^"']+)["']/g;
  let m;
  while ((m = urlPattern.exec(html)) !== null) urls.add(m[1]);
  while ((m = imgPattern.exec(html)) !== null) urls.add(m[1]);

  for (const relPath of urls) {
    const absPath = path.resolve(sourceDir, relPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_MAP[ext];
    if (!mime) continue;
    try {
      const data = await fs.readFile(absPath);
      const dataUri = `data:${mime};base64,${data.toString('base64')}`;
      html = html.split(relPath).join(dataUri);
    } catch {
      // Image not found on disk — skip
    }
  }
  return html;
}

/**
 * Export HTML content string as PDF (for edited versions).
 * Embeds all images as base64 so the headless browser renders them without external resources.
 */
export async function exportPdfFromHtml(
  htmlContent: string,
  width: number,
  height: number | 'auto',
  sourceDir: string
): Promise<Buffer> {
  // Embed images as base64 data URIs — critical for Vercel where filesystem is read-only
  // and page.setContent() has no base URL to resolve relative paths
  const html = await embedImagesAsBase64(htmlContent, sourceDir);

  const { browser, type } = await launchBrowser(width, height === 'auto' ? 900 : height);

  if (type === 'puppeteer') {
    const page = await browser.newPage();
    await page.setViewport({ width, height: height === 'auto' ? 900 : height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
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
    await page.setContent(html, { waitUntil: 'networkidle' });
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
 * Export a single HTML file as a PNG screenshot at exact canvas dimensions.
 */
export async function exportPng(
  htmlPath: string,
  width: number,
  height: number | 'auto'
): Promise<Buffer> {
  const pxHeight = height === 'auto' ? 900 : height;
  const { browser, type } = await launchBrowser(width, pxHeight);

  if (type === 'puppeteer') {
    const page = await browser.newPage();
    await page.setViewport({ width, height: pxHeight, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    const pngBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height: pxHeight } });
    await browser.close();
    return Buffer.from(pngBuffer);
  } else {
    const page = await browser.newPage({ viewport: { width, height: pxHeight }, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    const pngBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height: pxHeight } });
    await browser.close();
    return Buffer.from(pngBuffer);
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
