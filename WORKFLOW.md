# Drift — Workflow Guide

## Starting a project

```bash
cd ~/driftgrid
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
   yourdomain.com/review/{client}/{project}
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

## Export checklist (before every client share)

Run through this every time before pushing a project for client review:

1. **Images render in PDF** — Export PDF locally. If images show as black/missing, they have broken paths. All images must live in `brand/assets/` or the project folder with correct relative/absolute paths.
2. **HTML export scales correctly** — For locked canvases (16:9, A4), open the downloaded HTML at various window sizes. It should letterbox with black bars, not reflow.
3. **Fonts load** — Exported files should use Google Fonts `<link>` tags, not local fonts. Check that headings and body text render in the correct typeface.
4. **Thumbnails are fresh** — Run `npm run generate-thumbs` after any visual changes.
5. **No edit artifacts** — Exported files should not contain `data-drift-editable` attributes or the edit script. (This is handled automatically, but verify if something looks wrong.)

### Common export issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Images black/missing in PDF | Relative URL can't resolve in headless browser | Ensure images are in `brand/assets/` with correct paths |
| HTML export reflows at small windows | Missing viewport lock (only on locked canvases) | Verify `canvasWidth`/`canvasHeight` are set in manifest |
| Fonts fallback to serif/sans-serif | Missing Google Fonts `<link>` in HTML `<head>` | Add the font link tag |
| PDF export 403 on Vercel | Live rendering disabled in production | Run `npm run build-exports` locally and push |

## Production constraints

The Vercel deployment is **read-only**:
- Manifest writes (PUT) return 403
- PDF/PNG/PPTX exports return 403
- HTML download works (reads bundled files)
- All design work happens locally, then gets pushed via git
