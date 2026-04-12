# DriftGrid — Claude Code Conventions

## What is DriftGrid?

DriftGrid is a design iteration and client presentation platform. Every design project lives here — AI tools create the work, and clients review it in the same place. The repo contains both the Next.js app and all project files.

## Project Structure

```
~/driftgrid/
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

DriftGrid is a design iteration platform for agents. When the user asks to start a new project, or when this is a fresh install with no projects yet, walk them through onboarding. Tell them upfront: "I'll ask you 3 quick questions to set up your project, then we can start designing."

### Step 1 — Gather info (3 questions)
Ask these one at a time:
1. **Client name** — who is this for? (e.g. "Acme", "Nike", or "personal")
2. **Project name** — what are we making? (e.g. "Landing Page", "Pitch Deck", "Brand Identity")
3. **Canvas preset** — present as a numbered list so the user can just type a number:
   ```
   What format? (enter a number, default: 1)

   1. Desktop (1440px, scrollable) — websites, dashboards
   2. Mobile (375px, scrollable) — app screens
   3. 16:9 Landscape (1920×1080) — presentations, slides, decks
   4. A4 Portrait (794×1123) — documents, one-pagers
   5. Tablet (768px, scrollable) — tablet layouts
   ```
   Map the number to the preset slug: 1=desktop, 2=mobile, 3=landscape-16-9, 4=a4-portrait, 5=tablet.

### Step 2 — Run init
Use the built-in init script — do NOT create files manually:
```bash
node bin/driftgrid.js init "{client}" "{project}" --canvas {preset}
```
This creates the project structure with 3 empty concept slots (Direction A, B, C), a manifest, and brand guidelines.

### Step 3 — Brand & reference (optional)
Ask: "Want to set up brand guidelines now, or skip and jump straight into designing? You can always add brand details later."

If they want to set up brand:
- Read the generated `projects/{client}/brand/guidelines.md`
- Ask for colors, fonts, voice, reference links
- If they provide a website URL, visit it and extract brand details automatically

If they skip, move on immediately.

### Step 4 — Start the server (if not running)
```bash
npm run dev
```
Tell the user: "Open **localhost:3000** — you'll see your project. I'll start creating designs now."

Before writing any files, open the browser:
```bash
open http://localhost:3000/admin/{client}/{project}
```

### Step 5 — Create the first designs
Ask: "How many design directions would you like? (default: 3). Any reference material — copy docs, briefs, existing designs?"

**Important:** The init script already created the v1.html files. You MUST read each file before overwriting it (Claude Code requires Read before Write on existing files). Read all concept HTML files first, then write your designs.

**Before writing designs**, update the manifest to show "Agent working" on each slot. This triggers a progress animation in the grid so the user sees all 3 cards being worked on:
1. Read `manifest.json`
2. Set `changelog: "Agent working"` on each concept's v1 version
3. Write the updated manifest
4. Then write the HTML files
5. After all designs are done, update the manifest again with real changelogs (e.g., "Clean minimal direction with hero layout")

Fill in each concept slot with a distinct design direction. Each should be a complete take on the project brief. Use any brand guidelines and reference material, follow the canvas boilerplate rules below, and make each direction meaningfully different — not just color swaps.

**After creating each design, always include the localhost link:**
Tell the user: "Direction A is ready → http://localhost:3000/admin/{client}/{project}#concept-slug/v1"

After creating designs, present a summary table with links to each design, then teach the user how to use DriftGrid. Always include the localhost URL for each concept:

Example:
| # | Direction | Link |
|---|-----------|------|
| 1 | Clean Minimal | http://localhost:3000/admin/{client}/{project}#concept-slug/v1 |
| 2 | Dark Athletic | http://localhost:3000/admin/{client}/{project}#concept-slug/v1 |
| 3 | Mint Split | http://localhost:3000/admin/{client}/{project}#concept-slug/v1 |

Then show the keyboard reference:

```
Your designs are ready. Here's how to work with them:

BROWSE
  Arrow keys     Navigate between cards on the grid
  Enter          Zoom into a frame (full view)
  G              Back to grid from frame view

ITERATE
  D              Drift up — create a new version of the current card
  Shift+D        Drift right — start a new concept column (new direction)
  C              Comment — leave feedback on a frame (press C, click to pin)

CURATE
  S              Star a card (mark as a favorite)
  P              Present — fullscreen slideshow of starred versions
  Cmd+C / Cmd+V  Copy and paste cards between concepts

SHARE
  Share button (top-right of grid) creates a link for client review.
  Clients can browse and leave comments — no account needed.

TWO WAYS TO ITERATE
  From the grid — D to drift up (new version), Shift+D to drift
    right (new concept), C to comment. Keep drifting up and to the right.
  From here — just tell me what you want. Examples:
    "Make concept 2 bolder with bigger type"
    "Create a dark version of concept 1"
    "Drift right with a split-layout approach"
    "Iterate on all 3 with more whitespace"
  I'll write the HTML and it appears in your grid automatically.
