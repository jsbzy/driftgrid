import type { Concept, Round } from '@/lib/types';

export interface CardPosition {
  conceptIndex: number;
  versionIndex: number; // original index (not reversed)
  conceptId: string;
  versionId: string;
  x: number;
  y: number;
}

export interface LabelPosition {
  conceptIndex: number;
  conceptId: string;
  label: string;
  x: number;
  y: number;
}

export interface SelectsSlot {
  conceptIndex: number;
  conceptId: string;
  x: number;
  y: number;
}

export interface DividerPosition {
  conceptIndex: number;
  x: number;
  y: number;
  width: number;
  roundId: string;
  roundName: string;
  versionCount: number; // how many versions in this round for this concept
}

export interface CanvasLayout {
  cards: CardPosition[];
  labels: LabelPosition[];
  selectsSlots: SelectsSlot[];
  dividers: DividerPosition[];
  totalWidth: number;
  totalHeight: number;
  cardWidth: number;
  cardHeight: number;
  selectsHeight: number;
}

const CARD_WIDTH = 440;
const COLUMN_GAP = 24;
const ROW_GAP = 20;
const CANVAS_PADDING = 80;
const LABEL_HEIGHT = 36;
const SELECTS_HEIGHT_RATIO = 1; // selects slot is same size as card
const SELECTS_GAP = 20; // gap between selects row and label
const DIVIDER_HEIGHT = 24; // height of round divider row
const DIVIDER_GAP = 16; // extra gap above and below divider

