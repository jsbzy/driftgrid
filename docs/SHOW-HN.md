# Show HN Post Draft

## Title
Show HN: DriftGrid — An infinite canvas to manage AI-generated HTML designs

## Body

Hi HN,

I'm a solo designer running a one-person studio. Like most people using AI coding tools (Claude Code, Cursor, etc.) for design work, I'd end up with dozens of HTML files scattered across folders — "hero-v3-final.html", "hero-v4-REAL-final.html", you know the drill. Comparing iterations was painful. Sharing with clients was worse.

DriftGrid is an infinite canvas where my AI agent creates HTML files and I browse/compare/present them. Concepts across, versions down. Zoom around, star your picks, press P to present them fullscreen. Every frame is a real live HTML page, not a screenshot — so interactive prototypes just work.

The part I'm most excited about: **DriftGrid doesn't generate anything.** It's a harness for whatever AI tool you already use. There's a CLAUDE.md file in the root that tells any agent how to create versioned designs in the right structure. Point Claude Code at it and you're iterating in minutes.

Local-first — your files live on your filesystem, nothing gets locked in. There's an optional cloud tier (driftgrid.ai) where you can push a project and get a public share link for client review — but the free self-hosted version is the whole product, not a stripped-down demo.

Try it:
```
git clone https://github.com/jsbzy/driftgrid.git
cd driftgrid && npm install && npm run dev
```

Or see a live demo:
https://driftgrid.ai/s/amVmZi9yZWNvdnJ5YWkvZGVtby1zdG9yeWJvYXJk

Landing page: https://driftgrid.ai
Repo: https://github.com/jsbzy/driftgrid

Would love feedback from anyone doing AI-assisted design work. What breaks your workflow? What would make this actually useful to you?

---

## Notes on timing

- Post to Show HN **early morning US Pacific time** (6-8am PT) for best traction
- Avoid weekends (less engaged HN crowd)
- Be ready to respond to comments within the first 2 hours — that's when the post lives or dies
- Don't ask for upvotes. Just share on Twitter/Bluesky and let it breathe

## First comment (pin yourself)

> A few things I'd love feedback on:
>
> 1. Is "agent harness" the right framing, or does that sound too niche?
> 2. The CLAUDE.md convention file — is this actually useful for people using Cursor/Copilot, or is it Claude Code-specific?
> 3. The cloud tier pricing ($12/mo for sharing + archive). Too low? Too high?
>
> I built this because I needed it. Curious if anyone else has the same problem.
