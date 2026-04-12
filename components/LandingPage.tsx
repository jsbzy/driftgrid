'use client';

import { useState } from 'react';

const DEMO_URL = '/s/amVmZi9kZW1vL3dlbGNvbWUtdG8tZHJpZnRncmlk';

function QuickStart() {
  const [tab, setTab] = useState<'claude' | 'terminal'>('claude');
  const [copied, setCopied] = useState(false);

  const terminalCommands = [
    'git clone https://github.com/jsbzy/driftgrid.git',
    'cd driftgrid && npm install',
    'npm run dev',
  ];

  const claudePrompt = `Clone https://github.com/jsbzy/driftgrid.git, install it, and help me set up my first design project.`;

  const copy = async () => {
    const text = tab === 'claude' ? claudePrompt : terminalCommands.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    transition: 'all 120ms ease',
  });

  return (
    <div id="quickstart" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 12,
        justifyContent: 'center',
      }}>
        <button onClick={() => { setTab('claude'); setCopied(false); }} style={tabStyle(tab === 'claude')}>
          Claude Code
        </button>
        <button onClick={() => { setTab('terminal'); setCopied(false); }} style={tabStyle(tab === 'terminal')}>
          Terminal
        </button>
      </div>

      {/* Content card */}
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Title bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
          </div>
          <button
            onClick={copy}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              background: 'transparent',
              color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'color 120ms ease',
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '24px 28px',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 13,
          lineHeight: 2,
          textAlign: 'left',
        }}>
          {tab === 'claude' ? (
            <>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginBottom: 4 }}>
                # Paste this into Claude Code
              </div>
              <div style={{ color: 'rgba(255,255,255,0.9)', lineHeight: 1.7 }}>
                {claudePrompt}
              </div>
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  What happens next
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
                  Claude clones the repo, installs dependencies, and walks you<br />
                  through creating your first project — client name, canvas size,<br />
                  brand guidelines. Then it starts designing.
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginBottom: 4 }}>
                # Clone, install, run. Opens localhost:3000.
              </div>
              {terminalCommands.map((cmd, i) => (
                <div key={i} style={{ color: 'rgba(255,255,255,0.9)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', userSelect: 'none' }}>$ </span>
                  {cmd}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <p style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
        marginTop: 16,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        letterSpacing: '0.05em',
      }}>
        {tab === 'claude'
          ? 'Works with Claude Code CLI, VS Code extension, or claude.ai/code'
          : 'macOS · Linux · Windows · Requires Node 20+'}
      </p>
    </div>
  );
}

/**
 * Marketing landing page — shown at root URL for unauthenticated visitors.
 */
export function LandingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#e5e5e5',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 32px',
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.24em',
          color: 'rgba(255,255,255,0.6)',
          textTransform: 'lowercase',
        }}>
          driftgrid
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a
            href="https://github.com/jsbzy/driftgrid"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            GitHub
          </a>
          <a
            href={DEMO_URL}
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            Demo
          </a>
          <a
            href="/login"
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.75)',
              textDecoration: 'none',
              textTransform: 'uppercase',
              padding: '6px 14px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            Log in
          </a>
        </div>
      </nav>

      {/* Hero section */}
      <section style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px 60px',
        position: 'relative',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            `linear-gradient(rgba(255,255,255,0.025) 0.5px, transparent 0.5px),
             linear-gradient(90deg, rgba(255,255,255,0.025) 0.5px, transparent 0.5px)`,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 80%)',
        }} />

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720, marginBottom: 64 }}>
          <div style={{
            fontSize: 9,
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}>
            Open Source · MIT · BYO Agent
          </div>

          <h1 style={{
            fontSize: 40,
            fontWeight: 400,
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'rgba(255,255,255,0.92)',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}>
            Design iteration<br />
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>for agents.</span>
          </h1>

          <p style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.5)',
            maxWidth: 500,
            margin: '32px auto 0',
            letterSpacing: '0.01em',
          }}>
            Your AI agent writes HTML. DriftGrid versions it on an infinite canvas.
            Browse, compare, and share with clients — all from one place.
          </p>

          {/* CTAs */}
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 48,
          }}>
            <a
              href="#quickstart"
              style={{
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.95)',
                color: '#0a0a0a',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                borderRadius: 4,
              }}
            >
              Get Started ↓
            </a>
            <a
              href={DEMO_URL}
              style={{
                padding: '12px 24px',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                borderRadius: 4,
              }}
            >
              See a Demo
            </a>
          </div>
        </div>

        {/* Quick Start — tabbed Claude Code / Terminal */}
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <QuickStart />
        </div>
      </section>

      {/* How it works */}
      <section style={{
        padding: '120px 32px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        maxWidth: 960,
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          marginBottom: 48,
          textAlign: 'center',
        }}>
          The Workflow
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 24,
        }}>
          {[
            { n: '01', t: 'Agent writes', d: 'Point Claude Code (or any AI) at your project. It creates versioned HTML designs following the CLAUDE.md conventions.' },
            { n: '02', t: 'You browse', d: 'Zoom, compare, navigate. Star your picks. The infinite canvas shows every iteration side-by-side.' },
            { n: '03', t: 'Present', d: 'Press P to show starred versions fullscreen. Export as PDF, PNG, or static HTML.' },
            { n: '04', t: 'Share', d: 'Generate a public review link. Clients browse and comment without accounts.' },
          ].map((step, i) => (
            <div key={i} style={{
              padding: 20,
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 4,
            }}>
              <div style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                marginBottom: 12,
              }}>
                {step.n}
              </div>
              <div style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.85)',
                marginBottom: 8,
                fontWeight: 500,
              }}>
                {step.t}
              </div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1.5,
              }}>
                {step.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{
        padding: '0 32px 120px',
        maxWidth: 960,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 48,
        }}>
          {[
            {
              t: 'BYO Agent',
              d: 'Works with Claude Code, Cursor, Copilot, or any tool that writes HTML. DriftGrid is the harness.',
            },
            {
              t: 'Local-first',
              d: 'Your files live on your machine. No lock-in, no forced cloud. Use git, use your filesystem, use your workflow.',
            },
            {
              t: 'Live HTML',
              d: 'Every frame is a real HTML page, not a screenshot. Interactive prototypes work out of the box.',
            },
          ].map((f, i) => (
            <div key={i}>
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.85)',
                marginBottom: 12,
                fontWeight: 500,
              }}>
                {f.t}
              </div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                lineHeight: 1.6,
              }}>
                {f.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '48px 32px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.2)',
          textTransform: 'uppercase',
        }}>
          BZY Design · MIT License
        </div>
      </footer>
    </div>
  );
}
