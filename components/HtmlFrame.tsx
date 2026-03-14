'use client';

import { useRef, useEffect, useState } from 'react';

interface HtmlFrameProps {
  src: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function HtmlFrame({ src, canvasWidth, canvasHeight }: HtmlFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.scrollTop = 0;
    }
  }, [src]);

  useEffect(() => {
    if (!canvasWidth || !canvasHeight || !containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;
      const scaleX = container.clientWidth / canvasWidth;
      const scaleY = container.clientHeight / canvasHeight;
      setScale(Math.min(scaleX, scaleY));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight]);

  // Locked canvas: render iframe at exact dimensions, scale to fit
  if (canvasWidth && canvasHeight) {
    const scaledWidth = canvasWidth * scale;
    const scaledHeight = canvasHeight * scale;

    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden">
        <div style={{ width: scaledWidth, height: scaledHeight, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4 }}>
          <iframe
            ref={iframeRef}
            src={src}
            sandbox="allow-same-origin allow-scripts"
            title="Design preview"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          />
        </div>
      </div>
    );
  }

  // Responsive canvas: stretch to fill
  return (
    <iframe
      ref={iframeRef}
      src={src}
      className="w-full h-full border-0"
      sandbox="allow-same-origin allow-scripts"
      title="Design preview"
    />
  );
}
