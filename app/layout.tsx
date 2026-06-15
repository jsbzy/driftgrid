import type { Metadata, Viewport } from "next";
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

// Mobile viewport. maximumScale:5 (not userScalable:no) keeps pinch-zoom for
// fixed decks + accessibility zoom on the client/share review experience.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
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
        {/* The desktop-only blocker was moved out of the global layout into
            components/DesktopOnlyGate.tsx so client/share routes can render on
            mobile. It is mounted only on desktop-bound surfaces (dashboard,
            marketing pages, and the designer Viewer). */}
        {children}
      </body>
    </html>
  );
}
