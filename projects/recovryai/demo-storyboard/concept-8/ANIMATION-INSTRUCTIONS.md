# Beat 07 — Emergency: Animation Instructions

## Context

Beat 07 of the RecovryAI 1.5 demo (~58-68s in the 90-second video). Follows Beat 06 (Escalation — amber, knee pain) and precedes Beat 08 (Provider Portal — POV shift to desktop).

The story: Late at night, the patient reports sudden severe chest pain. The VCA triages, the patient confirms sharp pain + difficulty breathing, and the VCA directs immediate medical attention. This is the highest-stakes moment in the demo — the VCA acting decisively when it matters most.

The visual tone shifts from Beat 06's amber concern to this beat's urgency. No special UI treatment — the gravity comes from the copy and timing alone.

## Source File

`/Users/jeffbzy/drift/projects/recovryai/demo-storyboard/concept-8/v2.html`

Phone: 300×650px, border-radius 40px, centered on 1920×1080 slide, #E8E4DE background.

## Chat Content (4 messages)

| # | Type | Content |
|---|------|---------|
| 1 | Patient (muted, opacity 0.6) | "Hi, i dont normally reach out this late at night, but Ive suddenly started having very heavy chest pains!" |
| 2 | VCA (white bubble) | "I understand this is concerning. Can you describe the location and nature of your chest pain, and whether you're experiencing any other symptoms like shortness of breath, nausea, or sweating?" |
| 3 | Patient (dark bubble) | "Very sharp pain that isn't going away, and I'm having difficulty breathing" |
| 4 | VCA (white bubble) | "Given the severity of your symptoms, including sharp chest pain and difficulty breathing, it's crucial to seek immediate medical attention. Have you noticed any other symptoms accompanying the chest pain, such as dizziness, nausea, or pain radiating to your arms or jaw?" |

Timestamps: 11:17 PM — late at night, emphasizing urgency.

## Animation Sequence (~10 seconds)

### Enter (0s–0.5s)
Crossfade from Beat 06 (Escalation). Phone frame stays in place — content transitions.

### Phase A: Urgent patient message (0.5s–2.5s)

1. **0.5s** — First patient message fades in at 60% opacity (0.3s). Muted — sets the scene that the conversation started moments ago.

2. **1.0s** — Second element: VCA triage message is already visible (fades in with the muted message, 0.3s). This suggests the VCA responded immediately.

3. **1.5s** — Patient's second message slides in from bottom-right (translateY(8px)→0, opacity 0→1, 0.25s). "Very sharp pain that isn't going away, and I'm having difficulty breathing." This is the moment the urgency escalates.

4. **2.5s** — Brief pause. The patient's words hang.

### Phase B: VCA responds decisively (2.5s–5s)

5. **2.5s** — Typing indicator appears (3 bouncing dots in a white bubble). Hold 1s. The pause here builds tension — the VCA is processing a critical situation.

6. **3.5s** — Typing dots disappear. VCA emergency response slides up + fades in (FadeUp, 0.4s — slightly slower than normal to give the response weight). "Given the severity of your symptoms... it's crucial to seek immediate medical attention."

### Phase C: Hold + Exit (5s–10s)

7. **5s–9s** — Hold on the complete chat. All 4 messages visible. The viewer reads the VCA's emergency guidance. The long VCA message may extend below the visible area slightly — that's fine, it shows the depth of the response.

8. **9s–10s** — Crossfade to Beat 08 (Provider Portal). This is the POV shift — from patient's phone to provider's desktop. The transition should feel like "meanwhile, on the other side..."

## VO Caption

> "For critical symptoms, the VCA advises the patient to seek immediate medical attention — and alerts the care team at the same time."

Style: 18px Inter Regular, #8A8A86, centered, bottom 48px, padding 0 280px.

## Pacing Notes

- This beat should feel **faster** than Beat 06. The escalation beat had deliberate pauses; this one should feel urgent.
- The typing indicator hold (1s) is shorter than Beat 06's (1.5s) — the VCA responds quickly in emergencies.
- Messages appear with less gap between them — the conversation is rapid.
- The late-night timestamp (11:17 PM) is a subtle but important detail. If the status bar time can be updated to match, use 11:17 PM instead of 9:41.

## Typing Indicator Spec

Same as Beat 06:
```
Dot size: 6px circles
Dot color: #8a8884
Dot gap: 4px
Bounce: translateY(0→-4px→0), 0.4s each, 0.15s stagger between dots
Bubble padding: 10px 16px
```

## Transition Notes

- **In**: Crossfade from Beat 06. The shift from daytime (5:08 PM) to late night (11:17 PM) shows the VCA is always available — not just during business hours.
- **Out**: Crossfade to Beat 08 (Provider Portal). This is the biggest visual shift in the demo — phone → desktop browser. The story pivots from patient experience to provider experience.

## Narrative Arc Position

Beats 06 and 07 form a pair:
- Beat 06 (Escalation): Amber tone. Elevated knee pain. VCA flags care team. Clinical but not urgent.
- Beat 07 (Emergency): Red tone. Chest pain + difficulty breathing. VCA directs immediate medical attention. Life-threatening urgency.

The progression shows the VCA's range: it handles both "needs attention soon" and "needs attention now" scenarios appropriately. The demo audience should feel that the VCA knows the difference.

## Technical Notes

- Bot avatar: `https://www.figma.com/api/mcp/asset/0e4cb345-0a66-4569-927c-5ee0888bd858`
- Phone shell is the same shared Remotion component as all other beats
- The first patient message uses inline `style="opacity: 0.6"` — in Remotion, animate this from 0 to 0.6 (not full opacity)
- Existing Remotion project: `/Users/jeffbzy/dev/clients/recovryai/recovryai/`
- Load `remotion-best-practices` skill before writing Remotion code
