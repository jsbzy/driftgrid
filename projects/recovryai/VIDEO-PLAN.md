# RecovryAI Demo Video — Complete Project Summary & Transition Guide

> **Last updated:** 2026-03-20
> **Purpose:** Full summary of all work done, project status, and handoff context for the next agent session.

---

## 1. What This Project Is

A ~90-second "Steve Jobs level" product demo video for **RecovryAI** — an FDA-regulated, physician-prescribed Virtual Care Assistant for post-operative recovery. Built with **Remotion** (React-based video framework), rendered at 1920×1080 @ 30fps.

**Location:** `/Users/jeffbzy/drift/video/recovryai-demo/`
**Total duration:** 2,669 frames (~89 seconds)
**Tech:** Remotion 4.0.261, React 19, TypeScript 5.7

---

## 2. What Has Been Done (Complete History)

### Phase 1: Planning & Storyboarding
- Defined the 12-scene narrative arc (Title → Problem → Introducing → Prescribed → Connected → Check-ins → Escalation → Emergency → Dashboard → Actions → Scale → Close)
- Created a storyboard in Drift at `~/drift/projects/recovryai/demo-storyboard/` (13 concepts, 4 versions each, landscape 16:9)
- Established visual direction: Apple Health / WWDC aesthetic, white/warmWhite backgrounds, pulseTeal accents, no device chrome

### Phase 2: Remotion Scaffolding
- Built the full project from scratch: `package.json`, `Root.tsx`, `Video.tsx`, all 12 scene files, all lib files, all reusable components
- Created the spring/easing system (`easing.ts`) with 7 named spring configs
- Created the brand token system (`brand.ts`), typography system (`typography.ts`), timing system (`timing.ts`)
- Built 10 reusable animation components (TypeReveal, FadeIn, ScaleReveal, SlideIn, CrossSparkle, HeartRateLine, ChatBubble, RxCard, AccentLine, StaggerChildren)
- All 12 scenes implemented with real content and animations

### Phase 3: Scene 04 Deep Iteration (Most Recent Work)
Scene 04 ("The Rx Moment") received extensive design iteration — the only scene that went through the full one-at-a-time refinement workflow:

**Iterations performed:**
1. **Card layout v1** — centered large card (rejected: too static)
2. **Card layout v2** — RecovryAI header on card (rejected: hierarchy wrong)
3. **Card layout v3** — two-column Patient/Procedure with left-justified RecovryAI VCA line (approved)
4. **Glow sweep** — added conic-gradient sweep around card border (rejected: "too Space Age")
5. **Subtle shadow** — replaced glow sweep with barely-there teal box-shadow (10px blur, 8% opacity) (approved)
6. **Font size fix** — reduced "PRESCRIBED" from 158px to 136px to prevent overlap with card
7. **Continuous motion** — added cardDrift (15px upward float) + cardShift (35px rightward rebalance when text enters) for Apple-like feel

**Final Scene 04 animation sequence (340 frames / 11.3s):**
```
f15   — RxAI badge fades in (large, 440px wide, centered)
f55   — "AI" letterform glows in with teal radial halo
f90   — SVG border draws on (stroke-dashoffset 1334→0)
f135  — Badge shrinks (440→60px) and travels to card header position
f150  — Card rises with APPLE_SPRING, warmWhite surface
f175  — Card content staggers in: badge+date → patient/procedure columns → RecovryAI VCA line → divider
f200  — Traveling badge crossfades out, in-card BadgeMini takes over
f237  — Signature mask sweep begins ("Dr. James Joseph" in Dancing Script)
f272  — Signature complete, subtle teal shadow fades in
f285  — "PRESCRIBED" slides in from left (136px, Inter 600, softBlack)
f312  — "AI." slides in below (136px, Inter 600, pulseTeal)
```

**Verified rendering:** Still frames at f80, f200, f330 all render clean. No errors.

---

## 3. Current Status — All 12 Scenes

