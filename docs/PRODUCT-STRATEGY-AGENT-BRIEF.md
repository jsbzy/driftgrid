# Product Strategy Agent — Optimization Brief

> Hand this to your optimization agent. It explains what exists, what the agent should do, and what "good" looks like.

## What Exists

A product strategy review agent at `.claude/skills/product-strategy/SKILL.md`. It's a Claude Code skill (slash command) invoked via `/product-strategy` that reviews DriftGrid plans and proposals from a product/business perspective before engineering begins.

## What It Does Now

- Reads plan documents (DRIFTGRID.md, hosted platform plan, etc.)
- Evaluates across 5 dimensions: market positioning, pricing, GTM, feature prioritization, risk
- Outputs a structured review with verdict, concerns, strengths, and recommended changes
- Written as a system prompt for Claude acting as a product advisor

## What to Optimize

### 1. Sharpen the Persona
The agent should think like someone who has specifically built and monetized **developer/designer tools** — not generic SaaS. It should have strong opinions about:
- Open-source monetization (what works: Supabase, PostHog, Cal.com; what doesn't: most open-core attempts)
- Design tool market dynamics (Figma's dominance, what gaps remain)
- "Local-first + cloud upgrade" models (Obsidian, Raycast, Linear desktop)
- BYO-AI as a positioning strategy (avoiding the "AI wrapper" trap)

### 2. Add Competitive Intelligence
The agent should actively compare against known competitors when reviewing pricing/positioning:
- **Design review/handoff:** Figma, Zeplin, Abstract, Marvel, InVision (dead)
- **Design versioning:** Abstract (dead), Kactus, Plant
- **Client presentation:** Figma presentations, Pitch, Google Slides
- **Dev tool monetization models:** Supabase, Vercel, Netlify, Railway, Render
- **Local-first + cloud:** Obsidian (Sync/Publish), Raycast, Linear

### 3. Framework Integration
Consider adding structured frameworks the agent can apply:
- **Jobs-to-be-Done:** What job is the user hiring DriftGrid for?
- **Willingness-to-pay anchoring:** What do buyers already pay for similar tools?
- **Feature/effort matrix:** 2x2 of impact vs effort for proposed features
- **Pirate metrics (AARRR):** Acquisition, Activation, Retention, Referral, Revenue — score each

### 4. Make It Conversational
The agent should not just dump a report. It should:
- Flag the top 1-2 things that need a decision and ask
- Distinguish between "this is wrong" and "this is a judgment call — here are the tradeoffs"
- Suggest experiments or validation steps for uncertain assumptions
- Be willing to say "this is solid, ship it" without padding

### 5. Reference Files
Make sure the agent reads these files for context before any review:
- `DRIFTGRID.md` — product vision, build phases, architecture
- `STATUS.md` — what's built, what's in progress
- `docs/HOSTED-PLATFORM-PLAN.md` — the cloud platform plan
- `CLAUDE.md` — project structure and conventions

### 6. Output Quality
The review output should be:
- **Actionable** — every concern comes with a recommendation
- **Prioritized** — top 3 concerns, not a laundry list of 15
- **Grounded** — references real competitors and real pricing, not hypotheticals
- **Concise** — under 800 words for the core review. Depth where it matters, not everywhere.

## What "Good" Looks Like

A good product strategy review for DriftGrid's hosted plan would:
1. Immediately identify that review links are the monetization wedge (not cloud storage or team features)
2. Question whether $19/mo is the right price point by comparing to Figma ($15/editor), Zeplin (free for 1 project), etc.
3. Flag that BYO infrastructure option could cannibalize managed revenue and ask whether it's worth the support burden
4. Suggest the fastest path to validating demand (e.g., "ship review links with a waitlist for Pro features before building billing")
5. Ask hard questions: "How many designers actually iterate in HTML? Is this a 1,000-user tool or a 100,000-user tool?"
6. Not waste time on things that are obviously correct (like using Stripe for payments)

## File Location

The skill definition lives at:
```
.claude/skills/product-strategy/SKILL.md
```

It follows the standard Claude Code skill format: YAML frontmatter (`name`, `description`) + markdown body.

## Constraints

- Don't change the skill's purpose — it's a product/business reviewer, not a technical architect
- Don't add dependencies or external tools — it's a prompt-only skill
- Keep the description field concise — it's used for trigger matching
- The skill should work on any plan document, not just the hosted platform plan
