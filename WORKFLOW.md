# Drift — Workflow Guide

## Starting a project

```bash
cd ~/drift
```

Tell Claude Code:
> "Start a new project for [client] called [name], [canvas type]"

Example:
> "Start a new project for acme called brand-refresh, landscape-16-9"

Claude will create the project folder, manifest, brand guidelines (if new client), and first HTML file per CLAUDE.md conventions.

## Iterating

- **"Edit this version"** — modifies the current HTML file in place
- **"New version"** — duplicates the current file as v{next}, adds manifest entry with changelog
- **"New concept"** — creates a new concept folder with v1, adds to manifest

## Previewing locally

```bash
npm run dev
```

Open `localhost:3000` — the dashboard shows all projects. Click into any project to review with keyboard navigation (arrow keys: left/right = concepts, up/down = versions).

## Sharing with clients

1. Generate thumbnails for the grid view:
   ```bash
   npm run generate-thumbs
   ```

2. Commit and push:
   ```bash
   git add .
   git commit -m "update [client] [project]"
   git push
   ```

3. Vercel auto-deploys. Client reviews at:
   ```
   driftlab.io/review/{client}/{project}
   ```

**Note:** The production site is password-protected. Set `DRIFT_PASSWORD` in Vercel environment variables and share the password with your client.

## Exporting (local only)

Exports that require rendering (PDF, PNG, PPTX) only work locally — they need Playwright. HTML download works everywhere.

Use the export button in the viewer, or run exports via the API:

```bash
curl -X POST http://localhost:3000/api/export \
  -H 'Content-Type: application/json' \
  -d '{"client":"acme","project":"brand-refresh","format":"pdf","versionId":"..."}'
```

## Production constraints

The Vercel deployment is **read-only**:
- Manifest writes (PUT) return 403
- PDF/PNG/PPTX exports return 403
- HTML download works (reads bundled files)
- All design work happens locally, then gets pushed via git
