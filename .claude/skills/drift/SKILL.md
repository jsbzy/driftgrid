---
name: drift
description: |
  Use this skill whenever you're doing any work in Drift — the design iteration and client presentation platform. Trigger for: creating new client projects or design files, adding new concepts or versions to existing projects, importing existing HTML designs into Drift, editing or updating design files, managing manifests, troubleshooting exports. Also trigger when the user says things like "start a project for [client]", "new version", "new concept", "import this into Drift", "add a design for [client]", or when working with files in drift/projects/. If Drift is involved in any way, use this skill.
---

# Drift

Drift is a design iteration platform. Agents create HTML design files; clients review them in the same app. Every project lives at `drift/projects/{client-slug}/{project-slug}/`.

Before creating or editing any design, read the client's brand guidelines: `drift/projects/{client-slug}/brand/guidelines.md`.

---

## New Project Workflow

When the user says "start a new project for [client] called [name], [format]":

1. **Check client folder** — if `projects/{client-slug}/` doesn't exist, create it with a `brand/` folder and a starter `guidelines.md`
2. **Create project folder** — `projects/{client-slug}/{project-slug}/`
3. **Read brand guidelines** — `projects/{client-slug}/brand/guidelines.md`
4. **Create first design file** — `concept-1/v1.html` using the correct canvas boilerplate (see `references/canvas-boilerplate.md`)
5. **Create manifest** — `manifest.json` with one concept, one version (see `references/manifest-schema.md`)
6. **Confirm** — report what was created and where to view it

Always ask for canvas type if not provided (see Canvas Presets below).

---

## Canvas Presets

| Preset | Slug | Width | Height | Behavior |
|--------|------|-------|--------|----------|
| A4 Portrait | `a4-portrait` | 794px | 1123px | locked |
| 16:9 Landscape | `landscape-16-9` | 1920px | 1080px | locked |
| Desktop | `desktop` | 1440px | auto-scroll | responsive |
| Tablet | `tablet` | 768px | auto-scroll | responsive |
| Mobile | `mobile` | 375px | auto-scroll | responsive |
| Freeform | `freeform` | custom | custom | configurable |

"Locked" formats (`a4-portrait`, `landscape-16-9`) must use the locked boilerplate. Everything else uses the scrollable boilerplate. See `references/canvas-boilerplate.md` for exact HTML templates — don't write the boilerplate from memory.

---

## Editable Text Attributes

Every headline, body paragraph, and CTA in a design **must** have `data-drift-editable` attributes. This lets clients suggest copy edits in the review view.

```html
<h1 data-drift-editable="headline" data-drift-maxlen="60">Main Headline</h1>
<p data-drift-editable="body" data-drift-maxlen="200">Body copy...</p>
<span data-drift-editable="cta" data-drift-maxlen="30">Call to Action</span>
```

Use descriptive names: `headline`, `subheadline`, `intro`, `body`, `cta`, `footer`. Set reasonable `data-drift-maxlen` values. If you're touching an existing file and editable attributes are missing — add them.

---

## Version & Concept Workflow

- **"Edit this version"** → modify the HTML file in place, no new file
- **"New version"** → duplicate as `concept-N/v{next}.html`, add to manifest with a changelog entry
- **"New concept"** → create `concept-{next}/v1.html`, add to manifest with description

After any change, keep `manifest.json` in sync. Auto-generate one-liner descriptions for concepts and changelog entries for versions. See `references/manifest-schema.md` for the full schema.

---

## Importing Existing HTML Designs

When porting an HTML file into Drift:

1. **Strip multi-version scaffolding** — remove version switchers, JS navigation, Figma scripts, PDF tools. Output must be a clean, static, single-page HTML file.
2. **Adapt CSS to the target canvas format** — do not copy source CSS verbatim. Match the Drift boilerplate (locked vs. scrollable).
3. **Remove wrapper classes** — things like `.page`, `.active`, `.v4` that rely on JS to be visible. Content must render directly in `<body>`.
4. **Add editable attributes** — add `data-drift-editable` to all text elements.
5. **Test rendering** — the design must look identical to the source at correct canvas dimensions.

---

## Gotchas

These are the most common failure points when working in Drift.

**Images must use local paths — never external URLs.**
The PDF exporter can't reach CDNs or Unsplash hotlinks. Use relative paths like `../../brand/assets/photo.jpg` or absolute Next.js paths like `/projects/{client}/brand/logo.svg`. Store all images in `brand/assets/`.

**Locked canvas CSS is strict.**
For `landscape-16-9` and `a4-portrait`, the body must have `height: 100vh; overflow: hidden;`. Never add `height: auto`, `overflow: auto/visible`, or `html.scrollable`. These break the PDF export and the viewer's letterboxing. If you see these in imported code, strip them.

**Fonts via `<link>`, not `@import`.**
Always include Google Fonts as a `<link>` tag in `<head>`. The Playwright renderer handles `<link>` reliably; `@import` inside CSS can fail in headless export. System fonts are always safe.

**Manifest must stay in sync.**
After creating or modifying concepts/versions, always update `manifest.json`. Missing entries mean the Drift UI won't show the work.

**No responsive breakpoints on locked canvases.**
Never add `@media` queries to locked formats (`a4-portrait`, `landscape-16-9`). They export at exact dimensions; breakpoints will fire unexpectedly and break the layout.

**Read brand guidelines before designing.**
Every client has `projects/{client}/brand/guidelines.md`. Colors, fonts, voice, reference links — all of it lives there. Don't guess at brand choices.

**Scrollable formats: set `max-width`, not `width: 100vw`.**
Desktop/tablet/mobile canvases use `max-width: [width]px; margin: 0 auto;` on body. Using `width: 100vw` causes horizontal overflow issues.

---

## Viewing & Checking Work

- Dashboard: `localhost:3000`
- Admin: `localhost:3000/admin/{client}/{project}`
- Client review: `localhost:3000/review/{client}/{project}`

Before sharing with a client: export as PDF, open the HTML export in a browser, and run `npm run generate-thumbs` from the drift root.

---

## Reference Files

- `references/canvas-boilerplate.md` — exact HTML templates for each canvas type. Read this when creating any design file.
- `references/manifest-schema.md` — full manifest.json schema. Read this when creating or updating a manifest.
