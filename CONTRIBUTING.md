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

## Reporting issues

Open an issue on GitHub with:
- What you expected
- What happened instead
- Steps to reproduce
- Browser and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
