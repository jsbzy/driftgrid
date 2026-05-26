/**
 * useLocalLauncher — polls the DriftGrid launcher service for dev server status.
 *
 * The launcher runs on port 3100 of the configured local host. This hook:
 *   - Reads the local hostname from localStorage ('driftgrid-local-host')
 *   - Polls GET /status every 30s (best-effort; fails silently on mixed-content / network errors)
 *   - Exposes start/stop/keepalive actions
 *   - Provides a helper to build local admin URLs
 *
 * Mixed-content note: if the dashboard is served over HTTPS (driftgrid.ai)
 * and the launcher is HTTP, browsers will block the fetch. The hook handles
 * this gracefully — status stays null, and the UI falls back to a plain link.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'driftgrid-local-host';
const LAUNCHER_PORT = 3100;
const POLL_INTERVAL = 30_000;
const FETCH_TIMEOUT = 3000;

export type LauncherStatus = {
  reachable: boolean;
  running: boolean;
  port: number | null;
  pid: number | null;
  managed: boolean;
  uptime: number | null;
  idleTimeoutMinutes: number | null;
};

export function getLocalHost(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setLocalHost(host: string) {
  localStorage.setItem(STORAGE_KEY, host.trim());
}

export function clearLocalHost() {
  localStorage.removeItem(STORAGE_KEY);
}

export function useLocalLauncher() {
  const [localHost, setHost] = useState<string | null>(null);
  const [status, setStatus] = useState<LauncherStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read from localStorage on mount
  useEffect(() => {
    setHost(getLocalHost());
  }, []);

  const launcherBase = localHost
    ? `http://${localHost}:${LAUNCHER_PORT}`
    : null;

  const checkStatus = useCallback(async () => {
    if (!launcherBase) return;
    try {
      const res = await fetch(`${launcherBase}/status`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const data = await res.json();
      setStatus({
        reachable: true,
        running: data.running ?? false,
        port: data.port ?? null,
        pid: data.pid ?? null,
        managed: data.managed ?? false,
        uptime: data.uptime ?? null,
        idleTimeoutMinutes: data.idleTimeoutMinutes ?? null,
      });
    } catch {
      setStatus({
        reachable: false,
        running: false,
        port: null,
        pid: null,
        managed: false,
        uptime: null,
        idleTimeoutMinutes: null,
      });
    }
  }, [launcherBase]);

  // Poll on mount + interval
  useEffect(() => {
    if (!launcherBase) return;
    checkStatus();
    pollRef.current = setInterval(checkStatus, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [launcherBase, checkStatus]);

  const startServer = useCallback(async () => {
    if (!launcherBase) return false;
    setStarting(true);
    try {
      const res = await fetch(`${launcherBase}/start`, {
        method: 'POST',
        signal: AbortSignal.timeout(90_000), // next dev can take a while on cold start
      });
      const data = await res.json();
      await checkStatus();
      setStarting(false);
      return data.ok ?? false;
    } catch {
      setStarting(false);
      return false;
    }
  }, [launcherBase, checkStatus]);

  const stopServer = useCallback(async () => {
    if (!launcherBase) return false;
    setStopping(true);
    try {
      const res = await fetch(`${launcherBase}/stop`, {
        method: 'POST',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const data = await res.json();
      await checkStatus();
      setStopping(false);
      return data.ok ?? false;
    } catch {
      setStopping(false);
      return false;
    }
  }, [launcherBase, checkStatus]);

  /** Build a local admin URL for a given project. Uses the port from launcher status, or default 3000. */
  const localAdminUrl = useCallback(
    (client: string, project: string) => {
      if (!localHost) return null;
      const port = status?.port || 3000;
      return `http://${localHost}:${port}/admin/${client}/${project}`;
    },
    [localHost, status?.port]
  );

  /** Build the local dashboard URL. */
  const localDashboardUrl = localHost
    ? `http://${localHost}:${status?.port || 3000}`
    : null;

  const configure = useCallback((host: string) => {
    const cleaned = host.trim().replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/+$/, '');
    setLocalHost(cleaned);
    setHost(cleaned);
  }, []);

  const disconnect = useCallback(() => {
    clearLocalHost();
    setHost(null);
    setStatus(null);
  }, []);

  return {
    localHost,
    status,
    starting,
    stopping,
    checkStatus,
    startServer,
    stopServer,
    localAdminUrl,
    localDashboardUrl,
    configure,
    disconnect,
  };
}