```

Ask: "Want me to iterate on any of these directions? You can also browse the grid and come back with feedback anytime."

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

**When the user provides a filepath with feedback, edit THAT exact file.** The filepath is the source of truth — never override it with your own sense of which version is "latest" or "current." If the user says `two-ways/round-3/v1.html`, edit v1, not v2.

Always:
- Keep manifest.json in sync
- Follow the naming conventions below

## Naming Conventions

### Concepts (columns)
Concepts represent **design directions**. Always use 1–2 word descriptive labels that capture the style or mood — never "Concept 1", "Concept 2."

**Format:** `{Style/Mood}` or `{Style} {Element}`
**Examples:** "Bold Minimal", "Dark Editorial", "Gradient Hero", "Warm Split", "Clean Mono"

The name describes the DIRECTION, not the content. Two concepts for the same page might be "Light Airy" and "Dark Cinematic" — you can tell them apart at a glance.

### Versions (rows within a concept)
Versions represent **iterations** of the same direction. They use auto-incremented `v{N}` numbers as permanent identity.

- `v1`, `v2`, `v3` — sequential, permanent, never changes even if reordered on the grid
- **Always include a changelog** describing what changed: "Larger hero image", "Client feedback applied", "Warmer palette"
- The changelog is stored in `version.changelog` and surfaced on hover / in the UI
- Version numbers are the primary way to refer to a specific design: "Bold Minimal v3"

### Referring to designs
- In conversation: `"{Concept} v{N}"` — e.g., "Dark Editorial v3"
- In URLs: `#{concept-slug}/v{N}` — e.g., `#dark-editorial/v3`
- In file paths: `concept-slug/v{N}.html`

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

## Structural Changes — Test Against Demo

When modifying DriftGrid's code (not a specific client project), always validate against `projects/demo/` data:
- `demo/reorder-test` — 3 concepts × 3 versions, good for grid/reorder/keyboard testing
- `demo/wavelength` — multi-round (R1 + R2), good for round creation/switching
- `demo/getting-started` — minimal (2 concepts, few versions)

Reproduce the bug in demo data first, fix, verify against demo, then confirm the client case is also resolved. Never test structural changes only against client projects.

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

## Design Review — MANDATORY

Before presenting ANY design version, run a minimum 3-pass internal design review as an Apple lead designer. Do NOT present work without completing this.

**Pass 1 — Structure & Layout:**
- Does the phone shell fill completely? (No body background bleeding through)
- Does flex:1 actually fill? Do containers extend where they should?
- Is the home indicator inside the visual frame?
- Does content distribute well vertically?

**Pass 2 — Spacing & Alignment:**
- Consistent gaps, no cramped areas, no unintentional empty zones
- Elements that should align actually do — check the padding math
- Typography: readable sizes, clear hierarchy, proper line-height
- Contrast: text readable on backgrounds, elements don't blend

**Pass 3 — Visual Fidelity:**
- If there's a Figma screenshot, side-by-side compare EVERY element
- Check: colors, border-radius, font sizes, weights, padding, margins
- Verify interactive elements look correct (buttons, sliders, inputs)
- Check for clipping, overflow, or content cutoff at container edges

Only present after you would sign off on it yourself. If something looks off, fix it before showing.

## Brand Guidelines

Each client has `projects/{client}/brand/guidelines.md` with colors, fonts, voice, and reference links. Always read this before creating or modifying designs for that client.

## Viewing Designs

- Dashboard: `localhost:3000`
- Admin: `localhost:3000/admin/{client}/{project}`
- Review (client-facing): `localhost:3000/review/{client}/{project}`
- Arrow keys navigate: left/right = concepts, up/down = versions

## Keyboard Shortcuts (Grid View)

| Key | Action |
|-----|--------|
| Arrow keys | Navigate between cards |
| Shift+Arrow | Extend multi-selection |
| Alt/⌥+Arrow | Reorder (move cards/columns) |
| S | Toggle star on current card |
| D | Drift (create new version) |
| ⇧D | Branch (fork into new concept) |
| Cmd+C | Copy card(s) to clipboard |
| Cmd+V | Paste clipboard into current concept |
| Cmd+K | Command palette |
| Enter | Enter frame view |
| Escape | Exit selection / deselect column |
| P | Present starred versions fullscreen |

### Reorder System (Alt+Arrow)
- **Column reorder:** Click column label to select → ⌥←/⌥→ moves column. Click canvas to deselect.
- **Card reorder within column:** ⌥↑/⌥↓ moves card up/down
- **Card swap between columns:** ⌥←/⌥→ swaps card with adjacent column at same row
- Animations: 500ms ease-out-expo. Viewport stays put during reorder.

