# Drift — Claude Code Conventions

## What is Drift?

Drift is Jeff's design iteration and client presentation platform. Every design project lives here — Claude Code creates the work, and clients review it in the same place. The repo contains both the Next.js app and all project files.

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

When porting an existing HTML file into a Drift project:

1. **Strip all multi-version scaffolding** — version switchers, JS navigation, external scripts (Figma capture, PDF gen, etc.). The result must be a clean, static, single-page HTML file.
2. **Adapt CSS to the target canvas format.** Do NOT copy source CSS verbatim. The output must match the Drift canvas boilerplate:
   - For locked formats (`landscape-16-9`, `a4-portrait`): `html, body { height: 100vh; overflow: hidden; }`. Never add `height: auto`, `overflow: auto/visible`, or `html.scrollable` overrides.
   - For scrollable formats (`desktop`, `tablet`, `mobile`): use the scrollable boilerplate above.
3. **Remove wrapper classes from the multi-version system** (e.g. `.page`, `.active`, `.v4`). Content should render directly in `<body>` without requiring a specific class to be visible. If the source uses `.page { display: none }` / `.page.active { display: flex }`, refactor so content is always visible.
4. **Test rendering** — the design must look identical to the source when viewed in the Drift viewer at the correct canvas dimensions.

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

## Brand Guidelines

Each client has `projects/{client}/brand/guidelines.md` with colors, fonts, voice, and reference links. Always read this before creating or modifying designs for that client.

## Viewing Designs

- Dashboard: `localhost:3000`
- Viewer: `localhost:3000/view/{client}/{project}`
- Arrow keys navigate: left/right = concepts, up/down = versions