| # | Scene | Frames | Seconds | Iteration Status |
|---|-------|--------|---------|-----------------|
| 01 | Title | 225 | 7.5s | Scaffolded — not yet iterated |
| 02 | Problem | 260 | 8.7s | Scaffolded — not yet iterated |
| 03 | Introducing | 225 | 7.5s | Scaffolded — not yet iterated |
| **04** | **Prescribed** | **340** | **11.3s** | **✅ Iterated & near-final** |
| 05 | Connected | 210 | 7.0s | Scaffolded — not yet iterated |
| 06 | Check-ins | 200 | 6.7s | Scaffolded — not yet iterated |
| 07 | Escalation | 255 | 8.5s | Scaffolded — not yet iterated |
| 08 | Emergency | 195 | 6.5s | Scaffolded — not yet iterated |
| 09 | Dashboard | 210 | 7.0s | Scaffolded — not yet iterated |
| 10 | Actions | 200 | 6.7s | Scaffolded — not yet iterated |
| 11 | Scale | 210 | 7.0s | Scaffolded — not yet iterated |
| 12 | Close | 340 | 11.3s | Scaffolded — not yet iterated |

**"Scaffolded"** = scene has real content, animations, correct timing — but has NOT gone through the focused design iteration process with Jeff. The code works and renders, but the visual quality is "v1" level, not "Steve Jobs level."

**"Iterated & near-final"** = Scene 04 went through multiple rounds of design feedback, layout changes, animation tuning, and visual refinement. Jeff has seen rendered stills and the composition is approved. May still need minor tweaks after viewing in motion.

---

## 4. Planned Iteration Order (Next Steps)

Per Jeff's direction, scenes should be iterated **one at a time** in this priority order:

| Priority | Scene | Why |
|----------|-------|-----|
| **NEXT** | **07 — Escalation Chat** | Core product differentiator: anomaly detection → AI conversation → care team alert |
| 2 | 06 — Check-in Cards | Daily engagement loop — shows the VCA in action |
| 3 | 01/12 — Title/Close | Bookends — need to match the quality bar set by interior scenes |
| 4 | 03 — Introducing + RxAI Hero | Brand reveal moment |
| 5 | 02 — The Problem | Stats-first tension builder |
| 6 | 05 — Connected/Devices | Device integration visualization |
| 7 | 08 — Emergency | Critical event → EMS response |
| 8 | 09/11 — Dashboard/Scale | Care team visibility + growth story |
| 9 | 10 — Actions | Autonomous follow-ups |

---

## 5. Core Workflow (How to Iterate Each Scene)

```
1. Interview — ask Jeff what he wants to feel/see in this scene
2. Design in Paper — build 2-3 static concept directions (one scene only)
3. React + refine — Jeff reacts, adjust until direction is locked
4. Animate in Remotion — build the approved concept
5. Review in motion — scrub through, refine timing and feel
6. Lock — mark scene as done, move to next
```

**NEVER work on more than one scene at a time. NEVER one-shot multiple scenes.**

---

## 6. Project Architecture

### Key Files

| File | Role |
|------|------|
| `/Users/jeffbzy/drift/video/recovryai-demo/src/Video.tsx` | Main composition — sequences all 12 scenes with transitions |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/Root.tsx` | Remotion root — registers Video + individual scene compositions |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/timing.ts` | Scene durations (frames), transitions, total frames |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/easing.ts` | 7 named spring configs (APPLE_SPRING, SNAPPY_SPRING, etc.) |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/brand.ts` | Color tokens (softBlack, pulseTeal, warmWhite, dangerRed, etc.) |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/fonts.ts` | FONT_INTER, FONT_SERIF (DM Serif Display), FONT_DANCING_SCRIPT |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/typography.ts` | Predefined type styles (heroStat, sceneHeadline, productName, etc.) |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/lib/useBrandSpring.ts` | Custom hook wrapping Remotion spring() with brand defaults |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/scenes/` | All 12 scene components |
| `/Users/jeffbzy/drift/video/recovryai-demo/src/components/` | 10 reusable animation components |
| `/Users/jeffbzy/drift/video/recovryai-demo/public/logos/` | Logo SVGs (logo-color-light.svg, logo-white.svg, icon-pulse.svg) |

