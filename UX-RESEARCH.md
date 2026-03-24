# DriftGrid UX Research — Canvas Tool Patterns

> Research compiled from Figma, Miro, Framer, Sketch, Pitch, Canva, Milanote, and general canvas-tool UX patterns. Focused on actionable optimizations for DriftGrid's 2D infinite grid canvas.

---

## 1. Navigation & Selection Patterns

### Click-to-Select vs Click-to-Enter (The "Drill Down" Pattern)

**How Figma does it:**
- Single click selects the top-level frame/group
- Double-click drills one level deeper into the group hierarchy
- Cmd/Ctrl+click deep-selects (bypasses hierarchy, selects the exact element you clicked)
- Click on empty canvas deselects everything

**How Miro does it:**
- Single click selects object
- Double-click enters edit mode (text editing, or drills into a frame)
- Tab cycles through objects in reading order (top-left to bottom-right)

**DriftGrid currently:**
- Single click on a non-highlighted card = highlight it
- Single click on the already-highlighted card = enter fullscreen
- This is a problem: the "click to enter" requires you to click *twice* (once to highlight, once to enter), which feels sluggish.

**Recommendation — adopt double-click-to-enter:**
- Single click = always highlight/select the card (set it as current)
- Double-click = enter fullscreen (equivalent to pressing Enter)
- This eliminates the ambiguous "click twice on same card" pattern
- Matches the mental model from Figma/Miro where double-click = drill in
- Current "double-click background to fit all" stays as-is (it's on empty space, no conflict)

### Multi-Select

**How Figma/Miro handle it:**
- Shift+click adds/removes individual items from selection
- Click+drag on empty canvas creates a rubber-band/marquee selection
- Shift+drag adds marquee results to existing selection

**DriftGrid opportunity:**
- Shift+click to toggle star/select on multiple cards without deselecting previous ones
- This would let users quickly build a selects set: Shift+click, Shift+click, Shift+click instead of navigating to each card and pressing S
- Low code cost: modify `handleThumbnailClick` to check for `shiftKey` and call `onStarVersion` directly

### Hover States

**Industry standard:**
- Figma: subtle blue outline on hover, border thickens on select
- Miro: light shadow lift + outline on hover
- Framer: subtle scale increase (1.02x) + shadow on hover for interactive elements

**DriftGrid currently:**
- Action buttons appear on hover (good)
- No visual lift or border change on hover (the card just sits there until you click)

**Recommendation — add hover lift:**
- On hover: `transform: translateY(-2px)`, `box-shadow` increase, border color shift to `var(--foreground)` at 0.3 opacity
- Transition: `150ms ease-out`
- This signals "clickable" instantly. Small code change in `CanvasCard.tsx` — add hover state to the card container
- Keep it subtle: this isn't a button, it's a canvas object. 2px lift, not 8px.

---

## 2. Keyboard Shortcuts

### Industry Standard Shortcuts (Figma/Miro/Sketch consensus)

| Action | Figma | Miro | DriftGrid Current | Recommendation |
|--------|-------|------|-------------------|----------------|
| Zoom to fit all | Shift+1 | Alt+1 | ` (backtick) | Keep ` but add Shift+1 as alias |
| Zoom to selection | Shift+2 | Alt+2 | 4 (z4 level) | Add Shift+2 as "zoom to current card" |
| Zoom 100% | Shift+0 | — | — | Add: reset to 1:1 pixel scale |
| Zoom in/out | Cmd+/Cmd- | Cmd+/Cmd- | Scroll wheel only | Add Cmd+Plus/Cmd+Minus |
| Pan | Space+drag | Right-click drag | Space+drag | Good as-is |
| Select all | Cmd+A | Cmd+A | — | Select all cards (star all) |
| Deselect | Esc | Esc | Esc (zoom out) | Good — Esc already backs out |
| Quick actions | Cmd+/ | / | ? (shortcuts) | Add Cmd+K command palette |
| Toggle UI | Cmd+\ | — | H (nav grid), N (topbar) | Good — but unify under Cmd+\ |
| Fullscreen | — | — | Enter | Good — matches drill-down |
| Next/prev frame | Arrow keys | Arrow keys | Arrow keys | Good |
| Present | — | — | — | Add P for present mode |

**High-impact additions (least code):**

1. **Cmd+Plus/Cmd+Minus for zoom** — users expect this universally. Add to `useCanvasTransform.ts` keydown handler. Scale by 1.25x per press, centered on viewport center.

2. **Shift+1 / Shift+2 aliases** — Figma muscle memory is strong. Map Shift+1 to `onZoomToLevel('overview')` and Shift+2 to `onZoomToLevel('z4')` (current card).

3. **F for fit-to-frame** — when a card is highlighted, F zooms to fit that card in the viewport. Alias for pressing 4.

4. **P for present** — jump straight to presentation mode from grid view.

5. **Cmd+K command palette** — see section 6 below. This is the single highest-impact UX addition for power users.

---

## 3. Canvas Feel — Making It "Snappy"

### Animation Timing

**Current DriftGrid:**
- Zoom animations: `0.3s cubic-bezier(0.4, 0, 0.2, 1)` (Material Design standard ease)
- Momentum: friction 0.95, velocity threshold 0.5

**What makes Figma feel snappy:**
- Zoom transitions are ~200ms, not 300ms
- The easing is more aggressive ease-out: arrives fast, settles gently
- No animation on scroll-wheel zoom (instant transform update)
- Animated zoom only on programmatic actions (zoom-to-fit, zoom-to-selection)

**Recommendations:**

1. **Switch to a faster ease-out curve:**
   ```
   Current:  cubic-bezier(0.4, 0, 0.2, 1)    — 300ms (Material)
   Better:   cubic-bezier(0.16, 1, 0.3, 1)    — 250ms (fast-settle)
   ```
   The `(0.16, 1, 0.3, 1)` curve accelerates quickly then decelerates smoothly — it feels "responsive" rather than "smooth." It's the same family Framer uses for their spring-like CSS transitions.

2. **Reduce animation duration from 300ms to 220-250ms:**
   In `useCanvasTransform.ts`, change the `setTimeout` for animating from 350ms to 280ms, and the CSS transition from `0.3s` to `0.22s`:
   ```css
   transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)
   ```

3. **Add will-change: transform during animation, remove after:**
   Currently `willChange: 'transform'` is always set. This is fine for now, but for maximum GPU compositing performance, toggle it on just before animation and off 100ms after.

### Momentum Scrolling

**Current DriftGrid:** friction 0.95, working well.

**Refinement:**
- Increase friction slightly to **0.92** for a tighter, more controlled feel (current 0.95 coasts too long)
- Cap maximum momentum velocity at ~30px/frame to prevent "flinging" off into empty canvas
- Add a subtle **rubber-band effect** at canvas boundaries: when momentum would push past the content bounds, apply exponential decay instead of hard stop. Formula: `overshoot * 0.15` for the resistance factor.

### Zoom Behavior

**Figma's zoom behavior:**
- Scroll wheel zoom: instant (no animation), centered on cursor position
- Programmatic zoom (Shift+1, fit-all): animated 200ms
- Pinch zoom: direct manipulation, no animation
- Zoom snaps to "nice" values when close: 25%, 50%, 100%, 200% (gentle snap, not forced)

**DriftGrid currently:** scroll zoom is instant and cursor-centered (good). No snap-to-percentage.

**Recommendation:**
- Add optional zoom percentage display (tiny, bottom-right, like Figma's). Format: `48%` in 9px mono text
- Snap to 100% when zoom is between 0.97 and 1.03: `if (Math.abs(newScale - 1) < 0.03) newScale = 1;`
- This is a subtle quality signal — users notice when they can zoom to exactly 100%

---

## 4. Minimap / Overview Patterns

### How Tools Handle It

**Figma:** No native minimap (community plugins fill the gap). Uses the layers panel and page list for navigation instead.

**Miro:** Built-in minimap in bottom-right corner. Shows viewport rectangle on a tiny representation of the board. Click to navigate, drag the rectangle to pan.

**VS Code / Code editors:** Minimap is a vertical strip showing code density. Hover to preview, click to jump.

### DriftGrid Context

DriftGrid already has a NavigationGrid component that shows the grid structure. The plan mentions a minimap in Phase 1.2.

**Recommendation — lightweight viewport indicator:**

Rather than a full minimap (which is heavy to implement), add a **position indicator** that appears during/after pan or zoom:

1. **Transient dot-indicator:** During panning, show a small rectangle in the bottom-right corner representing the viewport's position within the total canvas bounds. Fade in on pan start, fade out 1.5s after pan stops.

2. **Implementation sketch:**
   ```
   viewportRect = {
     x: -transform.tx / transform.scale / totalWidth,
     y: -transform.ty / transform.scale / totalHeight,
     w: viewportWidth / transform.scale / totalWidth,
     h: viewportHeight / transform.scale / totalHeight,
   }
   ```
   Render as a 120x80px div with a small white rectangle (the viewport) on a translucent dark background with tiny dots representing card positions.

3. **Click-to-navigate on the minimap:** Click a position on the minimap to pan the canvas there. This is the single most useful minimap interaction.

4. **Cost:** ~80 lines of code in a new `Minimap.tsx` component. Medium effort, high value for projects with 5+ concepts or 10+ versions.

---

## 5. Presentation / Review Mode

### How Tools Handle Mode Switching

**Figma:**
- Shift+E toggles between Design and Prototype panels
- Present mode opens in a new tab/window
- Clear visual separation: editing is on the canvas, presenting is fullscreen

**Pitch:**
- Cmd+K opens command palette for quick actions
- Alt+S sets slide status
- Presentation mode is a distinct fullscreen view with speaker notes
- **Presenter view** shows current slide, next slide preview, notes, and timer

**Canva:**
- Presenter View shows slide previews, notes, and timer
- Live changes during presentation reflected in real-time
- Number keys set timers (1 = 1 min, 2 = 2 min)

### DriftGrid Currently

- Presentation mode exists (selects as slideshow)
- Enter/Esc transitions between grid and fullscreen
- The `viewMode` state switches between `'grid'` and `'fullscreen'`

### Recommendations

1. **Presentation mode entry shortcut: Cmd+Enter**
   - From anywhere, Cmd+Enter starts presenting from selects
   - Esc exits back to the grid at the last viewed card
   - Much faster than navigating to the selects bar and clicking Present

2. **Presentation slide counter:**
   - Bottom-center: `3 / 12` (current / total selects) in subtle mono text
   - Appears in presentation mode only
   - Arrow keys navigate between selects (already implemented)

3. **Presenter notes via changelog:**
   - DriftGrid versions have a `changelog` field — surface this as presenter notes
   - In presentation mode, press N to toggle a notes overlay at the bottom
   - Content: the current version's changelog text
   - Very low code cost since the data already exists

4. **Quick-review mode (new):**
   - Press R to enter "review mode" — cycles through only starred selects in grid view at z4 zoom level
   - Arrow left/right jumps between selects (skipping non-selected cards)
   - This is useful for Jeff reviewing picks before presenting to clients
   - Implementation: filter navigation to only `selections` entries

---

## 6. Quick Actions & Context Menus

### Command Palette (Cmd+K)

**Figma:** Cmd+/ opens the actions menu — search for any command, plugin, or action
**Pitch:** Cmd+K opens quick menu for navigation and actions
**VS Code:** Cmd+Shift+P for command palette, Cmd+P for file navigation

**DriftGrid recommendation — Cmd+K command palette:**

This is the single highest-ROI feature for power users. A minimal implementation:

```
Commands:
- "Zoom to fit"          → fitAll
- "Zoom to [concept]"    → zoom to that column
- "Star current"         → toggle star
- "Present selects"      → enter presentation
- "Go to latest"         → navigate to latest version
- "Clear all selects"    → clear selections
- "Export PDF"           → trigger export
- "Toggle theme"         → dark/light
- "Concept: [name]"      → navigate to concept by name
```

**Implementation:**
- Modal overlay with search input, filtered results, keyboard navigation (up/down/enter)
- Fuzzy match on command names
- Show keyboard shortcut hint next to each result
- ~150 lines of code for a basic version
- Escape or click outside to dismiss

### Right-Click Context Menu

**Current DriftGrid:** No right-click menu on cards.

**Recommendation:**
Right-click on a card shows a context menu:
```
Star / Unstar          S
Drift (new version)    D
Copy path              Cmd+C
Open in browser        O
Delete                 Del
──────────
Zoom to card           4
Zoom to concept        1
```

**Implementation:**
- Intercept `onContextMenu` on `CanvasCard`
- Render a positioned `<div>` at cursor coordinates
- Keyboard navigation within menu (up/down/enter)
- Dismiss on click outside, Escape, or action execution
- ~100 lines in a new `ContextMenu.tsx` component

### Floating Action Bar

**Figma pattern:** When objects are selected, a floating toolbar appears above/below the selection with contextual actions.

**DriftGrid adaptation:**
When a card is highlighted (current), show a floating bar below the card with:
```
[ Star ] [ Drift ] [ Copy Path ] [ Enter ]
```

This makes card-level actions discoverable without hovering. Currently, action buttons only show on hover — users on trackpads or using keyboard nav never see them.

**Implementation:**
- Render conditionally in `CanvasCard` when `isCurrent && !isPanning`
- Position: `bottom: -36px` relative to card
- Small pill shape, same backdrop-blur style as existing action buttons
- Show with 150ms fade-in delay (prevent flicker during keyboard navigation)

---

## 7. Specific UX Optimizations — Prioritized by Impact/Effort

### Tier 1: Quick Wins (< 30 min each, big feel improvement)

**7.1 — Faster animation curve**
- File: `/Users/jeffbzy/drift/components/CanvasView.tsx` line 333
- Change: `transition: animating ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'`
- To: `transition: animating ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'`
- Also update `setTimeout` in `useCanvasTransform.ts` from 350ms to 280ms
- **Why:** 80ms faster + better curve = canvas feels twice as responsive

**7.2 — Card hover lift**
- File: `/Users/jeffbzy/drift/components/CanvasCard.tsx`
- Add to the outer `div[data-card]`: CSS hover state with `translateY(-2px)` and shadow increase
- Use `transition: transform 150ms ease-out, box-shadow 150ms ease-out`
- **Why:** Instantly communicates "this is interactive" without any extra UI

**7.3 — Double-click to enter fullscreen**
- File: `/Users/jeffbzy/drift/components/CanvasView.tsx` — `handleThumbnailClick`
- Add `onDoubleClick` handler to `CanvasCard` that calls `onSelect` directly
- Change single click to always highlight (remove the "click again to enter" logic)
- **Why:** Matches Figma/Miro mental model. Eliminates the awkward two-click-to-enter pattern.

**7.4 — Zoom percentage indicator**
- File: `/Users/jeffbzy/drift/components/CanvasView.tsx`
- Add a small `<span>` in the bottom-right corner: `{Math.round(transform.scale * 100)}%`
- Style: 9px mono, opacity 0.3, same as existing hint text
- **Why:** Orientation cue. Users always want to know their zoom level.

**7.5 — Snap zoom to 100%**
- File: `/Users/jeffbzy/drift/lib/hooks/useCanvasTransform.ts` — `onWheel`
- After computing `newScale`: `if (Math.abs(newScale - 1) < 0.03) newScale = 1;`
- **Why:** "Pixel perfect" zoom level is a quality signal

### Tier 2: Medium Effort (1-2 hours each, significant UX improvement)

**7.6 — Cmd+K command palette**
- New file: `components/CommandPalette.tsx`
- Trigger: Cmd+K in Viewer.tsx keydown handler
- ~150 lines for basic search + filtered commands
- **Why:** Power user productivity. Makes every action 2 keystrokes away.

**7.7 — Right-click context menu**
- New file: `components/ContextMenu.tsx`
- Wire into `CanvasCard.tsx` via `onContextMenu`
- ~100 lines for positioned menu with keyboard nav
- **Why:** Discoverability. Users right-click instinctively on canvas objects.

**7.8 — Shift+click multi-star**
- Modify `handleThumbnailClick` in `CanvasView.tsx`
- If shift held: toggle star on clicked card without changing highlight
- **Why:** Building a selects set is currently slow (navigate + press S for each). Shift+click is 3x faster.

**7.9 — Minimap/viewport indicator**
- New file: `components/Minimap.tsx`
- Render in bottom-right of `CanvasView`, 120x80px
- Show card positions as dots, viewport as white rectangle
- Click to navigate
- **Why:** Essential for projects with many concepts/versions. Prevents "lost on canvas."

**7.10 — Cmd+Enter to present**
- Add to keyboard handler in Viewer.tsx
- Cmd+Enter triggers `onPresent()` from anywhere
- **Why:** Fastest path from iteration to presentation

### Tier 3: Larger Efforts (half-day each, polish-level features)

**7.11 — Floating action bar on current card**
- Positioned below the highlighted card, shows primary actions
- Appears on keyboard navigation (not just hover)
- Solves the "actions are only visible on hover" problem for keyboard users

**7.12 — Smooth card-to-card transitions**
- When navigating with arrow keys at z3/z4 zoom, animate the canvas position using a spring-like curve instead of the current instant jump
- Use `cubic-bezier(0.25, 1, 0.5, 1)` at 300ms for a "settle" feeling
- Add slight overshoot (y2 > 1) for natural momentum

**7.13 — Rubber-band canvas boundaries**
- When panning past content bounds, apply resistance (factor 0.15)
- On release, spring back to nearest valid position with 250ms animation
- Gives the canvas a physical "edge" feel instead of infinite emptiness

**7.14 — Review mode (R key)**
- Filter navigation to starred selects only
- Cycles through selects at z4 zoom with animated transitions
- Shows `3/12 selects` counter
- Esc exits back to normal grid navigation

---

## Summary: Recommended Build Order

**Batch 1 — Immediate polish (do before open-source launch):**
1. Faster animation curve (7.1) — 5 min
2. Card hover lift (7.2) — 10 min
3. Double-click to enter (7.3) — 15 min
4. Zoom percentage (7.4) — 5 min
5. 100% zoom snap (7.5) — 5 min

**Batch 2 — Power user features (do for v1.1):**
6. Cmd+K command palette (7.6)
7. Right-click context menu (7.7)
8. Shift+click multi-star (7.8)
9. Cmd+Enter to present (7.10)

**Batch 3 — Polish and delight (do for v1.2):**
10. Minimap (7.9)
11. Floating action bar (7.11)
12. Spring card-to-card transitions (7.12)
13. Rubber-band boundaries (7.13)
14. Review mode (7.14)

---

## Sources

- [Figma: Adjust zoom and view options](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options)
- [Figma: Select layers and objects](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects)
- [Figma: Use shortcuts and quick actions](https://help.figma.com/hc/en-us/articles/360040328653-Use-shortcuts-and-quick-actions)
- [Figma: Present designs and prototypes](https://help.figma.com/hc/en-us/articles/360040318013-Present-designs-and-prototypes)
- [Figma: Smart animate layers between frames](https://help.figma.com/hc/en-us/articles/360039818874-Smart-animate-layers-between-frames)
- [Figma: Actions menu](https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design)
- [Top 113 Figma Keyboard Shortcuts](https://dualite.dev/blog/figma-keyboard-shortcuts)
- [Miro: Shortcuts and hotkeys](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys)
- [Miro: Keyboard navigation on boards](https://help.miro.com/hc/en-us/articles/11997028019858-Keyboard-navigation-while-working-on-boards)
- [Miro: Mouse, trackpad, touchscreen](https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen)
- [Framer: Hover and Press Effects](https://www.framer.com/academy/lessons/framer-animations-hover-and-press-effects)
- [Framer Animations Complete Guide 2026](https://framerwebsites.com/blog/framer-animations-complete-guide)
- [Figma minimap plugin](https://www.figma.com/community/plugin/772952119002135124/minimap)
- [Quick Navigator plugin](https://www.figma.com/community/plugin/1499718460595414241/quick-navigator)
- [Mastering the Move Tool & Selection Logic in Figma](https://julioedi.com/blog/2025/07/the-move-tool-selection-logic/)
- [Context Menu UX Design](https://medium.com/@hagan.rivers/context-menu-ux-design-75e3093eb127)
- [Spring physics behind animations](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/)
- [Advanced CSS cubic-bezier](https://css-tricks.com/advanced-css-animation-using-cubic-bezier/)
- [Understanding easing curves in CSS](https://joshcollinsworth.com/blog/easing-curves)
- [Web Animation Best Practices: 60 FPS](https://ipixel.com.sg/web-development/how-to-achieve-smooth-css-animations-60-fps-performance-guide/)
- [Canva: Presenting designs](https://www.canva.com/help/presenting-designs/)
- [Pitch: FAQ](https://help.pitch.com/en/articles/5524801-frequently-asked-questions)
