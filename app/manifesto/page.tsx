import { promises as fs } from 'fs';
import path from 'path';
import { marked } from 'marked';
import Link from 'next/link';
import type { Metadata } from 'next';
import './manifesto.css';

/**
 * /manifesto — the DriftGrid thesis, rendered from docs/design-iteration-for-agents.md
 *
 * Server component: reads the Markdown source at request time, renders with
 * marked, and wraps in a reading column with custom typography. Keeps the doc
 * and the page in lock-step — if docs/design-iteration-for-agents.md changes,
 * the page updates automatically without a separate port.
 */

export const metadata: Metadata = {
  title: 'Manifesto — Design iteration for agents',
  description:
    'DriftGrid is the creative interface between AI agents and humans, built for exploration. An essay on where AI + creative work is heading, and what DriftGrid is for.',
  openGraph: {
    title: 'Manifesto — DriftGrid',
    description:
      'The creative interface between AI agents and humans, built for exploration.',
    type: 'article',
  },
};

async function loadManifesto(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    'docs',
    'design-iteration-for-agents.md',
  );
  return fs.readFile(filePath, 'utf-8');
}

export default async function ManifestoPage() {
  const source = await loadManifesto();
  const html = await marked.parse(source, {
    gfm: true,
    breaks: false,
  });

  return (
    <div className="manifesto-root">
      <nav className="manifesto-nav">
        <Link href="/" className="manifesto-home">
          ← DriftGrid
        </Link>
        <div className="manifesto-nav-right">
          <Link href="/pricing">Pricing</Link>
          <a
            href="https://docs.driftgrid.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            href="https://github.com/jsbzy/driftgrid"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </nav>

      <header className="manifesto-header">
        <div className="manifesto-eyebrow">Manifesto</div>
        <h1 className="manifesto-title">Design iteration for agents</h1>
        <div className="manifesto-kicker">
          DriftGrid is the creative interface between AI agents and humans,
          built for exploration rather than one-shot generation.
        </div>
        <div className="manifesto-meta">
          <span>April 2026</span>
          <span className="manifesto-meta-dot">·</span>
          <span>~25 min read</span>
        </div>
      </header>

      <article
        className="manifesto-article"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="manifesto-footer">
        <div className="manifesto-footer-links">
          <Link href="/">Home</Link>
          <Link href="/pricing">Pricing</Link>
          <a
            href="https://docs.driftgrid.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            href="https://github.com/jsbzy/driftgrid/blob/main/docs/design-iteration-for-agents.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source on GitHub
          </a>
          <Link href="/llms.txt">llms.txt</Link>
        </div>
        <div className="manifesto-footer-meta">
          Built by BZY · MIT License · The canvas is the deliverable
        </div>
      </footer>
    </div>
  );
}
