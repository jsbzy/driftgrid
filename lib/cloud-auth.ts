'use client';

/**
 * Canonical cloud-account auth: the credential store + the sign-in popup flow,
 * decoupled from any one feature. Both Sync and Share use this so connecting to
 * cloud is account-level, not buried inside Share.
 *
 * (SharePanel still has its own inline copies reading the SAME localStorage key,
 * so they stay data-compatible; fold SharePanel onto this module in a later pass.)
 */

export const CLOUD_AUTH_KEY = 'driftgrid-cloud-auth';
const CLOUD_URL = process.env.NEXT_PUBLIC_DRIFTGRID_CLOUD_URL || 'https://driftgrid.ai';

export type StoredCredentials = {
  accessToken: string;
  refreshToken?: string;
  email?: string;
  expiresAt?: number;
};

export function getStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(CLOUD_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeCredentials(creds: StoredCredentials) {
  try {
    localStorage.setItem(CLOUD_AUTH_KEY, JSON.stringify(creds));
  } catch {
    /* ignore */
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(CLOUD_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Open the cloud sign-in popup and resolve with fresh credentials once the user
 * authenticates. Resolves null if the popup is blocked or closed without signing
 * in. Same popup + postMessage contract SharePanel uses (`{ type:
 * 'driftgrid-cloud-auth', accessToken, refreshToken, email }`), so connecting
 * from Sync and from Share are interchangeable.
 */
export function connectToCloud(): Promise<StoredCredentials | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }

    const origin = encodeURIComponent(window.location.origin);
    const w = 960;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    const popup = window.open(
      `${CLOUD_URL}/connect?origin=${origin}`,
      'driftgrid-connect',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`,
    );
    if (!popup) {
      resolve(null); // popup blocked
      return;
    }

    let settled = false;
    const finish = (result: StoredCredentials | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CLOUD_URL) return;
      if (event.data?.type !== 'driftgrid-cloud-auth') return;
      const { accessToken, refreshToken, email } = event.data;
      if (!accessToken) return;
      const creds: StoredCredentials = {
        accessToken,
        refreshToken: refreshToken || '',
        email: email || '',
        expiresAt: Date.now() + 3600 * 1000, // Supabase JWTs default to 1hr
      };
      storeCredentials(creds);
      finish(creds);
    };

    // Resolve null if the user closes the popup without signing in.
    const closedTimer = setInterval(() => {
      if (popup.closed) finish(null);
    }, 500);

    window.addEventListener('message', onMessage);
  });
}