### Multi-Select (Shift+Arrow or Shift+Click)
- Shift+Arrow extends selection from current card
- Plain Arrow clears multi-select and navigates normally
- Multi-selected cards show blue outline

### Stars (Selects)
- Stars are a `Set<string>` of `conceptId:versionId` keys — **multiple stars per column allowed**
- Star any number of versions across any concepts
- Starred versions can be presented (P), exported, or used to create new rounds
- Gold star icon + gold dot on column label indicate starred versions

### Clipboard (Cmd+C / Cmd+V)
- Cmd+C copies current card or multi-selection to clipboard state
- Cmd+V pastes as new version(s) in the current concept column
- Works across rounds — switch round, navigate, paste
- Uses `/api/paste` endpoint (copies HTML file + creates version entry)

## Version Ordering

- **Array position is the source of truth** — `getManifest()` does NOT sort versions. The order saved in `manifest.json` is the order used.
- Layout `reverse()` puts last-in-array at visual top of column
- `isLatest` = last element in the versions array (not timestamp-based)
- Latest version shows a **gold left-edge bar** on the card
- New versions from drift always append at end of array → appear at top
- Alt+Arrow reorder persists because the saved array order is respected
- Timestamps (`created`) are metadata only — never used for ordering or `isLatest`

### URL Hashes
- Format: `#concept-slug/v{N}` (e.g., `#dark-code/v3`)
- Legacy letter format (`#slug/c`) still parses correctly but new URLs use `v{N}`

## DriftGrid Conventions

This project uses DriftGrid for design iteration. Key rules:

- **Never overwrite versions.** Copy to the next version number (v2, v3, etc.) and edit the copy.
- **Update manifest.json** when adding versions or concepts.
- **HTML files must be self-contained** — inline CSS/JS, Google Fonts via `<link>` tags, no external URLs.
- **Canvas preset:** `desktop` (1440 x auto)

### API Endpoints (localhost:3000)
- `GET /api/current` — what the user is currently viewing
- `POST /api/iterate` — create a new version (drift)
- `POST /api/branch` — fork into a new concept
- `POST /api/create-project` — create a new project
- `GET /api/annotations?client=X&project=Y&conceptId=Z&versionId=W` — get feedback annotations
- `POST /api/paste` — paste a version into a target concept (copies HTML file)
- `POST /api/rounds` — close/create/copy-to round
- `PATCH /api/annotations` — resolve/unresolve an annotation

### Rounds (Pages)

Rounds work like **Figma pages** — each round is its own board with its own concepts and versions. Switching between rounds changes the entire canvas view.

**Data model:** `manifest.rounds[]` — each round has its own `concepts[]` array. The top-level `manifest.concepts` is a convenience alias that always points to the latest round's concepts.

**Closing a round:**
1. `POST /api/rounds` with `action: "close"` — saves selects as the approved baseline, sets `closedAt`
2. MCP: `close_round(client, project, selects, roundId?)`

**Creating a new round:**
1. `POST /api/rounds` with `action: "create"` — copies selected concepts/versions into a fresh round
2. MCP: `create_round(client, project, selections, sourceRoundId?)`
3. HTML files are duplicated into `concept-slug/round-N/v1.html`

**Reading the baseline:**
1. MCP: `get_round_baseline(client, project, roundNumber?)` — returns the selects from a closed round
2. The selects are the **approved state** — build new versions that evolve from them

### Feedback & Annotations

DriftGrid has two types of annotations on frames:

1. **Designer → Agent** (author: "designer") — Direct instructions for you (Claude). When these exist, the designer wants you to apply them.
2. **Client → Designer** (isClient: true) — Client feedback for the designer to review. Do NOT auto-apply these — the designer decides what to act on.

**Before editing any version**, check for designer feedback:
- If MCP is available: call `get_feedback(client, project, conceptId, versionId)`
- If not: check for a `.feedback.md` sidecar file next to the HTML (e.g., `concept-1/v3.feedback.md`)

**When designer feedback (prompts) exist:**
- List the prompts and ask: "I see N prompts on this version. Want me to apply them?"
- Wait for confirmation before making changes
- **Before starting work**, set the prompt status to 'running' so the grid shows a loading animation:
  ```
  PATCH /api/annotations { client, project, conceptId, versionId, annotationId, status: 'running' }
  ```
- Create a new version (drift) with the changes — don't overwrite the original
- **Reply to each prompt you addressed** using `add_feedback` with `parentId` set to the original prompt's ID. Example: prompt says "Make headline bigger" → after fixing, reply with "Done — increased from 32px to 48px". This creates a threaded conversation visible in DriftGrid.
- **Clear the running status** after work is complete:
  ```
  PATCH /api/annotations { client, project, conceptId, versionId, annotationId, status: null }
  ```

**When client feedback exists (isClient: true):**
- Mention it: "There's also client feedback on this version — want me to review it?"
- Only apply if the designer explicitly asks
- Client feedback is for the designer's judgment, not automatic application
