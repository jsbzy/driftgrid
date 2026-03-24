# DriftGrid — AI Workflow Conventions

> Add this to your CLAUDE.md or AI coding assistant context so it understands how to work with DriftGrid projects.

## What DriftGrid Is

DriftGrid is a design iteration platform. Designs are HTML files organized into **concepts** (columns) and **versions** (rows). You iterate by creating new versions, never by overwriting existing ones.

## Core Rule: Always Create New Versions

When asked to edit an existing design file (e.g. `concept-1/v3.html`):

1. **Copy** the file to the next version number: `concept-1/v4.html`
2. **Edit** the copy, not the original
3. **Update** `manifest.json` to add the new version entry
4. The original file stays untouched as a reference

**Why:** DriftGrid's value is in preserving every iteration. The designer can scroll through v1→v2→v3→v4 and see the evolution. Overwriting destroys history.

**Exception:** If the user explicitly says "edit this in place" or "fix this version," then modify the file directly.

## Project Structure

```
projects/{client}/{project}/
├── manifest.json          # Project metadata + concepts/versions
├── .thumbs/               # Auto-generated thumbnails (don't edit)
├── concept-1/
│   ├── v1.html            # First iteration
│   ├── v2.html            # Second iteration
│   └── v3.html            # Latest
└── concept-2/
    └── v1.html
```

## Manifest Schema

When adding a new version, add an entry like this to the concept's `versions` array:

```json
{
  "id": "v4",
  "number": 4,
  "file": "concept-1/v4.html",
  "parentId": "v3",
  "changelog": "Brief description of what changed",
  "visible": true,
  "starred": false,
  "created": "2026-03-23T00:00:00.000Z",
  "thumbnail": ".thumbs/concept-1-v4.png"
}
```

**Fields:**
- `id`: Version identifier (usually `v{number}`)
- `number`: Sequential version number
- `file`: Path relative to the project folder
- `parentId`: The version this was derived from (null if first)
- `changelog`: One-line description of changes (required)
- `visible`: Whether it shows in client review mode
- `starred`: Whether it's marked as a select
- `thumbnail`: Path to thumbnail (auto-generated, can be empty string initially)

## Creating a New Concept

When the user wants a new design direction:

1. Create a new folder: `concept-{N}/`
2. Create `concept-{N}/v1.html`
3. Add a new concept entry to `manifest.json`:

```json
{
  "id": "concept-{N}",
  "label": "Descriptive Label",
  "description": "What this concept explores",
  "position": {N},
  "visible": true,
  "versions": [{ ... }]
}
```

## Canvas Presets

HTML files should follow these boilerplates depending on the canvas type:

### Locked Canvas (16:9 presentations, A4 documents)
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100vh; overflow: hidden; }
    </style>
</head>
<body>
    <!-- Design content -->
</body>
</html>
```

### Scrollable Canvas (desktop, tablet, mobile)
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; }
        body { max-width: {width}px; margin: 0 auto; }
    </style>
</head>
<body>
    <!-- Design content -->
</body>
</html>
```

## Design Rules

- **Self-contained:** Each HTML file must be self-contained (inline CSS/JS, no external dependencies except Google Fonts)
- **Images:** Use relative paths from the project folder, or store in `projects/{client}/brand/assets/`
- **Fonts:** Use `<link>` tags for Google Fonts (not `@import`)
- **No external URLs:** Don't hotlink images from CDNs — they break in export
- **Editable text:** Add `data-drift-editable="label"` to text elements clients should be able to edit

## Workflow Tips

1. **Copy the filepath** from DriftGrid's grid view (copy icon on each card) and paste it into your AI prompt to reference a specific version
2. **Use the changelog** to describe what you changed — it shows in the grid view
3. **Star your favorites** as you iterate — they appear in the selects tray for presentation
4. **Export selects** as a PDF deck when ready to present to clients
