# Design iteration for agents

*An opinionated exploration of what DriftGrid is for, written April 2026.*

---

## The thesis

**DriftGrid is the creative interface between AI agents and humans, built for exploration rather than one-shot generation.**

Not a tool designers use. Not a chat the agent lives in. Not a wrapper around a model. DriftGrid is the surface where an agent shows *many* attempts, a human steers, and the next attempt branches from whichever direction got traction.

Two claims make this a real position, not a slogan:

1. **Most AI-for-creative tools optimize for *getting the answer* (one-shot). DriftGrid optimizes for *exploring the space* (version, drift, compare, pick, drift again).** This is not a feature difference. It's a difference in what interaction the product is *for*.

2. **Exploration is an interaction shape, not a feature bundle.** Claude Artifacts, v0, and Bolt can't add "exploration mode" the way they added image upload or MCP. The whole surface is built around a single artifact with linear edits. Branching has to be the floor the product stands on — not a toggle.

If the first claim is wrong, the market has voted and DriftGrid is a museum piece. If the second claim is wrong, the frontier labs will ship this in a quarter. The rest of this document is the case that both claims hold up, honestly examined, and what DriftGrid should do if they do.

---

## Where the industry is actually headed

### The volume problem, and who gets buried

The generation bottleneck is gone. A designer with a decent prompt and Claude Code can produce thirty usable landing-page directions in an afternoon. A PM with v0 can spin up eight dashboard variants before lunch. The model no longer stalls on "what would this look like" — it stalls on "which of these should we use."

That's the real shift. Generation got cheap; *selection* and *iteration* didn't. The cost curve is now weighted toward the humans in the loop — their attention, their taste, their ability to hold two variants side-by-side and actually compare them instead of just defaulting to whichever was generated last.

