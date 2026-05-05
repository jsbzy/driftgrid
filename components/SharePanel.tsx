'use client';

// v2: status-first (no auto-upload on open) — 2026-04-15
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from './Toast';
import { copyTextSafely } from '@/lib/clipboard';

const CLOUD_URL = process.env.NEXT_PUBLIC_DRIFTGRID_CLOUD_URL || 'https://driftgrid.ai';
const STORAGE_KEY = 'driftgrid-cloud-auth';
const INCLUDE_MEDIA_KEY = (client: string, project: string) => `driftgrid-share-${client}-${project}-include-media`;
// Cached share URL + last-published time, keyed per (project, round). Written after a
// successful publish; read on panel open so "Publish updates" appears immediately even
// when the local /api/cloud/share-status endpoint can't reach the cloud. Including the
// round in the key means a round switch can't surface the wrong round's URL.
const LAST_SHARE_KEY = (client: string, project: string, roundNumber: number | null) =>
  `driftgrid-share-${client}-${project}-r${roundNumber ?? 'none'}-last`;

type CachedShare = { url: string; lastPublishedAt: string };

function readCachedShare(client: string, project: string, roundNumber: number | null): CachedShare | null {
  try {
    const raw = localStorage.getItem(LAST_SHARE_KEY(client, project, roundNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.url !== 'string') return null;
    return { url: parsed.url, lastPublishedAt: parsed.lastPublishedAt || '' };
  } catch {
    return null;
  }
}

function writeCachedShare(client: string, project: string, roundNumber: number | null, url: string, lastPublishedAt: string) {
  try {
    localStorage.setItem(LAST_SHARE_KEY(client, project, roundNumber), JSON.stringify({ url, lastPublishedAt }));
  } catch { /* ignore */ }
}

function clearCachedShare(client: string, project: string, roundNumber: number | null) {
  try { localStorage.removeItem(LAST_SHARE_KEY(client, project, roundNumber)); } catch { /* ignore */ }
}

type ShareState = 'closed' | 'checking' | 'auth' | 'syncing' | 'ready' | 'ready-stale' | 'upgrade' | 'error';

type SkippedSummary = {
  totalCount: number;
  totalBytes: number;
  byExt: Record<string, { count: number; bytes: number }>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 100) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function summarizeSkippedExts(byExt: Record<string, { count: number; bytes: number }>): string {
  const VIDEO = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']);
  const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
  const buckets = { videos: 0, audio: 0, other: 0 };
  for (const [ext, info] of Object.entries(byExt)) {
    if (VIDEO.has(ext)) buckets.videos += info.count;
    else if (AUDIO.has(ext)) buckets.audio += info.count;
    else buckets.other += info.count;
  }
  const parts: string[] = [];
  if (buckets.videos) parts.push(`${buckets.videos} video${buckets.videos === 1 ? '' : 's'}`);
  if (buckets.audio) parts.push(`${buckets.audio} audio`);
  if (buckets.other) parts.push(`${buckets.other} other`);
  return parts.join(', ');
}

interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt: number;
}

interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  client: string;
  project: string;
  /** Active round ID — the share filter only includes starred versions in this round. */
  roundId?: string | null;
  /** Round number — scopes the share row so each round has its own pinned URL. */
  roundNumber?: number | null;
}

function getStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeCredentials(creds: StoredCredentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Decode the email claim out of a Supabase JWT access token. Returns '' on failure. */
function emailFromJwt(token: string | undefined | null): string {
  if (!token) return '';
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    // base64url → base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    return typeof parsed.email === 'string' ? parsed.email : '';
  } catch {
    return '';
  }
}

type SyncPhase = 'verifying' | 'scanning' | 'pushing' | 'sharing';

const SYNC_MESSAGES: Record<SyncPhase, string[]> = {
  verifying: [
    'Knocking on the cloud',
    'Checking your badge',
  ],
  scanning: [
    'Taking stock of the project',
    'Counting concepts',
    'Gathering your canvases',
  ],
  pushing: [
    'Packing up concepts',
    'Drifting to the cloud',
    'Folding the canvas',
    'Sending your designs',
    'Tucking in the pixels',
    'Rounding up versions',
    'Crossing the wire',
  ],
  sharing: [
    'Polishing your link',
    'Almost there',
  ],
};

