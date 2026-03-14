import PptxGenJS from 'pptxgenjs';
import { exportPng } from './export-png';

interface SlideInput {
  label: string;
  htmlPath: string;
  width: number;
  height: number | 'auto';
}

/**
 * Generate a PPTX with one slide per input.
 * Each slide is a full-bleed screenshot of the HTML design.
 */
export async function exportPptx(
  slides: SlideInput[],
  title: string
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.title = title;

  // Use 16:9 layout
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  for (const slide of slides) {
    const pngBuffer = await exportPng(slide.htmlPath, slide.width, slide.height);
    const pngBase64 = pngBuffer.toString('base64');

    const pptxSlide = pptx.addSlide();
    pptxSlide.addImage({
      data: `image/png;base64,${pngBase64}`,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%',
      sizing: { type: 'contain', w: 13.33, h: 7.5 },
    });
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
