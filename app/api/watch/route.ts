import { NextResponse, type NextRequest } from 'next/server';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { promises as fs } from 'fs';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export const dynamic = 'force-dynamic';

type FileChangeEvent = { type: 'file-changed'; client: string; project: string; file: string };
type Subscriber = (ev: FileChangeEvent) => void;

type WatcherEntry = {
  watcher: FSWatcher;
  subscribers: Set<Subscriber>;
  debounce: Map<string, ReturnType<typeof setTimeout>>;
};

const watchers = new Map<string, WatcherEntry>();

function watcherKey(client: string, project: string) {
  return `${client}/${project}`;
}

async function acquireWatcher(client: string, project: string, subscriber: Subscriber): Promise<() => void> {
  const key = watcherKey(client, project);
  const projectPath = path.join(PROJECTS_DIR, client, project);

  let entry = watchers.get(key);
  if (!entry) {
    try {
      const stat = await fs.stat(projectPath);
      if (!stat.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error(`project not found: ${key}`);
    }

    const debounce = new Map<string, ReturnType<typeof setTimeout>>();
    const subscribers = new Set<Subscriber>();

    const fsWatcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith('.html')) return;
      if (filename.includes('.thumbs')) return;

      const existing = debounce.get(filename);
      if (existing) clearTimeout(existing);
      debounce.set(filename, setTimeout(() => {
        debounce.delete(filename);
        const ev: FileChangeEvent = { type: 'file-changed', client, project, file: filename };
        for (const sub of subscribers) {
          try { sub(ev); } catch { /* subscriber errored, ignore */ }
        }
      }, 500));
    });

    entry = { watcher: fsWatcher, subscribers, debounce };
    watchers.set(key, entry);
  }

  entry.subscribers.add(subscriber);

  return () => {
    const current = watchers.get(key);
    if (!current) return;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size === 0) {
      for (const [, t] of current.debounce) clearTimeout(t);
      current.debounce.clear();
      try { current.watcher.close(); } catch { /* already closed */ }
      watchers.delete(key);
    }
  };
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('File watcher is only available in development', { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const client = searchParams.get('client');
  const project = searchParams.get('project');
  if (!client || !project) {
    return new NextResponse('client and project query params are required', { status: 400 });
  }

  const encoder = new TextEncoder();
  let release: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      const subscriber: Subscriber = (ev) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // stream closed
        }
      };

      let acquired: (() => void) | null = null;
      try {
        acquired = await acquireWatcher(client, project, subscriber);
      } catch {
        controller.enqueue(encoder.encode(`event: error\ndata: {"message":"project not found"}\n\n`));
        controller.close();
        return;
      }

      // If cancel() fired during the await above, release immediately — otherwise
      // the subscriber stays in the watcher's Set forever and pins the fs.watch handle.
      if (cancelled) {
        acquired();
        return;
      }
      release = acquired;

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          if (keepalive) clearInterval(keepalive);
        }
      }, 30000);
    },

    cancel() {
      cancelled = true;
      if (keepalive) { clearInterval(keepalive); keepalive = null; }
      if (release) { release(); release = null; }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
