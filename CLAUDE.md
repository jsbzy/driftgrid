# DriftGrid — Claude Code Conventions

## What is DriftGrid?

DriftGrid is Jeff's design iteration and client presentation platform. Every design project lives here — Claude Code creates the work, and clients review it in the same place. The repo contains both the Next.js app and all project files.

## Project Structure

```
~/drift/
├── app/                              # Next.js app
├── projects/
│   └── {client-slug}/
│       ├── brand/
│       │   ├── guidelines.md         # Colors, fonts, voice, reference URLs
│       │   ├── logo.svg
│       │   └── assets/
│       └── {project-slug}/
│           ├── manifest.json
│           ├── .thumbs/
│           ├── concept-1/
│           │   ├── v1.html
│           │   └── v2.html
│           └── concept-2/
│               └── v1.html
├── CLAUDE.md
└── package.json
```

## Starting a New Project

When Jeff says something like "Start a new project for [client] called [name], [format]":

1. **Check client folder:** If `projects/{client-slug}/` doesn't exist, create it with `brand/` folder and starter `guidelines.md`
2. **Create project folder:** `projects/{client-slug}/{project-slug}/`
3. **Create first file:** `projects/{client-slug}/{project-slug}/concept-1/v1.html` using the correct canvas boilerplate (see Canvas Presets below)
4. **Create manifest:** `projects/{client-slug}/{project-slug}/manifest.json` with project metadata, one concept, one version
5. **Read brand guidelines:** Check `projects/{client-slug}/brand/guidelines.md` for brand context
6. **Report back:** Confirm what was created and where to see it

**Always ask for** (if not provided): client name, project name, canvas type.

## Canvas Presets

| Preset | Slug | Width | Height | Behavior |
|--------|------|-------|--------|----------|
| A4 Portrait | `a4-portrait` | 794px | 1123px | locked |
| 16:9 Landscape | `landscape-16-9` | 1920px | 1080px | locked |
| Desktop | `desktop` | 1440px | auto-scroll | responsive |
| Tablet | `tablet` | 768px | auto-scroll | responsive |
| Mobile | `mobile` | 375px | auto-scroll | responsive |
| Freeform | `freeform` | custom | custom | configurable |

### Canvas Boilerplate (locked formats)

