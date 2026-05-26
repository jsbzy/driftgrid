'use client';

import { useState, useEffect } from 'react';
import { useCopyFeedback } from '@/lib/hooks/useCopyFeedback';

/** Always-visible install button that either triggers the native prompt or shows instructions. */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
      return;
    }
    const handler = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setIsStandalone(true); setPrompt(null); });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (prompt) {
      prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') { setIsStandalone(true); setPrompt(null); }
    } else {
      setShowInstructions(true);
    }
  };

  return { isStandalone, showInstructions, setShowInstructions, install };
}

function detectBrowser(): 'chrome' | 'safari' | 'arc' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // Arc identifies itself in chrome but has specific behavior
  if ((navigator as any).userAgentData?.brands?.some((b: any) => b.brand === 'Arc')) return 'arc';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari';
  if (/Chrome/.test(ua)) return 'chrome';
  return 'other';
}

function InstallModal({ onClose }: { onClose: () => void }) {
  const browser = detectBrowser();

  const steps: Record<string, { label: string; steps: string[] }> = {
    chrome: {
      label: 'Chrome',
      steps: [
        'Click the ⋮ menu (top-right)',
        'Click "Cast, Save, and Share"',
        'Click "Install Page as App..."',
      ],
    },
    safari: {
      label: 'Safari',
      steps: [
        'Click File in the menu bar',
        'Click "Add to Dock"',
      ],
    },
    arc: {
      label: 'Arc',
      steps: [
        'Click File in the menu bar',
        'Click "Add to Dock"',
      ],
    },
    other: {
      label: 'Your browser',
      steps: [
        'Look for "Install" or "Add to Home Screen" in your browser menu',
        'Or try opening this site in Chrome or Safari',
      ],
    },
  };

  const current = steps[browser];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#141414', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '32px 36px', maxWidth: 400, width: '100%',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.9)', marginBottom: 6 }}>
          Install DriftGrid
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.5 }}>
          Get DriftGrid as a desktop app — its own window, its own dock icon, no more lost tabs.
        </div>

        <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
          {current.label}
        </div>

        {current.steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
            }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, paddingTop: 2 }}>
              {step}
            </div>
          </div>
        ))}

        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '10px 0',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontSize: 11,
            cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.06em',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function QuickStart() {
  const [tab, setTab] = useState<'claude' | 'terminal'>('claude');
  const { copied, copy: copyToClipboard } = useCopyFeedback(1500);

  const terminalCommands = [
    'git clone https://github.com/jsbzy/driftgrid.git',
    'cd driftgrid && npm install',
    'npm run dev',
  ];

  const claudePrompt = `Clone https://github.com/jsbzy/driftgrid.git, install it, and help me set up my first design project.`;

  const copy = async () => {
    const text = tab === 'claude' ? claudePrompt : terminalCommands.join('\n');
    await copyToClipboard(text);
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
        <button onClick={() => { setTab('claude'); }} style={tabStyle(tab === 'claude')}>
          Claude Code
        </button>
        <button onClick={() => { setTab('terminal'); }} style={tabStyle(tab === 'terminal')}>
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
  const { isStandalone, showInstructions, setShowInstructions, install } = useInstallPrompt();

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
            href="https://docs.driftgrid.ai"
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
            Docs
          </a>
          <a
            href="/pricing"
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            Pricing
          </a>
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
          {!isStandalone && (
            <button
              onClick={install}
              style={{
                fontSize: 10,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.4)',
                textTransform: 'uppercase',
                padding: '6px 14px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                textDecoration: 'none',
              }}
            >
              Get the App
            </button>
          )}
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
              href="https://docs.driftgrid.ai"
              target="_blank"
              rel="noopener noreferrer"
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
              Read the Docs →
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
              d: 'Works with Claude Code, Cursor, Copilot, or any tool that writes HTML. DriftGrid organizes what they produce.',
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
          display: 'flex',
          gap: 24,
          justifyContent: 'center',
          marginBottom: 16,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          <a href="https://docs.driftgrid.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Docs</a>
          <a href="/pricing" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Pricing</a>
          <a href="https://github.com/jsbzy/driftgrid" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>GitHub</a>
          <a href="https://github.com/jsbzy/driftgrid/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Changelog</a>
        </div>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.2)',
          textTransform: 'uppercase',
        }}>
          Built by BZY · MIT License
        </div>
      </footer>

      {showInstructions && <InstallModal onClose={() => setShowInstructions(false)} />}
    </div>
  );
}
