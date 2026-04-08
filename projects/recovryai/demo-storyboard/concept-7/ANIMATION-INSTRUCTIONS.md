# Beat 06 — Escalation: Animation Instructions

## Context

Beat 06 in the RecovryAI 1.5 demo (~46-58s in the 90-second video). Follows Beat 05 (Recovery Score / Home Screen) and precedes Beat 07 (Emergency / 911).

The story: The patient reports worsening knee pain. The VCA triages, provides clinical context (103 days post-op), escalates to the care team, and gives interim care instructions. An amber notification confirms the care team has been alerted.

This is the tone shift in the demo — from "everything is going well" (Beats 02-05) to "something needs attention." The amber color signals concern without panic.

## Source File

`/Users/jeffbzy/drift/projects/recovryai/demo-storyboard/concept-7/v4.html`

(v3 has the amber alert card variant if needed later)

Phone: 300×650px, border-radius 40px, centered on 1920×1080 slide, #E8E4DE background.

## Chat Content (4 elements)

| # | Type | Content |
|---|------|---------|
| 1 | VCA (muted) | "How would you rate this pain on a scale of 0 to 10?" |
| 2 | Patient (dark bubble, right) | "Probably a 7 or 8, but not all the time." |
| 3 | VCA (white bubble) | "At 103 days post-op, that level of pain needs prompt attention. I've flagged this for Dr. Kwan's team. Rest your knee, apply ice, and avoid activities that trigger the pain." |

## Animation Sequence (~12 seconds)

### Enter (0s–0.5s)
Crossfade from Beat 05 (Home Screen). Phone frame stays in place — content inside transitions.

### Phase A: Conversation builds (0.5s–7s)

The chat starts empty (just the "Today" pill visible). Messages appear one at a time, simulating a real-time conversation:

1. **0.5s** — VCA muted message fades in (opacity 0→0.6, 0.3s). Already muted gray — this is context from earlier.

2. **1.5s** — Typing indicator appears (3 dots in a white bubble, bouncing animation). Hold 1s.

3. **2.5s** — Typing dots disappear. Patient bubble slides in from bottom-right (translateY(8px)→0, opacity 0→1, 0.25s ease-out). "Probably a 7 or 8, but not all the time."

4. **3.5s** — Typing indicator appears again below the patient message (VCA is responding). Hold 1.5s — slightly longer pause to build tension.

5. **5s** — Typing dots disappear. VCA assessment bubble slides up + fades in (FadeUp, 0.3s). This is the clinical assessment — the key moment. "At 103 days post-op..."

### Phase B: Hold + Exit (7s–12s)

6. **7s–11s** — Hold on the complete chat. All 3 elements visible. The viewer reads the VCA's clinical assessment and interim care instructions.

7. **11s–12s** — Crossfade to Beat 07 (Emergency).

## VO Caption

Display across the bottom of the slide:

> "When recovery deviates from expected patterns, the VCA escalates to the care team automatically — with full clinical context."

Style: 18px Inter Regular, #8A8A86, centered, bottom 48px, padding 0 280px.

Suggested VO sync: Caption fades in at 0s. The word "escalates" aligns with the alert card appearing (~6s).

## Typing Indicator Spec

The typing dots should appear as a small white bubble (same style as `.bub.bot`) containing 3 dots that bounce sequentially:

```
Dot size: 6px circles
Dot color: #8a8884
Dot gap: 4px
Bounce: translateY(0→-4px→0), 0.4s each, 0.15s stagger between dots
Bubble padding: 10px 16px
```

Position: Left-aligned with bot bubbles (inside `.bot-row` with the AI avatar icon).

## Color Reference

| Element | Color | Usage |
|---------|-------|-------|
| Muted text | #8a8884 | Faded previous VCA message |
| Patient bubble | #1b1b1a | Dark bubble, white text |
| Bot bubble | #ffffff | White bubble on cream bg |

## Transition Notes

- **In**: Crossfade from Beat 05 (Home Screen). The shift from the dashboard view to the chat view signals a POV change — the patient is now actively talking to the VCA.
- **Out**: Crossfade to Beat 07 (Emergency). The escalation builds tension — the emergency beat raises the stakes further with red instead of amber.
- The amber color in this beat sets up the red in Beat 07. The progression (green → amber → red) mirrors a clinical severity scale.

## Technical Notes

- Bot avatar: `https://www.figma.com/api/mcp/asset/0e4cb345-0a66-4569-927c-5ee0888bd858`
- Phone shell is the same shared Remotion component as all other beats
- Existing Remotion project: `/Users/jeffbzy/dev/clients/recovryai/recovryai/`
- Load `remotion-best-practices` skill before writing Remotion code
