# Contributing to DriftGrid

Thanks for your interest in DriftGrid. Here's how to get started.

## Setup

```bash
git clone https://github.com/jsbzy/driftgrid.git
cd driftgrid
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Creating a test project

```bash
npm run init -- demo test-project
npm run init -- demo pitch-deck --canvas landscape-16-9
```

## Project structure

```
app/           Next.js App Router pages and API routes
components/    React components (Viewer, CanvasView, HtmlFrame, etc.)
lib/           Utilities, types, hooks, constants
scripts/       CLI tools (init, doctor, generate-thumbs, export)
projects/      Design project files (gitignored — create your own)
```

## Development workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint` and `npm run build` to check for errors
4. Test manually — open a project in the grid, navigate, enter fullscreen
5. Open a pull request

## Code style

- TypeScript, strict mode
- Tailwind CSS v4
- Minimal dependencies — avoid adding new packages unless necessary
- Components use `'use client'` directive (Next.js App Router)
- JetBrains Mono as the UI font

## Key conventions

- **Designs are HTML files.** Each version is a self-contained `.html` file with inline CSS/JS.
- **Never overwrite versions.** Create a new version file (`v2.html`, `v3.html`) instead of editing in place.
- **Manifest is the source of truth.** Every project has a `manifest.json` that tracks concepts, versions, and metadata.
- **Local-first.** Everything runs from the filesystem. No database, no cloud dependency.

## Common gotchas

A few traps that have bitten this codebase. Heads up so you don't repeat them.

- **Don't create top-level `_underscore/` dirs.** Tailwind v4 scans the whole project for utility-class candidates and reads binary files as text. `_archive/` (containing PNG thumbnails) once produced broken CSS rules that crashed PostCSS. Use `.dotted/` dirs instead — Tailwind skips them by default.
- **Don't commit `.env.local`.** It's gitignored, but doublecheck before pushing — the file holds Supabase keys, Stripe secrets, and the `OPENAI_API_KEY` used by `bin/gen-image.js`.
- **Stale `.next` caches mess with Tailwind too.** If you see `globals.css` parse errors after a botched dev restart, look for `.next.broken.*` or `.next.stale.*` directories sitting in the project root and move them out (the literal `.next` exclusion doesn't match those variants).
- **Designs in `projects/` are user content, not app code.** Don't import from them, don't reference them in components.
- **Rounds-aware reads.** When iterating `manifest.concepts` directly, you'll get an empty array on rounds-enabled projects. Use `findConceptAndVersion()` (in `app/api/annotations/route.ts`) or the round-aware helpers in `lib/hooks/useManifestMutations.ts`.

## Reporting issues

Open an issue on GitHub with:
- What you expected
- What happened instead
- Steps to reproduce
- Browser and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