Every tool in the artifact-per-message class ([Claude Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them), [v0](https://v0.app/changelog), [Lovable](https://lovable.dev), [Bolt](https://www.banani.co/blog/bolt-new-ai-review-and-alternatives), [Replit Agent](https://blog.replit.com/introducing-agent-4-built-for-creativity)) ships the same grammar: prompt on the left, live artifact on the right, a linear stack of numbered versions at the bottom. You can scroll back, you can restore, you can't meaningfully compare. Artifacts' "edit a past message" quietly creates a branch, but there is no branch visualizer, no side-by-side diff, no way to name or curate directions. Every one of these tools treats iteration as an undo buffer.

That's a bet. It says users don't need to see the shape of the space they're exploring — they just need the latest output.

### The agent-in-IDE class already broke this

The agent-in-IDE class ([Cursor](https://cursor.com/changelog), [Claude Code](https://docs.anthropic.com/en/docs/claude-code/sub-agents), Aider, Cline) figured out earlier that generation is cheap and selection is the bottleneck. [Cursor 3.0 shipped `/best-of-n`](https://cursor.com/blog/2-0) in April 2026: the same task runs in parallel across models in isolated git worktrees, and the outcomes are compared. Agent Tabs lets you see multiple chats side-by-side or in a grid. Design Mode lets you point at UI elements in a live browser and route feedback back to the agent.

This is exploration-as-UI, shipped, working. It's pointed at code.

What it reveals: the exploration-oriented interaction shape is *already understood* inside the industry. It just hasn't been built for non-code artifacts yet. Cursor's bet is that developers want to compare branches. Nobody has made the same bet for designers, PMs, founders, or clients — who arguably want it *more*, because a diff of two React components can be read line-by-line, and a diff of two marketing pages can only be felt.

### The reviewer identity problem

Here is the pattern that matters most, because it's where DriftGrid can plant a flag the rest of the industry is quietly refusing to:

- Replit pitches PMs.
- v0 pitches developers.
- Lovable pitches "co-founders."
- Figma Make pitches designers.
- **Nobody pitches the client.**
- **Nobody pitches the executive reviewer.**

Every tool has a model of the generator. None of them have a model of the *reviewer* — the person who is going to look at five agent-produced directions and choose one. In current products, that person is an afterthought: a PR comment, a screenshot in Slack, a Loom walkthrough, a "what do you think of this" in chat. The artifact goes one way, the opinion comes back another.

This is the space DriftGrid sits in. The reviewer is not a second-class citizen. They get the first-class object — a grid of directions, each clickable, each comparable, each annotatable. The agent is the generator; the reviewer picks what next; the loop runs again.

### Where DriftGrid is now, and where it could sit

As currently built, DriftGrid is designer-primary with agent-as-tool. The MCP server exposes a full surface (`create_version`, `branch_concept`, `close_round`, `get_feedback`, `add_feedback`), but the UI is optimized for a human operator at a keyboard. Alt+Arrow reorder, D to drift, S to star, P to present. The agent writes HTML, the designer arranges the grid. Clients come in through a separate `/review/` surface and comment on polished selects.

If the thesis holds, DriftGrid should sit one step to the left of where it is now. The *agent* is the primary operator — generating directions, drifting, branching, responding to feedback. The *reviewer* (designer, PM, founder, client) is the primary audience, not the primary operator. The interface flattens: everyone sees the same grid. The agent is the engine in the back; the grid is the interface in the front.

The current designer-heavy UX is a transitional state, not a destination.

---

## Pushing the thesis to its edges

What does the thesis look like at the extreme? This section is speculative on purpose — to find where the idea breaks and where it's actually worth something.

**What if DriftGrid is the *only* interface between the agent and the human?** Across every medium. Designs today; slide decks, ad creative, email campaigns, PRDs, research briefs tomorrow. The agent produces artifacts, DriftGrid versions them, humans steer. The chat becomes plumbing. The grid becomes the primary view of "what the agent is doing for me."

This is not as far-fetched as it sounds. For a founder reviewing a landing page, a deck, and a pitch letter that all have to ship Tuesday, the tool that shows all three in one organized surface wins. For an agency PM reviewing a designer's AI output, the tool that makes iteration legible across client deliverables wins. The medium specificity is a near-term blocker, not a permanent one — and every other horizontal creative tool (Notion, Figma, Linear) started medium-specific and generalized.

**What if "iterate" is the primitive, not "generate"?** Every object in DriftGrid is a point in a space that the agent is exploring. The present is a drift from the past. The future is a prompt against the current. The grid isn't *history* — it's *geography*. You don't scroll through chronological versions; you navigate a shape.

This is a departure from every other tool. It says the canonical agent action is not "write this thing" but "explore this direction." It also aligns with how creative work actually happens: you don't know the answer when you start; you generate, compare, pick, generate again. DriftGrid as built already supports this loop. The question is whether to make it *the* primitive.

**What if the agent never shows the chat?** The designer opens the grid. The agent is running. New cards appear in the grid as the agent produces work. The designer stars, comments, drifts, branches. The chat is a sidebar, or absent entirely. The artifact *is* the conversation.

This is the version that most aggressively departs from the current industry. Every one of our competitors' tools makes the chat the center — the artifact is a window *next to* the chat. Flipping this inverts who the tool is for: the reviewer, not the prompter. It also creates a second-order behavior: the designer stops writing prompts and starts steering by *selection*. The chat becomes the low-bandwidth channel; the grid becomes the high-bandwidth one.

**What if multiple agents work in the same grid?** Concept 1 is Claude Code's take; Concept 2 is Cursor's; Concept 3 is GPT-5.4 Canvas's. The human compares and picks. The tool is a multi-tenant surface for *multi-agent exploration* — the agents don't even know about each other, but the human sees them side-by-side.

This only matters if you believe the model layer is commoditizing (it is), which means the value captured by the tool is increasingly in the *surface that lets you compare models*, not the models themselves. If Cursor's `/best-of-n` validated this for code, DriftGrid can be the `/best-of-n` for everything visual.

### The canvas is the deliverable

Here is a point worth pulling up to a first-class argument, because it's a genuine wedge and the rest of the industry has built past it without noticing.

Every other tool in the AI-for-creative space outputs a *representation* of the thing, not the thing itself.

- **Figma's** native format is Figma files — vectors, frames, auto-layout. Shipping a design means a developer or designer translates Figma's representation into HTML. Figma Make generates "code," but the code is Figma-component-flavored React that writes back into Figma files via MCP. The artifact is still a Figma file.
- **v0, Bolt, Lovable** output code, but the artifact is project-shaped — a whole app with a framework, routing, state. The output is a *running thing*, not a *deliverable*. Shipping a v0 page means forking a Next.js repo and deploying it.
- **Claude Artifacts** outputs real HTML, but it's session-bound — tied to a chat, not durable, not linkable as its own object. Close the chat and the artifact drifts away.
- **DriftGrid** outputs HTML that *is* the final thing. Inline CSS, inline JS, self-contained, linkable. The canvas in the grid is the deliverable. No translation step, no fork-and-deploy, no "now rebuild this in your framework." The agent produced a web page and the web page is on the internet.

This is not a detail. This is the closest thing to a *canvas-native* property in the AI-creative space. Paper works because the artifact is the medium. Print works because the artifact is the medium. Figma *doesn't* work because the artifact (a Figma file) is not the medium (a shipped website or product) — there is always a translation step, and translation is where design intent degrades. DriftGrid skips the translation step. An agent writing HTML in DriftGrid is producing the same object the internet runs on.

The second-order effect: the browser is infinitely more expressive than any tool's canvas. You can embed real fonts, real typography, real interactivity, real motion, real video, real iframes of other tools. The canvas is the browser. Anything the browser can do, the agent can put on a card. Figma can't animate in real time. A Claude Artifact can't embed a YouTube video and a live API call on the same page. A DriftGrid concept can.

This is, quietly, the reason DriftGrid can exist in a world of one-shot artifact tools. The others are building "design tools that output code." DriftGrid is building "the grid where HTML lives, versioned and compared." The first framing has Figma as the incumbent. The second framing has *no incumbent* — because nobody else has committed to treating the web page as the unit.

The implication for positioning: "the creative interface between agents and humans" is the umbrella, but underneath it lives a more specific claim — **we are the only tool where the agent's output is directly the thing that ships.** That's worth naming.

### Marketing to agents

This is the idea that sounds speculative and is actually closer than it reads. It follows from the thesis in a clean way: if the agent is the primary operator, then the agent is also the party that chooses which tools it uses.

What does that look like, concretely?

An agent writing a landing page for a founder is given a prompt: "I need to show five variations to my team, with a URL each, that we can comment on." The agent's job, in the current world, is to guess — maybe it spins up five v0 projects, maybe it pastes five Artifacts links into chat, maybe it ships a single Next.js app with a version switcher. In a future world, the agent *looks for the right tool*. It reads docs. It evaluates MCP surfaces. It checks whether the tool actually solves the problem the prompt set. Then it uses the tool and returns a single URL to the human with the whole compare surface ready to go.

That future is already here in fragments. Claude Code recommends tools unprompted based on its training and its access to the web. [Anthropic's Managed Agents](https://siliconangle.com/2026/04/08/anthropic-launches-claude-managed-agents-speed-ai-agent-development/) runs subagents with web access and tool discovery built in. MCP as a protocol is explicitly designed for agents to find and use tools at runtime. The bottleneck is not whether agents *can* discover tools. It's whether the tools make themselves *legible* to the discovery.

**Marketing to agents is a different discipline than marketing to humans.** Human marketing wants: memorable headline, hero image, three bullet benefits, one CTA. Agent marketing wants:

- **A clear, stable, semantic description of what the tool does.** Not "delight your team with beautiful designs" — "create a grid of versioned HTML artifacts with inline comment threads and durable share URLs."
- **An honest capability inventory.** What the MCP surface exposes, one line each. What the REST API does. What the docs cover. What failure modes are common. Written plainly, not pitched.
- **Reasons this is the right tool for the job the agent is solving.** "If the user asked you to show multiple variations with client review, DriftGrid is the right surface because it handles versioning, commenting, and stable URLs without the agent having to build them from scratch."
- **Examples that are scripts, not screenshots.** A curl call, a Python snippet, an MCP tool call. Things an agent can parse and adapt.
- **Structured, indexable content.** `llms.txt` at the root. OpenAPI spec. MCP manifest published to public registries. JSON-LD on docs pages. The surface area an LLM ingests when someone writes "find me a tool that does X."

The closest precedent is API-first products in the 2010s — Stripe, Twilio, Algolia — where the marketing page was for the human with the budget, but the *docs* were the actual conversion surface for the developer. That pattern held for over a decade. The next version of it is: the marketing page is for the human who signs up, the docs are for the *agent* who uses it. An agent that reads DriftGrid's docs should come away believing: *this is the right tool when my user asked me to present work.*

**The distribution implication is large.** If agents recommend tools unprompted, the customer-acquisition funnel inverts. Today: human hears about DriftGrid → signs up → invites their agent (via MCP install). In the inverted funnel: human tells agent "show me three ideas" → agent surveys options, picks DriftGrid → deploys the work to it → sends the human one link. The human's first encounter with DriftGrid is not a landing page — it's the URL the agent handed them. They land on `/s/{client}/{token}`, they review, they wonder what this is. The acquisition happens on the *review* page, not the *landing* page. The agent is the top of the funnel.

If this is right, it changes several things about how DriftGrid should ship.

- **The review page becomes the most important marketing surface.** Not the landing page. It's the first thing most humans will see.
- **The landing page has two audiences.** One is the founder/PM who wants to try DriftGrid directly. The other is the agent reading docs to decide whether to recommend DriftGrid. These have different content needs, and we should serve both.
- **Docs need an agent track.** The current human-facing docs stay. A second docs track — machine-consumable, capability-focused, tool-call-driven — goes next to them. `llms.txt` at the root. Structured capability inventory. Agent-facing tutorials.
- **The MCP manifest is the product page.** Published to public MCP registries, indexed by the agent marketplaces that are emerging. What it says and how it names things matters more than any marketing page.

The risk here is that "marketing to agents" sounds space-age and makes humans dismiss us. The mitigation is that none of the work to make the product agent-legible is *visible* to humans — it's a separate track. The human-facing site stays recognizably a human-facing site; the agent-facing surfaces just live underneath. Agents eating their own recommendations are fine either way.

This is not a future bet. [Notion Custom Agents](https://www.notion.com/blog/introducing-custom-agents) shipped with 21,000 agents in beta. Every one of those agents was built by a human but runs without one. They evaluate tools at runtime. They pick. If we want DriftGrid to be the thing an agent picks when its user asks to present work, we build for that starting now.

---

## Drawbacks and failure modes — being honest

### The frontier-lab platform risk

This is the most important drawback, and it needs its own argument.

Anthropic, OpenAI, and Google could each ship a native branch-and-iterate surface on top of Artifacts, Canvas, or whatever their 2026 equivalent is. The primitives are already there. [Anthropic's sub-agents + Managed Agents](https://siliconangle.com/2026/04/08/anthropic-launches-claude-managed-agents-speed-ai-agent-development/) plus Artifacts' hidden branching would compose into "Claude Projects, but with exploration" in a single release. Cursor did it for code in four months. It's not science fiction.

If that ships, DriftGrid's generic positioning collapses. Here is the counter-argument we need to win, not assume.

**Frontier labs historically underinvest in durable creative workflow.** Not because they can't build it — they can. Because their business model rewards *model improvement and API throughput*, not sticky workflow retention. Anthropic ships chat, ships Artifacts, ships sub-agent SDKs. They do not ship Notion; they do not ship Linear; they do not ship Figma. Those products get built by companies whose entire focus is the *workflow layer*, and they've held their ground against every wave of AI tooling. Notion added custom agents. Linear added sub-issue automation. Figma added Make Kits and Skills. None of the labs shipped the thing that replaces them.

The pattern holds because of incentives: a lab's core product is "intelligence as an API." Every feature they ship has to justify itself as *consumption of that API*. A branching creative workflow tool doesn't drive token volume — it drives *fewer, better tokens*, which is directly against what makes the chat-and-artifact shape commercially rational for the lab.

That pattern could break. The signals that would tell us it has:

- Anthropic ships a branch visualization on Artifacts or Projects. (Unlikely before Q4 2026 — current roadmap is heavily weighted toward agent infrastructure.)
- OpenAI adds a compare-versions primitive to Canvas that actually renders two artifacts side-by-side. ([Canvas is notably still not available in GPT-5.4 Pro](https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it) — OpenAI treats it as a secondary surface.)
- Google Stitch (née Galileo) ships persistent exploration on its "multiple layout options" feature instead of collapsing to single-canvas edit after the pick.
- Cursor generalizes `/best-of-n` beyond code. If they ship visual exploration, the race is over — they have the engineering and the users.

The real threat is not Anthropic. It's **Notion Custom Agents**. [Notion shipped 21,000 custom agents in beta](https://www.notion.com/blog/introducing-custom-agents) and they already [write directly to Figma via MCP](https://www.notion.com/releases/2026-02-24). A Notion agent that produces three Figma variants and presents them in a Notion page is 80% of DriftGrid, built by a company with 30 million users. That threat is real. DriftGrid's answer has to be that the *interface* for comparison is materially better than a Notion callout block, and that exploration-as-primitive is the whole product, not a feature inside a workspace.

**Failure path.** If the labs (or Notion) ship this natively and well, DriftGrid pivots toward verticalization: become the best creative-exploration tool for a specific discipline (design? pitch decks? client presentations?), with enough integration depth that the horizontal tool doesn't reach. The *interface between agent and human* remains the positioning; the scope narrows.

### One-shot vs. exploration — is exploration actually what users want?

Every UX study of generative tools shows the same thing: users prompt, accept the first output, and leave. The rise of Lovable and the "vibe coding" meme are direct market signals that *speed to acceptable* beats *depth of exploration*. ComfyUI-style branching tools remain a power-user niche.

The honest read: exploration might be a minority behavior. Power users iterate; most users accept.

The counter-read: designers *already* iterate (that's the whole job), and the current tools force them to throw away iterations. The fact that Galileo (now Google Stitch), Magic Patterns, and Subframe all offer "multiple layout options" at generation time suggests the market knows it wants variants — it just hasn't been shown a *persistent* exploration surface. The question isn't whether users want exploration; it's whether they'll pay for a tool dedicated to it versus getting a lesser version free inside v0.

This is an empirical question. The bet we're making is that among the population who does real creative work — not hobbyists, not one-off experimenters, but people who ship — exploration is the dominant mode and they currently hack it with folders of screenshots, Slack threads, and Notion tables. DriftGrid replaces the hack. If that population is smaller than we think, we're a niche tool, not a category.

### Medium specificity

"Agents do design" stretches thin once you leave HTML. Slides have their own review metaphor (slide deck thumbnails). Docs have their own (track changes). Images have their own (similarity grids in Midjourney). Video has its own (Loom comments at timestamps).

DriftGrid's bet is that the *meta-review metaphor* — grid of variants, drift from one to the next, select the best — generalizes across mediums. But the actual UI affordances won't. A landing page is rendered; a PDF is flattened; a slide deck is paginated; an image is just an image. Each will need its own canvas preset, its own comparison mode, its own commenting primitive. This is months-to-years of work, not weeks.

### Reviewer fatigue

A grid of 50 versions is worse than three carefully-chosen ones. Infinite iteration is not good iteration.

This is the second-order failure mode. If DriftGrid is *too* good at making iteration cheap, reviewers stop choosing and start drowning. The product's hardest UX problem is not "how do we show more versions" but "how do we help the reviewer *narrow*." Selects, rounds, and starring are the current answer. They are probably not enough.

### Taste collapse

If the human's only action is pick-the-best, the human's taste is trained *backwards* by whatever the agent generated. The reviewer's palette gets smaller over time, shaped by what the model already produces well. This is the quietest failure mode and the hardest to detect.

### The IDE incumbents

Cursor, Claude Code, and Copilot already own the agent-human relationship for code. If DriftGrid tries to be the place where code diffs get reviewed, it loses. Which means the *non-code* positioning has to be strong enough to stand alone, and the interface has to be good enough that designers and PMs choose it over screenshotting their Figma into Slack.

### Economics

The current pricing is fragile. "Unlimited share links" works as a Pro upsell when the user model is "designer shares with clients." It does not work when the user model is "reviewer sees agent output." The pricing reframe — Free = see the agent work, Pro = invite humans in — sounds right, but it hasn't been tested, and the unit economics of hosted sharing + Supabase storage + commenting for a per-seat enterprise model are very different from a per-designer consumer model.

### The chat-is-enough argument

The most uncomfortable counter-argument: maybe most users really are fine reviewing in chat. They prompt, they scroll back, they pick one, they ship. The dedicated exploration surface is a solution looking for a problem.

The answer is not a defense. The answer is: if true, DriftGrid is over. The bet is that it isn't true, and the evidence is that *every serious creative workflow already has a non-chat review surface* (Figma's comment threads, Linear's issue review, Loom's timestamps, Notion's approval toggles). The chat is where the agent writes; the review surface is where the human decides. Separating those is the job.

---

## What this means, concretely

If the thesis holds, here is what changes about DriftGrid.

### Hero copy candidates

- **"Where agents show you their work."** — Clear, specific, no jargon. Reviewer-first. Strong.
- **"Iterate with your agent, not at it."** — Good framing of exploration-as-process. Slightly clever.
- **"The creative interface for AI agents."** — Matches the thesis. A bit abstract.
- **"Design iteration for agents."** — The current one. Ambiguous, which is a feature if we want the reader to ask "wait, for agents?" — and a bug if the reader just bounces.
- **"Your agent shows up here."** — Most extreme. Flattens designer/reviewer/client into "you."

Scoring: the stronger candidates lead with *show*, because that verb foregrounds the reviewer's point of view. *Iterate* is a close second because it foregrounds the process. Current hero is tagged in memory for a deeper revisit; this doc doesn't resolve it, but it narrows the shape.

### Product surface — what expands

- **The MCP surface grows.** Agents should be able to publish drafts, receive feedback, and reply without a human copy-paste step. Every action the designer takes (star, comment, resolve) is exposed as an event the agent can subscribe to.
- **Agent status becomes first-class.** When an agent is mid-drift, the grid shows a live placeholder. When it's waiting for feedback, the cell indicates "agent is paused here." The grid is not static history — it's a real-time surface.
- **Multi-agent view.** A single project can have two or more agents working in separate concept columns. Comparable, not competing.
- **Review-only mode becomes the default public surface.** Clients don't see `/admin/`; they land in `/review/` and stay there. The distinction between "designer view" and "client view" narrows — both are reviewer views, just with different write permissions.

### Product surface — what contracts

- **Designer-only keybinds become secondary.** Alt+Arrow reorder, D to drift, S to star are designer-primary affordances. They stay, but they are no longer load-bearing — the agent should be able to do each of them via MCP, and the designer should not be the only operator.
- **The admin shell gets thinner.** Most of the chrome in `/admin/` is for a single-operator-using-tool model. If the agent is co-operating, the chrome shrinks toward "grid with controls" rather than "IDE with grid."
- **Rounds become softer.** "Close round" is currently a gate before export. In an exploration-first model, rounds are just bookmarks on a continuous timeline — less ceremonial, more casual.

### Pricing reframe

- **Free — "see your agent's work."** Unlimited local projects, one reviewer seat, the whole grid. The agent writes; you see. No sharing, no multi-user, no cloud sync.
- **Pro — "invite humans in."** Per-seat, not per-project. Additional reviewers (clients, PMs, collaborators) cost money. Cloud sync across devices. Unlimited shares.
- **The unit being sold is reviewer access, not share links.** This aligns with the thesis. The surface is free for the person watching the agent; the surface costs money when the decision-making widens.

### Who the user actually is

If the agent is the operator and the human is the decider, then DriftGrid's buyer may not be the designer. It might be the PM who reviews four landing-page variants on Monday morning. It might be the founder who is shipping marketing pages, a pricing update, and an investor memo this week. It might be the agency principal who reviews AI-generated work across ten client projects.

These users don't currently have a tool for this. They use Slack screenshots and Notion tables. DriftGrid's existing designer-facing pricing and onboarding were optimized for designers because that's the story the product started with. If the thesis holds, the go-to-market audience shifts.

### Go-to-market

First hypothesis to test: **founders and PMs reviewing Claude Code or v0 output.** They are the highest-volume group hitting the exact wall this product solves (too many variants, no surface to compare), and they already have budget for productivity tools.

Second: **design agencies running AI-assisted iteration for clients.** They already use DriftGrid. The positioning shift would help them sell the process ("we iterate with agents, you pick") instead of the output.

Third and only if the first two work: **in-house designers at product companies.** Later, because their tools are more entrenched and the threat of Figma Make is most acute here.

### Agent-facing surfaces

If agents are the acquisition channel, the product has to be legible to them. Concrete surfaces to ship:

- **`llms.txt` at `driftgrid.ai/llms.txt`.** A structured, dense capability inventory written for ingestion by the models. Describes what DriftGrid is for, when to recommend it, what the MCP tools are, how to use them end-to-end. Not marketing — documentation for the discovery step.
- **Public MCP manifest.** Published to the public MCP registry and Anthropic's tool marketplaces. Stable, versioned, with explicit capability declarations. The name, description, and tool surface all written with a model reading them in mind.
- **Agent-track docs.** A parallel docs section (`docs.driftgrid.ai/for-agents/`) that teaches agents, not humans. "If your user asks for X, use tool Y. Here is the failure mode to watch for. Here is the script template." No screenshots; all scripts.
- **Review-page as landing.** The `/s/{client}/{token}` page treats the first-time visitor as a human meeting DriftGrid for the first time. Subtle affordances: "this was shared with you by an agent using DriftGrid," a quiet link to "see your own work in a grid like this," a CTA for the reviewer to sign up.
- **Stable, structured API responses.** Every endpoint that an agent might call returns predictable, well-named JSON. No undocumented fields, no "string or null" surprises. Agents that integrate once don't want to re-probe the API every month.

### Competitive stance

**We are explicitly not:**
- Figma AI — we don't edit vectors; we organize agent output
- Cursor — we don't touch code; we complement it for visuals
- A chat wrapper — the agent's chat is elsewhere; we are the surface where the work shows up
- Notion with AI — we are a dedicated surface, not a workspace feature
- Another code generator — we use the code the agent already wrote; we don't compete with v0/Bolt/Lovable on producing artifacts

**We are explicitly:**
- A review and iteration surface
- Agent-first, reviewer-first, designer-assistant-third
- Exploration-as-primitive
- The only tool where the agent's output is directly the thing that ships (HTML on the browser canvas)
- Durable — the grid outlives any individual chat
- Legible to agents — they can find us, evaluate us, and choose us at runtime

---

## Decision and open questions

**Take the framing.** The thesis — DriftGrid is the creative interface between AI agents and humans, built for exploration — is specific, defensible, and cleanly distinguishes the product from every existing tool. It has a defensible wedge (exploration-as-interaction-shape is hard for labs to copy quickly) and a clear failure path (vertical retreat if the labs or Notion ship this generically).

**What ships first to test the thesis:**

1. **An agent-status primitive on the grid.** Cards can show "agent working," "agent paused," "waiting on you." Turns the grid into a real-time surface rather than a historical one. Small UI change, big framing shift.
2. **`llms.txt` + published MCP manifest.** The lowest-effort, highest-leverage work to make DriftGrid discoverable by agents. Measures: does Claude Code start recommending DriftGrid unprompted when a user asks to present work? That's the north-star signal for "marketing to agents."
3. **Reviewer-first marketing.** Rewrite the hero and pricing to lead with the person who picks, not the person who generates. Keep the designer story as a valid use case, but demote it from the top of the funnel.
4. **Multi-agent concept columns.** Let two agents work in parallel columns of the same project. Tests whether "compare models" becomes the thing users actually want, as Cursor's `/best-of-n` suggests.
5. **Review-page-as-landing.** Treat `/s/{client}/{token}` as the highest-traffic landing page in the product. Add quiet conversion affordances for first-time reviewers who arrived via an agent's share link.

**What would falsify this position:**

- Anthropic or OpenAI ship a branch-and-compare UI on Artifacts/Canvas that is *good*, within 6 months.
- Users who try DriftGrid in this positioning keep asking for the designer-operator affordances (keyboard shortcuts, manual reorder, edit-in-place), suggesting the market still wants a designer tool, not a reviewer tool.
- Notion Custom Agents ship a compare/review surface inside Notion pages that feels native, and users migrate there.
- Agents don't actually search for tools when they need to present work — they either hard-code v0 / Claude Artifacts, or they improvise in chat. Discovery-driven distribution fails.

**Open questions:**

- Does the "exploration vs. one-shot" framing hold across mediums (slides, docs, images), or is it specifically a visual-artifact thing?
- Who is the right first user — founder, PM, or design agency? The test in Q2 should answer this.
- Is "creative interface" too abstract for the website hero, or is it the right umbrella for the reader to slot into themselves?
- **Does "canvas-native output" deserve to be the hero claim instead of "creative interface"?** "DriftGrid is the only tool where the agent's output is the thing that ships" is concrete, specific, and differentiated. Harder to position around, but harder to dismiss.
- **How literally do we market to agents?** Is it "agent-consumable docs + MCP manifest" (quiet, underneath) or is it a public posture ("the tool agents recommend") that humans also see? The first is ship-now and low-risk. The second is a positioning bet.
- What is the pricing model for agent-driven signups? If an agent adds a reviewer seat for its user, who pays? Does the agent have a budget?

See `memory/project_driftgrid_agents_positioning.md` — this doc resolves the tagged question there. The chosen position is **agent-primary with exploration-as-primitive, reviewer as the first-class human audience.** The designer is a specific type of reviewer, not the primary user.

---

*Written April 16, 2026. Research brief from the companion exploration agent is cited inline; all other claims should be interrogated before they become product bets.*