For `a4-portrait` and `landscape-16-9`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Project Name]</title>
    <!-- Google Fonts link here -->
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        body {
            font-family: /* per brand guidelines */;
            -webkit-font-smoothing: antialiased;
        }
        @media print {
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <!-- Design content here -->
</body>
</html>
```

### Canvas Boilerplate (scrollable formats)

For `desktop`, `tablet`, `mobile`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Project Name]</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; }
        body {
            max-width: [width]px;
            margin: 0 auto;
            font-family: /* per brand guidelines */;
            -webkit-font-smoothing: antialiased;
        }
    </style>
</head>
<body>
    <!-- Design content here -->
</body>
</html>
```

## Editable Text Attributes

Always add `data-drift-editable` attributes to key text elements when creating designs:

```html
<h1 data-drift-editable="headline" data-drift-maxlen="60">Main Headline</h1>
<p data-drift-editable="body" data-drift-maxlen="200">Body copy...</p>
<span data-drift-editable="cta" data-drift-maxlen="30">Call to Action</span>
```

Rules:
- Every headline, body paragraph, and CTA should be marked
- Use descriptive names: `headline`, `subheadline`, `intro`, `body`, `cta`, `footer`
- Set reasonable `data-drift-maxlen` values
- These enable clients to suggest copy edits in the review view

## Importing Existing HTML Designs

When porting an existing HTML file into a DriftGrid project:

1. **Strip all multi-version scaffolding** — version switchers, JS navigation, external scripts (Figma capture, PDF gen, etc.). The result must be a clean, static, single-page HTML file.
2. **Adapt CSS to the target canvas format.** Do NOT copy source CSS verbatim. The output must match the DriftGrid canvas boilerplate:
   - For locked formats (`landscape-16-9`, `a4-portrait`): `html, body { height: 100vh; overflow: hidden; }`. Never add `height: auto`, `overflow: auto/visible`, or `html.scrollable` overrides.
   - For scrollable formats (`desktop`, `tablet`, `mobile`): use the scrollable boilerplate above.
3. **Remove wrapper classes from the multi-version system** (e.g. `.page`, `.active`, `.v4`). Content should render directly in `<body>` without requiring a specific class to be visible. If the source uses `.page { display: none }` / `.page.active { display: flex }`, refactor so content is always visible.
4. **Test rendering** — the design must look identical to the source when viewed in the DriftGrid viewer at the correct canvas dimensions.

## Version Workflow

- **"Edit this version"** → modify the HTML file in place, no new file
- **"New version"** → duplicate file as `concept-N/v{next}.html`, add to manifest with changelog
- **"New concept"** → create new `concept-{next}/v1.html`, add to manifest with description

Always:
- Auto-generate a one-liner description per concept
- Add a changelog entry per version
- Keep manifest.json in sync

## Manifest Schema

Key fields:
- `project`: name, slug, client, canvas, created, links
- `concepts[]`: id, label, description, position, visible, versions[]
- `versions[]`: id, number, file, parentId, changelog, visible, starred, created, thumbnail
- `workingSets[]`: named selections of concept/version pairs
- `comments[]`: threaded comments per version
- `clientEdits[]`: tracked text edits from clients

## Code Style

- TypeScript, Next.js App Router
- Tailwind CSS v4
- JetBrains Mono as the UI font
- Minimal, monospace aesthetic — the designs are the hero, not the chrome
- SWR for client-side data fetching

## Export-Safe Design Rules

These rules ensure every design exports correctly as PDF, HTML, and PPTX. Follow them when creating or editing any HTML design file.

### Images must be self-contained

The PDF export (edited/alt versions) and HTML export both embed images as base64 at export time via `HtmlFrame.embedImages()`. This works automatically **only if images are reachable from the browser at export time:**

- **Use relative paths** from the project folder: `../../brand/logo.svg`, `../../brand/assets/photo.jpg`
- **Or absolute paths** served by Next.js: `/projects/{client}/brand/logo.svg`
- **Never use external URLs** (CDNs, Unsplash hotlinks, etc.) — they break in offline/PDF contexts
- **Store all images** in the client's `brand/assets/` folder or the project folder itself
- If an image appears black/missing in export, the URL couldn't be resolved — check the path

### Background images

CSS `background-image: url(...)` is captured by both the screenshot-to-PDF pipeline and the base64 embedding. Rules:
- Always use `background-size: cover` or explicit sizing — never rely on intrinsic image dimensions
- Ensure `background` shorthand includes `no-repeat` when appropriate
- Test with the export button locally before sharing

### Fonts

- Always include Google Fonts `<link>` tags in the `<head>` — the Playwright/Puppeteer renderer needs them
- Don't use `@import` in CSS for fonts — `<link>` loads faster and more reliably in headless browsers
- System fonts (Arial, Helvetica, Georgia) are safe; custom local fonts are not available in export

### Locked canvas export

For locked formats (`landscape-16-9`, `a4-portrait`):
- HTML export auto-injects a viewport-lock script that scales the design to fit any browser window at the correct aspect ratio with black bars (letterboxing)
- PDF export renders at exact canvas dimensions (1920×1080 or 794×1123) — no scaling needed
- Never add responsive breakpoints or `@media` queries to locked canvases

### Pre-flight checklist (before sharing with client)

1. Open the design locally in the DriftGrid viewer — does it render correctly?
2. Export PDF — do all images, backgrounds, and fonts appear?
3. Export HTML — open the downloaded file in a browser at different window sizes. Does it scale correctly?
4. If working set: export the multi-page PDF and verify all pages
5. Generate thumbnails: `npm run generate-thumbs`

## Brand Guidelines

Each client has `projects/{client}/brand/guidelines.md` with colors, fonts, voice, and reference links. Always read this before creating or modifying designs for that client.

## Viewing Designs

- Dashboard: `localhost:3000`
- Admin: `localhost:3000/admin/{client}/{project}`
- Review (client-facing): `localhost:3000/review/{client}/{project}`
- Arrow keys navigate: left/right = concepts, up/down = versions