### Spring Configs (from `easing.ts`)

| Name | Damping | Mass | Stiffness | Use |
|------|---------|------|-----------|-----|
| `APPLE_SPRING` | 200 | 1.2 | 60 | Default — smooth, no bounce |
| `SNAPPY_SPRING` | 100 | 0.8 | 120 | Fast settle for type entrances |
| `GENTLE_SPRING` | 300 | 1.5 | 40 | Slow, dreamy reveals |
| `DRAMATIC_SPRING` | 260 | 2.0 | 35 | Weighty, deliberate motion |
| `CRISP_SPRING` | 150 | 0.6 | 200 | Quick snaps (pills, badges) |
| `FLOAT_SPRING` | 180 | 1.8 | 45 | Drifting, ambient motion |
| `URGENT_SPRING` | 80 | 0.5 | 300 | Rapid alerts |

### Brand Colors (from `brand.ts`)

| Token | Hex | Use |
|-------|-----|-----|
| `softBlack` | #1B1B1A | Primary text |
| `graphite` | #3A3A38 | Secondary text |
| `slate` | #6B6B68 | Tertiary text |
| `quartz` | #A3A3A0 | Labels, dividers |
| `warmWhite` | #EDE8E0 | Card surfaces |
| `white` | #FFFFFF | Backgrounds |
| `pulseTeal` | #33B6B0 | Brand accent |
| `dangerRed` | #CC4444 | Emergency only |

### Transitions (from `Video.tsx`)

| Between | Type | Duration |
|---------|------|----------|
| 01→02 | Fade | 12f (white→dark) |
| 02→03 | Fade | 12f (dark→white) |
| 03→04 | Hard cut | — |
| 04→05 | Hard cut | — |
| 05→06 | Hard cut | — |
| 06→07 | Hard cut | — |
| 07→08 | Fade | 15f (white→dark, entering danger) |
| 08→09 | Fade | 12f (dark→white, relief) |
| 09→10 | Hard cut | — |
| 10→11 | Hard cut | — |
| 11→12 | Fade | 20f (conclusion) |

### Reusable Components (from `src/components/`)

| Component | Purpose |
|-----------|---------|
| `TypeReveal` | Word-by-word or char-by-char text reveal with highlighting |
| `FadeIn` | Opacity + translateY entrance |
| `ScaleReveal` | Scale animation (fromScale → toScale) |
| `SlideIn` | Directional slide-in (left/right/up/down) |
| `CrossSparkle` | Animated sparkle icon (Scenes 01 & 12) |
| `HeartRateLine` | Animated heart rate waveform (Scene 07) |
| `ChatBubble` | Chat message UI, VCA or patient variant (Scene 07) |
| `RxCard` | Prescription card component |
| `AccentLine` | Horizontal accent line |
| `StaggerChildren` | Wrapper for staggered children animations |

---

## 7. Voiceover Script

| Scene | VO |
|-------|-----|
| 01 | *"Physician-prescribed AI for post-operative recovery."* |
| 02 | *"80% of US surgeries are now same-day. Over 150 million procedures a year — and rising. Patients go home during their most vulnerable phase of recovery."* |
| 03 | *"Introducing RecovryAI. Procedure-specific. Clinically validated. FDA-regulated."* |
| 04 | *"Before you leave the hospital, your surgeon prescribes this — a Virtual Care Assistant designed specifically for your recovery, designed specifically to support you through the recovery journey."* |
| 05 | *"Integrated with the devices that track your recovery."* |
| 06 | *"Daily check-ins via chat, voice, video, or the app."* |
| 07 | Alert: "Elevated heart rate detected while sleeping." / VCA: "Hi Sarah — we noticed an elevated heart rate overnight. How are you feeling?" / Sarah: "There's swelling around my knee and it's really hurting." / VCA: "We've shared this with your care team along with your sensor data. They'll be reaching out shortly." |
| 08 | *"If it's critical, EMS is contacted immediately."* |
| 09 | *"Full visibility for the care team."* |
| 10 | *"It doesn't just monitor — it acts."* |
| 11 | *"From one physician to an entire practice."* |
| 12 | *"Every patient prescribed a virtual care assistant."* / recovry.ai |

