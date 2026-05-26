import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://driftgrid.ai'),
  title: {
    default: 'DriftGrid — Design iteration for agents',
    template: '%s · DriftGrid',
  },
  description: 'Version every AI-generated design. Compare any two. Share a single link per round with clients. Local-first and open source.',
  applicationName: 'DriftGrid',
  keywords: ['design iteration', 'AI design', 'Claude Code', 'Cursor', 'version control for design', 'local-first', 'design review', 'HTML design', 'agent-assisted design'],
  authors: [{ name: 'BZY' }],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://driftgrid.ai',
    siteName: 'DriftGrid',
    title: 'DriftGrid — Design iteration for agents',
    description: 'Version every AI-generated design. Compare any two. Share a single link per round with clients. Local-first and open source.',
    // Image comes from app/opengraph-image.tsx (file convention)
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DriftGrid — Design iteration for agents',
    description: 'Version every AI-generated design. Compare any two. Share a single link per round with clients.',
    // Image shared with openGraph via app/opengraph-image.tsx
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta name="theme-color" content="#1c1c1c" />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('driftgrid-theme') === 'dark') {
              document.documentElement.classList.add('dark');
            }
          } catch {}
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function() {});
          }
        `}} />
      </head>
      <body suppressHydrationWarning className={`${jetbrainsMono.variable} antialiased`}>
        <div className="hidden max-md:flex fixed inset-0 z-[9999] items-center justify-center p-8" style={{ background: 'var(--background)' }}>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono, monospace)', maxWidth: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--foreground)' }}>DriftGrid</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              DriftGrid is designed for desktop with keyboard shortcuts. Open this on a laptop or desktop for the best experience.
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
