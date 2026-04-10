'use client';

import Link from 'next/link';

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
          <Link
            href="/login"
            style={{
              fontSize: 10,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}
          >
            Log in
          </Link>
        </div>
      </nav>

      {/* Hero section */}
      <section style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
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
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720 }}>
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
              href="https://github.com/jsbzy/driftgrid"
              target="_blank"
              rel="noopener noreferrer"
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
                transition: 'all 150ms ease',
              }}
            >
              Get Started →
            </a>
            <a
              href="/s/amVmZi9yZWNvdnJ5YWkvZGVtby1zdG9yeWJvYXJk"
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
                transition: 'all 150ms ease',
              }}
            >
              See a Demo
            </a>
          </div>
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
            { n: '03', t: 'Push to cloud', d: 'One click uploads your project to driftgrid.ai. Your files stay local — the cloud is just for sharing.' },
            { n: '04', t: 'Share the link', d: 'Clients get a public review URL. They browse, comment, approve. No account needed.' },
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
              d: 'Works with Claude Code, Cursor, Copilot, Claude Managed Agents, or any tool that writes HTML. DriftGrid is the harness.',
            },
            {
              t: 'Local-first',
              d: 'Your files live on your machine. No lock-in, no forced cloud. Use git, use your filesystem, use your workflow.',
            },
            {
              t: 'Live HTML',
              d: 'Every frame is a real HTML page, not a screenshot. Interactive prototypes work out of the box. Export as PDF, PNG, or static site.',
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

      {/* Quickstart */}
      <section style={{
        padding: '0 32px 120px',
        maxWidth: 720,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          marginBottom: 24,
        }}>
          Try it in 30 seconds
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '20px 24px',
          fontSize: 12,
          color: 'rgba(255,255,255,0.8)',
          textAlign: 'left',
          lineHeight: 1.8,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.3)' }}>$ git clone https://github.com/jsbzy/driftgrid.git</div>
          <div style={{ color: 'rgba(255,255,255,0.3)' }}>$ cd driftgrid && npm install</div>
          <div style={{ color: 'rgba(255,255,255,0.3)' }}>$ npm run dev</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}># Opens localhost:3000 with a demo project</div>
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
          BZY Design · MIT License · Built with Claude Code
        </div>
      </footer>
    </div>
  );
}