export function SharePanel({ open, onClose, client, project, roundId, roundNumber }: SharePanelProps) {
  const [state, setState] = useState<ShareState>('closed');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState('');
  const [phase, setPhase] = useState<SyncPhase>('verifying');
  const [messageTick, setMessageTick] = useState(0);
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [filesUploaded, setFilesUploaded] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [skipped, setSkipped] = useState<SkippedSummary | null>(null);
  // Diagnostic: captures the last cloud share-status response so the panel can
  // tell the user WHY no share is shown (missing on cloud vs. cloud unreachable).
  const [statusDebug, setStatusDebug] = useState<
    | { kind: 'missing' }
    | { kind: 'unreachable'; message: string }
    | null
  >(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [email, setEmail] = useState('');
  const [commentsCopied, setCommentsCopied] = useState(false);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  // When the user clicks "sign out", the popup may accidentally find a live cloud
  // session and postMessage tokens back — which would immediately re-auth us into
  // the account we're trying to leave. This ref blocks those messages briefly.
  const suppressAuthUntilRef = useRef<number>(0);

  function readIncludeMedia(): boolean {
    try { return localStorage.getItem(INCLUDE_MEDIA_KEY(client, project)) === '1'; }
    catch { return false; }
  }
  function writeIncludeMedia(value: boolean) {
    try {
      if (value) localStorage.setItem(INCLUDE_MEDIA_KEY(client, project), '1');
      else localStorage.removeItem(INCLUDE_MEDIA_KEY(client, project));
    } catch { /* ignore */ }
  }

  // Listen for postMessage from the connect popup
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type !== 'driftgrid-cloud-auth') return;

    // If we just signed out, ignore any auth messages from the popup for a brief
    // window — otherwise a stale cloud session would re-auth us immediately.
    if (Date.now() < suppressAuthUntilRef.current) {
      return;
    }

    const { accessToken, refreshToken, email: userEmail } = event.data;
    if (!accessToken) return;

    const resolvedEmail = userEmail || emailFromJwt(accessToken) || '';

    // Store credentials
    storeCredentials({
      accessToken,
      refreshToken: refreshToken || '',
      email: resolvedEmail,
      // Supabase JWTs default to 1hr expiry
      expiresAt: Date.now() + 3600 * 1000,
    });

    setEmail(resolvedEmail);

    // Only auto-upload when the user was explicitly waiting on a sign-in (either
    // the initial 'auth' screen or the 'upgrade' screen where they'd need to
    // re-auth with a different account). Already-signed-in sessions should never
    // trigger an unexpected upload — the user drives uploads via Publish updates.
    if (state !== 'auth' && state !== 'upgrade') return;
    pushAndShare(accessToken, refreshToken || '', { intentional: true });
  }, [client, project, state]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!open) {
      setState('closed');
      return;
    }
    checkCredentials();
  }, [open]);

  // Rotate the playful status message every 2.2s during sync.
  useEffect(() => {
    if (state !== 'syncing') return;
    const t = setInterval(() => setMessageTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [state]);

  async function checkCredentials() {
    setState('checking');
    const creds = getStoredCredentials();

    if (!creds?.accessToken) {
      setState('auth');
      return;
    }

    // Prefer stored email; fall back to decoding the JWT if older credentials lack it.
    const resolvedEmail = creds.email || emailFromJwt(creds.accessToken);
    setEmail(resolvedEmail);
    if (!creds.email && resolvedEmail) {
      storeCredentials({ ...creds, email: resolvedEmail });
    }

    // Hydrate from cache first so "Publish updates" appears immediately. The cloud
    // status check below is authoritative and will correct the view if the share
    // was deleted — but if the status endpoint is unreachable (local dev returns
    // 400 without DRIFT_CLOUD=1), the cache keeps the panel useful.
    const cached = readCachedShare(client, project, roundNumber ?? null);
    if (cached) {
      setShareUrl(cached.url);
      setLastPublishedAt(cached.lastPublishedAt || null);
      setState('ready-stale');
    }
    setStatusDebug(null);

    // Lightweight lookup: does a share already exist for this project?
    //   • yes → show `ready-stale` with a "Publish updates" primary button
    //   • no  → show `auth`-style landing with a "Create share" primary button
    // NO upload happens here. The user decides when to publish.
    try {
      const res = await fetch('/api/cloud/share-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, accessToken: creds.accessToken, roundNumber: roundNumber ?? null }),
      });
      if (res.status === 401) {
        // Token rejected — try to refresh by running a full push (which handles refresh);
        // but since this is just a status check, fall back to auth.
        clearCredentials();
        setState('auth');
        return;
      }
      if (!res.ok) {
        // Local dev (400) or other non-auth error — trust cache if we have one,
        // otherwise fall through to the "create share" landing.
        const bodyText = await res.text().catch(() => '');
        console.debug('[SharePanel] share-status error', res.status, bodyText);
        setStatusDebug({ kind: 'unreachable', message: `HTTP ${res.status}` });
        if (!cached) {
          setShareUrl(null);
          setLastPublishedAt(null);
          setState('ready-stale');
        }
        return;
      }
      const data = await res.json();
      console.debug('[SharePanel] share-status', data);
      if (data.exists) {
        setShareUrl(data.url);
        setLastPublishedAt(data.lastPublishedAt || null);
        writeCachedShare(client, project, roundNumber ?? null, data.url, data.lastPublishedAt || '');
        setStatusDebug(null);
        setState('ready-stale');
      } else {
        // Cloud says no share → clear any stale cache, show create-share landing.
        clearCachedShare(client, project, roundNumber ?? null);
        setShareUrl(null);
        setLastPublishedAt(null);
        setStatusDebug({ kind: 'missing' });
        setState('ready-stale');
      }
    } catch (err) {
      // Network or cloud error — fall back to letting the user publish, which
      // will surface any real errors itself. Preserve cache if we have one.
      const message = err instanceof Error ? err.message : 'network error';
      console.debug('[SharePanel] share-status fetch threw', err);
      setStatusDebug({ kind: 'unreachable', message });
      if (!cached) {
        setShareUrl(null);
        setLastPublishedAt(null);
        setState('ready-stale');
      }
    }
  }

  /** Format a timestamp as "5 min ago" / "2 hr ago" / "Apr 15". */
  function formatAgo(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const delta = Date.now() - then;
    if (delta < 60_000) return 'Just now';
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(delta / 3_600_000);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(delta / 86_400_000);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function pushAndShare(accessToken: string, refreshToken: string, opts?: { includeMedia?: boolean; intentional?: boolean }) {
    // Belt-and-suspenders: pushAndShare must only run from an explicit user action
    // (Create share link / Publish updates / Sign in). If it somehow fires from a
    // stale handler or a bad state machine transition, bail.
    if (opts?.intentional !== true) {
      // intentional flag wasn't set — this is an unintended invocation
      // (log + bail instead of silently consuming bandwidth)
      if (typeof window !== 'undefined' && window.console) {
        window.console.warn('[SharePanel] pushAndShare called without intentional flag — ignoring');
      }
      return;
    }
    const includeMedia = opts?.includeMedia ?? readIncludeMedia();

    setState('syncing');
    setProgress('');
    setPhase('verifying');
    setMessageTick(0);
    setBytesUploaded(0);
    setTotalBytes(0);
    setFilesUploaded(0);
    setTotalFiles(0);
    setSkipped(null);

    // Stall watchdog — if no progress event in 45s, surface an error.
    let lastEventAt = Date.now();
    const stallTimer = setInterval(() => {
      if (Date.now() - lastEventAt > 45000) {
        clearInterval(stallTimer);
        setErrorMsg('Upload stalled. The project may be too large or the network is unreachable.');
        setState('error');
      }
    }, 5000);

    try {
      const res = await fetch('/api/cloud/push-and-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, accessToken, refreshToken, includeMedia, roundId }),
      });

      if (!res.ok || !res.body) {
        clearInterval(stallTimer);
        setErrorMsg(`Share failed (${res.status})`);
        setState('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let latestRefresh = refreshToken;
      let latestAccess = accessToken;
      let localTotalFiles = 0;
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          lastEventAt = Date.now();

          let evt: { type: string; [k: string]: unknown };
          try { evt = JSON.parse(line); } catch { continue; }

          switch (evt.type) {
            case 'phase': {
              if (evt.phase === 'verifying' || evt.phase === 'scanning' || evt.phase === 'sharing') {
                setPhase(evt.phase);
                setMessageTick(0);
              } else if (evt.phase === 'pushing') {
                localTotalFiles = (evt.totalFiles as number) || 0;
                const tb = (evt.totalBytes as number) || 0;
                setTotalFiles(localTotalFiles);
                setTotalBytes(tb);
                setPhase('pushing');
                setMessageTick(0);
              }
              break;
            }
            case 'skipped': {
              const byExt = (evt.byExt as Record<string, { count: number; bytes: number }>) || {};
              const entries = (evt.entries as unknown[]) || [];
              setSkipped({
                totalCount: entries.length,
                totalBytes: (evt.totalBytes as number) || 0,
                byExt,
              });
              break;
            }
            case 'progress': {
              const up = (evt.uploaded as number) ?? 0;
              const tot = (evt.total as number) ?? localTotalFiles;
              const bu = (evt.bytesUploaded as number) ?? 0;
              const tb = (evt.totalBytes as number) ?? 0;
              setFilesUploaded(up);
              setBytesUploaded(bu);
              if (tot) setTotalFiles(tot);
              if (tb) setTotalBytes(tb);
              break;
            }
            case 'newTokens': {
              latestAccess = (evt.accessToken as string) || latestAccess;
              latestRefresh = (evt.refreshToken as string) || latestRefresh;
              storeCredentials({
                accessToken: latestAccess,
                refreshToken: latestRefresh,
                email,
                expiresAt: Date.now() + 3600 * 1000,
              });
              break;
            }
            case 'needsAuth': {
              clearInterval(stallTimer);
              clearCredentials();
              setState('auth');
              done = true;
              break;
            }
            case 'freeLimit': {
              clearInterval(stallTimer);
              setState('upgrade');
              done = true;
              break;
            }
            case 'error': {
              clearInterval(stallTimer);
              setErrorMsg((evt.error as string) || 'Failed to share');
              setState('error');
              done = true;
              break;
            }
            case 'done': {
              clearInterval(stallTimer);
              const url = evt.shareUrl as string;
              setShareUrl(url);
              const publishedAt = new Date().toISOString();
              setLastPublishedAt(publishedAt);
              writeCachedShare(client, project, roundNumber ?? null, url, publishedAt);
              setStatusDebug(null);
              const synced = evt.filesUploaded as number;
              const skippedCount = (evt.filesSkipped as number) || 0;
              setProgress(skippedCount
                ? `${synced} files synced · ${skippedCount} skipped`
                : `${synced} files synced`);
              setState('ready');
              done = true;
              break;
            }
          }
          if (done) break;
        }
      }
      clearInterval(stallTimer);
    } catch {
      clearInterval(stallTimer);
      setErrorMsg('Could not reach DriftGrid Cloud. Check your connection.');
      setState('error');
    }
  }

  function openConnectPopup() {
    const origin = encodeURIComponent(window.location.origin);
    // Wider than the desktop-only threshold on driftgrid.ai (~768px) so the
    // cloud doesn't render its "designed for desktop" blocker inside the popup.
    const w = 960;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    window.open(
      `${CLOUD_URL}/connect?origin=${origin}`,
      'driftgrid-connect',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`,
    );
  }

  async function handleCopy() {
    if (!shareUrl) return;
    const ok = await copyTextSafely(shareUrl);
    if (!ok) {
      toast('Couldn’t copy automatically — select the URL above to copy manually.', 'error');
      return;
    }
    setCopied(true);
    toast('Share link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyComments() {
    if (!shareUrl) return;
    try {
      const token = shareUrl.split('/s/')[1];
      if (!token) return;

      const creds = getStoredCredentials();
      const res = await fetch(`${CLOUD_URL}/api/cloud/comments?token=${encodeURIComponent(token)}`, {
        headers: creds?.accessToken ? { 'Authorization': `Bearer ${creds.accessToken}` } : {},
      });

      if (!res.ok) {
        toast('No comments yet');
        return;
      }

      const data = await res.json();
      if (!data.text || data.count === 0) {
        toast('No comments yet');
        return;
      }

      const ok = await copyTextSafely(data.text);
      if (!ok) {
        toast('Couldn’t copy comments to clipboard.', 'error');
        return;
      }
      setCommentsCopied(true);
      toast(`${data.count} comment${data.count === 1 ? '' : 's'} copied`);
      setTimeout(() => setCommentsCopied(false), 2000);
    } catch {
      toast('Failed to fetch comments');
    }
  }

  function handleSignOut() {
    // 1. Clear local creds so we stop using this session.
    clearCredentials();
    setShareUrl(null);
    setEmail('');
    setState('auth');

    // 2. For the next 10 seconds, ignore any `driftgrid-cloud-auth` postMessages from
    //    stray popups. If the cloud deployment doesn't know about `?signout=1` (older
    //    /connect page), the popup falls back to `checkExistingSession()` which auto-
    //    sends tokens back. Without this guard, the user would be re-auth'd into the
    //    account they just tried to leave.
    suppressAuthUntilRef.current = Date.now() + 10_000;

    // 3. Try to clear the cloud Supabase session. Width must be ≥ 768 to escape the
    //    "designed for desktop" viewport blocker on driftgrid.ai.
    try {
      const origin = encodeURIComponent(window.location.origin);
      const w = 820;
      const h = 520;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top = window.screenY + (window.innerHeight - h) / 2;
      const signOutWindow = window.open(
        `${CLOUD_URL}/connect?origin=${origin}&signout=1`,
        'driftgrid-signout',
        `width=${w},height=${h},left=${left},top=${top},popup=yes`,
      );
      // Give the popup a chance to self-close; force-close it after 3s as a fallback.
      if (signOutWindow) {
        window.setTimeout(() => { try { signOutWindow.close(); } catch { /* ignore */ } }, 3000);
      }
    } catch {
      /* popup blocked — local sign-out still succeeded */
    }
  }

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    background: '#fff',
    borderLeft: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
    zIndex: 50,
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideIn 200ms ease-out',
  };

  const headerStyle: React.CSSProperties = {
    padding: '24px 28px 16px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const bodyStyle: React.CSSProperties = {
    padding: '28px',
    flex: 1,
    overflow: 'auto',
  };

  const headerText = state === 'auth' ? 'Share with clients'
    : state === 'upgrade' ? 'Upgrade to share'
    : state === 'error' ? 'Share error'
    : 'Share link';

  return (
    <>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes indeterminate { 0% { left: -40%; } 100% { left: 100%; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-swap {
          0% { opacity: 0; transform: translateY(3px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.2)',
          zIndex: 49,
        }}
      />

      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111', letterSpacing: '0.02em' }}>
            {headerText}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        {/* Signed-in account bar — visible whenever we have an email (all post-auth states). */}
        {email && state !== 'auth' && (
          <div style={{
            padding: '10px 28px',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafafa',
          }}>
            <div style={{ fontSize: 11, color: '#555', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Signed in
              </span>
              <span style={{ fontSize: 11, color: '#222', wordBreak: 'break-all' }}>
                {email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 10,
                color: '#888',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                whiteSpace: 'nowrap',
                marginLeft: 12,
              }}
              title="Sign out and switch accounts"
            >
              sign out
            </button>
          </div>
        )}

        <div style={bodyStyle}>
          {/* CHECKING STATE */}
          {state === 'checking' && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.2s infinite' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse-dot 1.4s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          )}

          {/* AUTH STATE */}
          {state === 'auth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                Sign in to DriftGrid Cloud to share your project with clients.
              </p>

              <button
                onClick={openConnectPopup}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                Sign in to share
              </button>

              <p style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5, margin: 0 }}>
                Your designs stay local. Only shared projects are visible to clients.
              </p>
            </div>
          )}

          {/* SYNCING STATE */}
          {state === 'syncing' && (() => {
            const pct = totalBytes > 0
              ? Math.min(100, Math.round((bytesUploaded / totalBytes) * 100))
              : (totalFiles > 0 ? Math.min(100, Math.round((filesUploaded / totalFiles) * 100)) : 0);
            const indeterminate = totalBytes === 0 && totalFiles === 0;
            const messages = SYNC_MESSAGES[phase];
            const message = messages[messageTick % messages.length];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 20 }}>
                  <div style={{
                    width: 14, height: 14, flexShrink: 0,
                    border: '1.5px solid rgba(139, 92, 246, 0.25)',
                    borderTopColor: '#8b5cf6',
                    borderRadius: '50%',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <div
                    key={`${phase}-${messageTick}`}
                    style={{
                      fontSize: 13, fontWeight: 500, color: '#222',
                      animation: 'fade-swap 2200ms ease-in-out',
                    }}
                  >
                    {message}…
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ position: 'relative', height: 6, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                  {indeterminate ? (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, width: '40%',
                      background: '#8b5cf6', borderRadius: 999,
                      animation: 'indeterminate 1.4s ease-in-out infinite',
                    }} />
                  ) : (
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: '#8b5cf6',
                      borderRadius: 999,
                      transition: 'width 180ms ease-out',
                    }} />
                  )}
                </div>

                {!indeterminate && (
                  <div style={{ fontSize: 10, color: '#bbb', textAlign: 'right', letterSpacing: '0.02em' }}>{pct}%</div>
                )}

                {/* Skipped summary */}
                {skipped && skipped.totalCount > 0 && (
                  <div style={{
                    marginTop: 4,
                    padding: '10px 12px',
                    background: '#f9f7ff',
                    border: '1px solid rgba(139, 92, 246, 0.15)',
                    borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
                      {skipped.totalCount} files skipped · {formatBytes(skipped.totalBytes)}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                      {summarizeSkippedExts(skipped.byExt)}
                    </div>
                    <button
                      onClick={() => {
                        writeIncludeMedia(true);
                        const creds = getStoredCredentials();
                        if (creds) pushAndShare(creds.accessToken, creds.refreshToken, { includeMedia: true, intentional: true });
                      }}
                      style={{
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 10,
                        color: '#8b5cf6',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontFamily: 'inherit',
                      }}
                    >
                      Include media in share →
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* First-time publish — minimal: just a status label, placeholder link,
              and the action button. Disclaimers and helper copy show up after the
              first successful publish. */}
          {state === 'ready-stale' && !shareUrl && (() => {
            const unreachable = statusDebug?.kind === 'unreachable';
            const diagnosticLabel = unreachable
              ? `Couldn\u2019t reach cloud: ${statusDebug?.message ?? 'unknown error'}`
              : null;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.02em', display: 'flex', gap: 10 }}>
                  {roundNumber !== null && roundNumber !== undefined && (
                    <span style={{ color: '#111', fontWeight: 600 }}>Round {roundNumber}</span>
                  )}
                  <span>Unpublished</span>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    background: '#f5f5f5',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#aaa',
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                  }}
                >
                  Link appears here after first publish
                </div>

                <button
                  onClick={() => {
                    const creds = getStoredCredentials();
                    if (creds) pushAndShare(creds.accessToken, creds.refreshToken, { intentional: true });
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 0',
                    textAlign: 'center',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                  }}
                >
                  Publish and Get Link
                </button>

                {diagnosticLabel && (
                  <p style={{
                    fontSize: 10,
                    color: '#b45309',
                    lineHeight: 1.5,
                    margin: 0,
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    letterSpacing: '0.02em',
                  }}>
                    {diagnosticLabel}
                  </p>
                )}
              </div>
            );
          })()}

          {/* READY STATE — existing share (ready-stale) OR just-published (ready) */}
          {(state === 'ready' || state === 'ready-stale') && shareUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Share link ready</span>
                </div>
                <div style={{ fontSize: 10, color: '#aaa', paddingLeft: 24, display: 'flex', gap: 10 }}>
                  {roundNumber !== null && roundNumber !== undefined && (
                    <span style={{ color: '#111', fontWeight: 600 }}>Round {roundNumber}</span>
                  )}
                  {lastPublishedAt && (
                    <span>Last published {formatAgo(lastPublishedAt)}</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  background: '#f5f5f5',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#333',
                  wordBreak: 'break-all',
                  lineHeight: 1.5,
                }}
              >
                {shareUrl}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    textAlign: 'center',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => window.open(shareUrl, '_blank')}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    textAlign: 'center',
                    background: '#fff',
                    color: '#333',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  Preview
                </button>
              </div>

              <p style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5, margin: 0, marginTop: 8 }}>
                Clients can browse and leave comments — no account needed.
              </p>

              {/* Copy Feedback section */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  onClick={handleCopyComments}
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    textAlign: 'center',
                    background: '#fff',
                    color: '#666',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {commentsCopied ? 'Comments copied!' : 'Copy Client Feedback'}
                </button>
                <p style={{ fontSize: 10, color: '#bbb', margin: '8px 0 0', lineHeight: 1.4 }}>
                  Copies all client comments as text. Paste into your conversation to start the next round.
                </p>
              </div>

              {/* Skipped media summary + toggle */}
              {skipped && skipped.totalCount > 0 && (
                <div style={{
                  padding: '12px 14px',
                  background: '#f9f7ff',
                  border: '1px solid rgba(139, 92, 246, 0.15)',
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 11, color: '#555', lineHeight: 1.5 }}>
                    {skipped.totalCount} files skipped · {formatBytes(skipped.totalBytes)}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                    {summarizeSkippedExts(skipped.byExt)}
                  </div>
                  <button
                    onClick={() => {
                      writeIncludeMedia(true);
                      const creds = getStoredCredentials();
                      if (creds) pushAndShare(creds.accessToken, creds.refreshToken, { includeMedia: true, intentional: true });
                    }}
                    style={{
                      marginTop: 8,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 10,
                      color: '#8b5cf6',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontFamily: 'inherit',
                    }}
                  >
                    Re-sync with media included →
                  </button>
                </div>
              )}

              {/* Publish updates — primary when opening against an existing share,
                  secondary after a just-completed sync. */}
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => {
                    const creds = getStoredCredentials();
                    if (creds) pushAndShare(creds.accessToken, creds.refreshToken, { intentional: true });
                  }}
                  style={{
                    width: '100%',
                    padding: state === 'ready-stale' ? '12px 0' : '10px 0',
                    textAlign: 'center',
                    background: state === 'ready-stale' ? '#111' : '#fff',
                    color: state === 'ready-stale' ? '#fff' : '#666',
                    border: state === 'ready-stale' ? 'none' : '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 8,
                    fontSize: state === 'ready-stale' ? 12 : 11,
                    fontWeight: state === 'ready-stale' ? 600 : 500,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                  title={state === 'ready-stale' ? 'Re-upload starred versions so clients see the latest' : 'Re-upload to update the client-facing share'}
                >
                  {state === 'ready-stale' ? 'Publish updates' : 'Re-sync latest changes'}
                </button>

                <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                  Free tier: 1 project share.{' '}
                  <a href={`${CLOUD_URL}/pricing`} target="_blank" style={{ color: '#888', textDecoration: 'underline' }}>
                    Upgrade for unlimited
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* UPGRADE STATE */}
          {state === 'upgrade' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
                You've used your free share on another project. Upgrade to Pro to share unlimited projects.
              </p>

              <div style={{ padding: '16px', background: '#f9f9f9', borderRadius: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 8 }}>Pro — $10/mo</div>
                <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                  Unlimited shares · Cloud sync · Client commenting
                </div>
              </div>

              <a
                href={`${CLOUD_URL}/pricing`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                }}
              >
                Upgrade to Pro
              </a>

              <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
                Or{' '}
                <a href="https://docs.driftgrid.ai/docs/self-hosting" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>
                  self-host
                </a>
                {' '}for free with your own infrastructure.
              </p>
            </div>
          )}

          {/* ERROR STATE */}
          {state === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: '#e55', lineHeight: 1.6, margin: 0 }}>
                {errorMsg || 'Something went wrong.'}
              </p>

              <button
                onClick={() => {
                  setErrorMsg('');
                  checkCredentials();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 0',
                  textAlign: 'center',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>

              <button
                onClick={handleSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  color: '#aaa',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Sign in with a different account
              </button>
            </div>
          )}
        </div>
        {/* Footer — driftgrid wordmark + docs link, sticks to panel bottom */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafafa',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              letterSpacing: '0.24em',
              color: '#999',
              textTransform: 'lowercase',
            }}
          >
            driftgrid
          </span>
          <a
            href="https://docs.driftgrid.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              color: '#666',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#111'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666'; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help &amp; docs
          </a>
        </div>
      </div>
    </>
  );
}
