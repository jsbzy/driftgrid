import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "DriftGrid",
  description: "Design iteration & client presentation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('driftgrid-theme') === 'dark') {
              document.documentElement.classList.add('dark');
            }
          } catch {}
        `}} />
      </head>
      <body className={`${jetbrainsMono.variable} antialiased`}>
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
