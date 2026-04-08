# Beat 03 — Daily Check-In: Animation Instructions

## Context

This is Beat 03 of the RecovryAI 1.5 demo video (~14-28s in the 90-second demo). It follows Beat 02 (VCA Welcome chat) and precedes Beat 04 (Home Screen / Recovery Score).

The story: The VCA walks the patient through a daily check-in covering 5 categories — pain, sleep, medication, diet, and activity. We show the pain slider in detail, skip through the remaining 4 check-ins with a visual transition, then land on the completed Report Summary in the chat.

## Source Files

All files live in: `/Users/jeffbzy/drift/projects/recovryai/demo-storyboard/concept-4/`

| File | Description | Role in Animation |
|------|-------------|-------------------|
| `v3.html` | Pain slider check-in screen (Figma-matched) — light bg, white card overlay, dark slider track, teal indicator, "Continue" CTA | **Frame A** — opening state |
| `v4.html` | Report Summary in chat — muted VCA question, gray card with 5 category results, "View History →" link | **Frame C** — ending state |

The phone mockup is 300×650px, border-radius 40px, centered on a 1920×1080 slide with #E8E4DE background.

## Brand Reference

- Full brand identity: `/Users/jeffbzy/.claude/projects/-Users-jeffbzy/memory/skill_recovryai_brand.md`
- Animation language: FadeUp (fade in + slide up with staggered delays), crossfade transitions (0.5s), pulsing indicators
- Primary accent: #3EB5A6 (teal) — used sparingly
- VO caption style: 18px Inter 400, #8A8A86, centered, bottom 48px of slide

## Animation Sequence (3 phases, ~14 seconds)

### Phase A: Pain Slider (0s–4s)

**Enter:** Crossfade from previous beat (Beat 02 VCA chat). The phone frame stays in place — only the content inside transitions from the chat screen to the check-in slider screen (v3.html).

**On screen:** The pain slider check-in. The screen shows:
- Light cream header: "Good morning, Marcia!" / "Let's submit your evening report"
- White card with "Pain" category selected, progress dots (1 of 5 filled)
- "How would you rate your pain level?"
- Teal indicator dot + "Low Pain" label
- Dark slider track at ~25% with circular thumb
- "Continue" button at bottom

**Subtle animation:** The slider thumb pulses gently (scale 1.0 → 1.05 → 1.0, 2s ease loop) to draw the eye to the interactive element.

**Hold:** 3.5s on this frame.

### Phase B: Time Skip Transition (4s–7s)

**Purpose:** Convey that 4 more check-ins happen (sleep, medication, diet, activity) without showing each one. The patient completes all 5.

**Animation:**
1. Phone content fades to ~30% opacity (0.4s ease-out). The phone shell (border-radius frame, shadow) stays at full opacity.
2. Over the faded phone, 5 small category dots appear in a centered horizontal row (each dot ~10px, gap ~8px between):
   - Dot 1 (Pain): Already filled with #ffc632 (yellow) — appears immediately
   - Dot 2 (Sleep): Fills with #33B5B0 (teal) at 4.8s — scale-pop animation (0 → 1.1 → 1.0, 0.2s ease)
   - Dot 3 (Medication): Fills with #33B5B0 at 5.2s — same pop
   - Dot 4 (Diet): Fills with #33B5B0 at 5.6s — same pop
   - Dot 5 (Activity): Fills with #33B5B0 at 6.0s — same pop
   - Unfilled dot color: #d4d0ca
3. After all 5 dots are filled, hold 0.5s, then dots fade out (0.3s).

### Phase C: Report Summary (7s–14s)

**Enter:** Phone content fades from 30% back to 100% opacity (0.4s ease-in) — now showing the Report Summary screen (v4.html).

**On screen:** The chat interface with:
- Muted VCA message (last check-in question, faded gray text)
- "Marcia" sender line
- Report Summary card (gray bg #dcd9d5, white inner container):
  - Pain → Moderate (yellow dot)
  - Sleep → 44%
  - Medication → 32%
  - Diet → 52%
  - Activity → 10%
  - "View History →"

**Staggered reveal of the report card:**
1. The muted VCA message is already visible when the fade-in completes
2. The "Marcia" sender line fades in (0.2s)
3. The Report Summary card slides up + fades in (FadeUp: translateY(12px) → 0, opacity 0 → 1, 0.3s ease-out)
4. Inside the card, each stat row staggers in with 0.1s delay between rows:
   - Pain row at 7.8s
   - Sleep row at 7.9s
   - Medication row at 8.0s
   - Diet row at 8.1s
   - Activity row at 8.2s
5. "View History →" appears last (0.2s delay after Activity)

**Hold:** 5s on the completed report.

**Exit:** Crossfade to Beat 04 (Home Screen with Recovery Score).

## VO Caption

Display across the bottom of the slide throughout the entire beat:

> "Every day, the VCA walks the patient through a two-minute check-in — pain, sleep, medication, nutrition, and mobility."

Style: 18px Inter Regular, #8A8A86, centered, `bottom: 48px`, `padding: 0 280px`.

The caption can fade in at 0s and hold throughout, or sync with the VO audio timing.

## Category Colors Reference

| Category | Dot Color | Status |
|----------|-----------|--------|
| Pain | #ffc632 (yellow) | Moderate |
| Sleep | #33B5B0 (teal) | 44% |
| Medication | #33B5B0 (teal) | 32% |
| Diet | #33B5B0 (teal) | 52% |
| Activity | #33B5B0 (teal) | 10% |

## Technical Notes

- Both v3.html and v4.html are self-contained HTML files with inline CSS and Google Fonts
- The phone shell (300×650, radius 40px, shadow) is consistent across all beats — it should be a shared Remotion component
- The Figma MCP asset URLs for icons expire after 7 days — download and store locally before building Remotion compositions
- The bot avatar image is: `https://www.figma.com/api/mcp/asset/0e4cb345-0a66-4569-927c-5ee0888bd858`
- Existing Remotion project: `/Users/jeffbzy/dev/clients/recovryai/recovryai/`
- Load the `remotion-best-practices` skill before writing any Remotion code
