import { NextResponse } from 'next/server';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { promises as fs } from 'fs';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export const dynamic = 'force-dynamic';

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('File watcher is only available in development', { status: 403 });
  }

  const encoder = new TextEncoder();
  const watchers: FSWatcher[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      // Send keepalive comment immediately
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Debounce map to avoid duplicate events for the same file
      const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

      function sendEvent(data: { type: string; client: string; project: string; file: string }) {
        const key = `${data.client}/${data.project}/${data.file}`;

        // Debounce: wait 500ms before sending (HTML files often trigger multiple write events)
        if (debounceMap.has(key)) {
          clearTimeout(debounceMap.get(key)!);
        }

        debounceMap.set(key, setTimeout(() => {
          debounceMap.delete(key);
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream closed
          }
        }, 500));
      }

      // Walk the projects directory and set up watchers
      try {
        const clientDirs = await fs.readdir(PROJECTS_DIR);

        for (const clientSlug of clientDirs) {
          const clientPath = path.join(PROJECTS_DIR, clientSlug);
          try {
            const clientStat = await fs.stat(clientPath);
            if (!clientStat.isDirectory()) continue;
          } catch {
            continue;
          }

          const projectDirs = await fs.readdir(clientPath);

          for (const projectSlug of projectDirs) {
            if (projectSlug === 'brand') continue;

            const projectPath = path.join(clientPath, projectSlug);
            try {
              const projectStat = await fs.stat(projectPath);
              if (!projectStat.isDirectory()) continue;
            } catch {
              continue;
            }

            // Watch the project directory recursively for HTML changes
            try {
              const watcher = watch(projectPath, { recursive: true }, (eventType, filename) => {
                if (!filename) return;
                // Only care about HTML file changes
                if (!filename.endsWith('.html')) return;
                // Ignore .thumbs directory
                if (filename.includes('.thumbs')) return;

                sendEvent({
                  type: 'file-changed',
                  client: clientSlug,
                  project: projectSlug,
                  file: filename,
                });
              });

              watchers.push(watcher);
            } catch {
              // Cannot watch this directory — skip
            }
          }
        }
      } catch {
        // Projects dir doesn't exist
      }

      // Keepalive ping every 30 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      // Cleanup when the stream is cancelled
      const cleanup = () => {
        clearInterval(keepalive);
        for (const [, timeout] of debounceMap) {
          clearTimeout(timeout);
        }
        debounceMap.clear();
        for (const w of watchers) {
          try { w.close(); } catch { /* ignore */ }
        }
        watchers.length = 0;
      };

      // Store cleanup for cancel
      (stream as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },

    cancel() {
      // Trigger cleanup when client disconnects
      const s = stream as unknown as { _cleanup?: () => void };
      if (s._cleanup) s._cleanup();
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
