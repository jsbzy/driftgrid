# Beats 08 & 09 — Provider Portal + Clinic Dashboard: Animation Instructions

## Context

Beats 08–09 of the RecovryAI 1.5 demo (~68-88s). This is the **POV shift** — everything before was the patient's phone. Now we're on the provider's desktop. This is the "both sides" moment.

- Beat 08 (concept-9): Individual patient view — 3-panel layout
- Beat 09 (concept-10): Clinic-wide dashboard — 4-column kanban

Follows Beat 07 (Emergency). Precedes Beat 10 (Close).

## Source Files

| Beat | File | Description |
|------|------|-------------|
| 08 | `concept-9/v2.html` | Patient detail: 3-panel (info + chat + history) |
| 09 | `concept-10/v2.html` | Clinic dashboard: 4-column kanban (ER Recs, PR Connect, Resolved, Messages) |

Both are desktop browser frames (1100×680px) on a 1920×1080 slide, #E8E4DE background. Both have the RecovryAI icon in the sidebar top-left.

## Beat 08 — Patient Detail (~68-78s, ~10 seconds)

### Layout
Desktop browser frame with:
- **Sidebar**: RecovryAI logo + nav icons
- **Left panel**: Patient info (Michaela Swain, THR, POD-9, Recovery Score 43% Declining, category stats, surgery date, surgeon)
- **Center panel**: Chat (Assistant/Clinic toggle, VCA + patient messages, Report Summary card)
- **Right panel**: Patient History (Active status, assigned provider, ER event clinical notes)

### Animation Sequence

**Enter (0s–1s):**
The transition from Beat 07 (phone) to Beat 08 (desktop) is the biggest visual shift in the demo. Options:
- **Option A**: Crossfade — phone fades out, desktop fades in. Simple, clean.
- **Option B**: Zoom transition — camera pulls back from the phone screen, revealing the desktop browser around it. The chat from Beat 07 becomes the center panel chat. More cinematic.

Recommend **Option A** for simplicity unless the video agent can execute B cleanly.

**Panel reveal (1s–4s):**
The 3 panels stagger in left to right:
1. **1.0s** — Left panel (patient info) slides in from left (translateX(-20px)→0, opacity 0→1, 0.4s)
2. **1.5s** — Center panel (chat) fades in (0.3s)
3. **2.0s** — Right panel (history) slides in from right (translateX(20px)→0, opacity 0→1, 0.4s)

**Hold (4s–9s):**
All panels visible. The viewer scans the 3-panel layout.

**Exit (9s–10s):**
Crossfade to Beat 09 (Dashboard). The browser frame stays — only the content inside transitions. The sidebar persists, reinforcing that we're still in the provider portal.

### VO Caption
> "On the provider side, the care team sees everything — the patient's score, the full conversation, and a clinical summary."

## Beat 09 — Clinic Dashboard (~78-88s, ~10 seconds)

### Layout
Desktop browser frame with:
- **Sidebar**: Same as Beat 08 (shared component)
- **4 kanban columns**: ER Recommendations (8 Active, red), PR Connect (5 Active, teal), Resolved Events (gray), Messages (with unread badges)

### Animation Sequence

**Enter (0s–1s):**
Crossfade from Beat 08. Browser frame + sidebar persist. Content area transitions from patient detail to dashboard.

**Column reveal (1s–4s):**
The 4 columns stagger in left to right:
1. **1.0s** — ER Recommendations column slides up + fades in (FadeUp, 0.3s). The red "8 Active Cases" badge should draw the eye.
2. **1.5s** — PR Connect column slides up (FadeUp, 0.3s)
3. **2.0s** — Resolved Events column slides up (FadeUp, 0.3s)
4. **2.5s** — Messages column slides up (FadeUp, 0.3s). Green dots on unread messages pop in with a slight delay (0.1s after column appears).

**Hold (4s–9s):**
All columns visible. This is the "scale moment" — one patient becomes many. The density of the cards shows the VCA managing an entire clinic, not just one patient.

**Exit (9s–10s):**
Crossfade to Beat 10 (Close — logo + URL + FDA badge).

### VO Caption
> "ER recommendations, pending follow-ups, and patient messages — all in one view. The AI summarizes each case so providers can act, not just read."

## Shared Browser Frame Spec

Both beats use the same browser shell — build this as a shared Remotion component:

```
Width: 1100px
Height: 680px
Border-radius: 12px
Background: #fff
Shadow: 0 8px 80px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)

Browser bar: height 36px, bg #f4f2ee, border-bottom 1px #e8e6e1
  - Traffic dots: 10px circles (red #E05555, yellow #F5C842, green #33B5B0)
  - URL bar: white, rounded 6px, 22px height, centered

Sidebar: width 52px, bg #f4f2ee, border-right 1px #e8e6e1
  - RecovryAI logo: 32px circle (top)
  - Nav icons: 20px, #a3a3a0 inactive, #1b1b1a active
```

## Narrative Arc

These two beats complete the demo's "both sides" reveal:
- Beat 08: **Depth** — one patient, full context (score, conversation, clinical history)
- Beat 09: **Breadth** — all patients, at a glance (who needs attention now)

The transition from depth → breadth is the key insight for providers: RecovryAI gives you both the detail AND the overview.

## Technical Notes

- RecovryAI sidebar logo: `https://www.figma.com/api/mcp/asset/0e4cb345-0a66-4569-927c-5ee0888bd858`
- These are the only two beats that use desktop browser frames — all others use phone mockups
- The sidebar should persist across the Beat 08→09 transition (don't fade it out)
- Existing Remotion project: `/Users/jeffbzy/dev/clients/recovryai/recovryai/`
- Load `remotion-best-practices` skill before writing Remotion code
