'use client';

import { useRef, useEffect } from 'react';

interface HtmlFrameProps {
  src: string;
}

export function HtmlFrame({ src }: HtmlFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Reset scroll when src changes
    if (iframeRef.current) {
      iframeRef.current.scrollTop = 0;
    }
  }, [src]);

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