---

## 8. Visual Direction & Design Principles

- **Apple Health / WWDC aesthetic** — cinematic restraint, clean white space, deliberate motion
- **White (#FFF) / Warm White (#EDE8E0) backgrounds** — light mode throughout except Scenes 02 & 08 (dark)
- **Pulse Teal (#33B6B0)** — used sparingly, one strong accent moment per scene
- **No device chrome** — no phone/laptop frames. Show UI as floating landscape-ratio cards
- **Type system** — Inter (system/clean) + DM Serif Display italic (emotional beats) + Dancing Script (signatures)
- **Motion** — spring-based (never CSS transitions), subtle constant drift for Apple-like feel
- **Shadows** — barely-there, max 10px blur, under 10% opacity. Never theatrical
- **Key lesson from Scene 04:** Jeff rejected a conic-gradient glow sweep as "too Space Age" — always err on the side of restraint

---

## 9. Commands

```bash
# Start Remotion Studio (preview + scrub)
cd /Users/jeffbzy/drift/video/recovryai-demo && npx remotion studio

# Render a still frame (for verification)
cd /Users/jeffbzy/drift/video/recovryai-demo && npx remotion still Scene04-Prescribed /tmp/scene04.png --frame=200

# Render full video
cd /Users/jeffbzy/drift/video/recovryai-demo && npx remotion render Video out/recovryai-demo.mp4 --codec=h264 --crf=18

# TypeScript check
cd /Users/jeffbzy/drift/video/recovryai-demo && npx tsc --noEmit
```

**Note:** Remotion Studio's timeline cannot be programmatically scrubbed (neither `remotion_setFrame()` nor hash navigation works). Jeff must manually drag the playhead to review animation in motion.

---

## 10. Transition Statement for Next Agent

### Context
You are continuing work on a RecovryAI demo video built with Remotion at `/Users/jeffbzy/drift/video/recovryai-demo/`. All 12 scenes are fully implemented and rendering, but only **Scene 04 (Prescribed)** has gone through the focused design iteration process with Jeff. The remaining 11 scenes are at "scaffolded v1" quality — functional but not polished to the "Steve Jobs level" bar.

### What to do next
1. **Confirm Scene 04 is locked** — Jeff has seen stills but hasn't scrubbed the animation in motion yet. Ask if Scene 04 is approved or needs tweaks.
2. **Begin Scene 07 (Escalation Chat)** — this is next in the priority queue. Follow the one-scene-at-a-time workflow: interview Jeff about what he wants, build concept directions, iterate.
3. **Read the scene file first** before proposing changes: `/Users/jeffbzy/drift/video/recovryai-demo/src/scenes/Scene07Escalation.tsx`

### Critical rules
- **ONE scene at a time.** Never batch multiple scenes.
- **Always use absolute file paths** (Jeff's preference).
- **Spring animations only** — never CSS transitions. Use the configs from `easing.ts`.
- **Restrained aesthetic** — if it looks "Space Age" or theatrical, dial it back. Jeff's taste is Apple-like: subtle, constant, deliberate.
- **Render still frames** to verify changes: `npx remotion still SceneName /tmp/output.png --frame=N`
- **Read brand.ts, easing.ts, fonts.ts, typography.ts** before writing any scene code — reuse existing tokens and patterns.

### Known open questions
- Scene 02: hospital→home map abstraction — try it or skip?
- Scene 03: RxAI badge glow behavior — glow on enter, held pulse, or steady?
- Scene 07: Sensor anomaly — data card vs. animated heart rate line?
- Scene 08: Emergency tile cascade animation style
- Check-in cards: card-to-card flip animation (Phase 3+)

### Storyboard reference
Visual storyboard lives in Drift at `/Users/jeffbzy/drift/projects/recovryai/demo-storyboard/` — 13 concepts with 4 versions each, viewable at `localhost:3000/view/recovryai/demo-storyboard`.