export function computeCanvasLayout(
  concepts: Concept[],
  aspectRatio: string, // e.g. "16 / 9" or "794 / 1123"
  rounds?: Round[],
  collapsedRounds?: Set<string>,
): CanvasLayout {
  // Parse aspect ratio
  const parts = aspectRatio.split('/').map(s => parseFloat(s.trim()));
  const ratio = parts.length === 2 ? parts[1] / parts[0] : 9 / 16;
  const cardHeight = Math.round(CARD_WIDTH * ratio);
  const selectsHeight = Math.round(cardHeight * SELECTS_HEIGHT_RATIO);

  // Build a lookup from roundId → Round for name resolution
  const roundMap = new Map<string, Round>();
  if (rounds) {
    for (const r of rounds) roundMap.set(r.id, r);
  }

  const cards: CardPosition[] = [];
  const labels: LabelPosition[] = [];
  const selectsSlots: SelectsSlot[] = [];
  const dividers: DividerPosition[] = [];
  let maxColumnBottom = 0;

  // Layout: selects slot → gap → label → cards
  const selectsRowTop = CANVAS_PADDING;
  const labelTop = selectsRowTop + selectsHeight + SELECTS_GAP;
  const cardsTop = labelTop + LABEL_HEIGHT;

  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);

    selectsSlots.push({
      conceptIndex: col,
      conceptId: concept.id,
      x,
      y: selectsRowTop,
    });

    labels.push({
      conceptIndex: col,
      conceptId: concept.id,
      label: concept.label,
      x,
      y: labelTop,
    });

    // Reverse: latest version first (matching GridView behavior)
    // row 0 = latest version (no roundId = current round)
    // When we hit a version with a different roundId from the previous, insert a divider
    const versionCount = concept.versions.length;
    let currentY = cardsTop;
    let prevRoundId: string | undefined | null = null; // null = not yet set
    // Track how many versions per roundId in this concept (for collapsed label count)
    const roundVersionCounts = new Map<string, number>();
    for (const v of concept.versions) {
      if (v.roundId) {
        roundVersionCounts.set(v.roundId, (roundVersionCounts.get(v.roundId) ?? 0) + 1);
      }
    }

    for (let row = 0; row < versionCount; row++) {
      const originalIndex = versionCount - 1 - row;
      const version = concept.versions[originalIndex];
      const versionRoundId = version.roundId ?? undefined;

      // Detect round boundary — when roundId changes between consecutive rows
      if (prevRoundId !== null && versionRoundId !== prevRoundId) {
        // The divider represents the round we're about to enter (the closed round)
        const enteringRoundId = versionRoundId;
        if (enteringRoundId) {
          const round = roundMap.get(enteringRoundId);
          const roundName = round?.name ?? `Round ${round?.number ?? '?'}`;
          const vCount = roundVersionCounts.get(enteringRoundId) ?? 0;

          // Add gap before divider
          currentY += DIVIDER_GAP;

          dividers.push({
            conceptIndex: col,
            x,
            y: currentY,
            width: CARD_WIDTH,
            roundId: enteringRoundId,
            roundName,
            versionCount: vCount,
          });

          currentY += DIVIDER_HEIGHT + DIVIDER_GAP;

          // If this round is collapsed, skip all versions in this round
          if (collapsedRounds?.has(enteringRoundId)) {
            // Skip ahead past all versions with this roundId
            let skip = row;
            while (skip < versionCount) {
              const skipIdx = versionCount - 1 - skip;
              const skipVersion = concept.versions[skipIdx];
              if ((skipVersion.roundId ?? undefined) !== enteringRoundId) break;
              skip++;
            }
            // Update prevRoundId to match what comes after the skipped versions
            // (or stay at the collapsed round if we hit the end)
            if (skip < versionCount) {
              const nextIdx = versionCount - 1 - skip;
              prevRoundId = concept.versions[nextIdx].roundId ?? undefined;
            }
            row = skip - 1; // -1 because the for loop will increment
            continue;
          }
        }
      }

      prevRoundId = versionRoundId;

      cards.push({
        conceptIndex: col,
        versionIndex: originalIndex,
        conceptId: concept.id,
        versionId: version.id,
        x,
        y: currentY,
      });

      currentY += cardHeight + ROW_GAP;
    }

    // Track maximum column bottom for total height
    // Subtract the last ROW_GAP since there's no card after the last one
    const columnBottom = currentY - ROW_GAP;
    if (columnBottom > maxColumnBottom) {
      maxColumnBottom = columnBottom;
    }
  });

  const totalWidth = concepts.length > 0
    ? CANVAS_PADDING * 2 + concepts.length * CARD_WIDTH + (concepts.length - 1) * COLUMN_GAP
    : CANVAS_PADDING * 2;
  const totalHeight = maxColumnBottom > 0
    ? maxColumnBottom + CANVAS_PADDING
    : CANVAS_PADDING * 2;

  return { cards, labels, selectsSlots, dividers, totalWidth, totalHeight, cardWidth: CARD_WIDTH, cardHeight, selectsHeight };
}

/** Bounding box of an entire concept column (label + all cards) */
export function getColumnBounds(
  layout: CanvasLayout,
  conceptIndex: number,
): { x: number; y: number; w: number; h: number } {
  let colX = 0;
  let maxCardY = -Infinity;
  let found = false;

  for (let i = 0; i < layout.cards.length; i++) {
    const c = layout.cards[i];
    if (c.conceptIndex === conceptIndex) {
      if (!found) {
        colX = c.x;
        found = true;
      }
      if (c.y > maxCardY) maxCardY = c.y;
    }
  }

  if (!found) return { x: 0, y: 0, w: 0, h: 0 };

  const label = layout.labels[conceptIndex];
  const minY = label ? label.y : maxCardY;

  return { x: colX - 20, y: minY - 20, w: layout.cardWidth + 40, h: maxCardY + layout.cardHeight - minY + 40 };
}

/** Bounding box of a single card */
export function getCardBounds(
  layout: CanvasLayout,
  conceptIndex: number,
  versionIndex: number,
): { x: number; y: number; w: number; h: number } {
  const card = layout.cards.find(
    c => c.conceptIndex === conceptIndex && c.versionIndex === versionIndex
  );
  if (!card) return { x: 0, y: 0, w: 0, h: 0 };

  return {
    x: card.x - 20,
    y: card.y - 20,
    w: layout.cardWidth + 40,
    h: layout.cardHeight + 40,
  };
}
