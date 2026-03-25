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
  roundId: string | null; // null = current round
}

export interface DividerPosition {
  x: number;              // left edge (CANVAS_PADDING)
  y: number;
  width: number;          // full grid width
  roundId: string;
  roundName: string;
  versionCount: number;   // total across all concepts
}

export interface RoundLabelPosition {
  roundId: string | null; // null = current round
  roundName: string;
  x: number;
  y: number;
}

export interface CanvasLayout {
  cards: CardPosition[];
  labels: LabelPosition[];
  selectsSlots: SelectsSlot[];
  dividers: DividerPosition[];
  roundLabels: RoundLabelPosition[];
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

  const cards: CardPosition[] = [];
  const labels: LabelPosition[] = [];
  const selectsSlots: SelectsSlot[] = [];
  const dividers: DividerPosition[] = [];
  const roundLabels: RoundLabelPosition[] = [];

  if (concepts.length === 0) {
    return {
      cards,
      labels,
      selectsSlots,
      dividers,
      roundLabels,
      totalWidth: CANVAS_PADDING * 2,
      totalHeight: CANVAS_PADDING * 2,
      cardWidth: CARD_WIDTH,
      cardHeight,
      selectsHeight,
    };
  }

  // Grid width across all columns
  const gridWidth = concepts.length * CARD_WIDTH + (concepts.length - 1) * COLUMN_GAP;

  // --- LABELS at top ---
  const labelTop = CANVAS_PADDING;
  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
    labels.push({
      conceptIndex: col,
      conceptId: concept.id,
      label: concept.label,
      x,
      y: labelTop,
    });
  });

  const cardsTop = labelTop + LABEL_HEIGHT;
  let currentY = cardsTop;

  // --- CURRENT ROUND SECTION ---

  // Round label for current round
  const currentRoundNumber = (rounds?.length ?? 0) + 1;
  roundLabels.push({
    roundId: null,
    roundName: `RD ${currentRoundNumber}`,
    x: CANVAS_PADDING - 60,
    y: currentY,
  });

  // Selects row for current round
  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
    selectsSlots.push({
      conceptIndex: col,
      conceptId: concept.id,
      x,
      y: currentY,
      roundId: null,
    });
  });

  currentY += selectsHeight + SELECTS_GAP;

  // Current round versions (no roundId) — reverse order (latest first)
  const currentRoundVersionStartY = currentY;
  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
    let colY = currentRoundVersionStartY;

    // Get versions in reverse order, filter to current round only (no roundId)
    const versions = [...concept.versions].reverse().filter(v => !v.roundId);

    for (const version of versions) {
      const originalIndex = concept.versions.indexOf(version);
      cards.push({
        conceptIndex: col,
        versionIndex: originalIndex,
        conceptId: concept.id,
        versionId: version.id,
        x,
        y: colY,
      });
      colY += cardHeight + ROW_GAP;
    }

    if (colY > currentY) currentY = colY;
  });

  // If no current round versions, still leave some space
  if (currentY === currentRoundVersionStartY) {
    currentY += cardHeight + ROW_GAP;
  }

  // --- CLOSED ROUNDS (newest first, i.e., reverse order of rounds array) ---
  const sortedRounds = [...(rounds ?? [])].reverse();

  for (const round of sortedRounds) {
    // Count versions in this round across all concepts
    let totalVersions = 0;
    for (const c of concepts) {
      for (const v of c.versions) {
        if (v.roundId === round.id) totalVersions++;
      }
    }

    // Divider
    currentY += DIVIDER_GAP;
    dividers.push({
      x: CANVAS_PADDING,
      y: currentY,
      width: gridWidth,
      roundId: round.id,
      roundName: round.name,
      versionCount: totalVersions,
    });
    currentY += DIVIDER_HEIGHT + DIVIDER_GAP;

    // If collapsed, skip everything
    if (collapsedRounds?.has(round.id)) continue;

    // Round label
    const roundLabelY = currentY;
    roundLabels.push({
      roundId: round.id,
      roundName: `RD ${round.number}`,
      x: CANVAS_PADDING - 60,
      y: roundLabelY,
    });

    // Round selects row (if round has selects)
    if (round.selects && round.selects.length > 0) {
      concepts.forEach((concept, col) => {
        const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
        // Always add the slot — CanvasView will render it filled or empty
        selectsSlots.push({
          conceptIndex: col,
          conceptId: concept.id,
          x,
          y: currentY,
          roundId: round.id,
        });
      });
      currentY += selectsHeight + SELECTS_GAP;
    }

    // Round versions
    const roundVersionStartY = currentY;
    concepts.forEach((concept, col) => {
      const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
      let colY = roundVersionStartY;

      const versions = [...concept.versions].reverse().filter(v => v.roundId === round.id);

      for (const version of versions) {
        const originalIndex = concept.versions.indexOf(version);
        cards.push({
          conceptIndex: col,
          versionIndex: originalIndex,
          conceptId: concept.id,
          versionId: version.id,
          x,
          y: colY,
        });
        colY += cardHeight + ROW_GAP;
      }

      if (colY > currentY) currentY = colY;
    });
  }

  // Total dimensions
  const totalWidth = CANVAS_PADDING * 2 + concepts.length * CARD_WIDTH + (concepts.length - 1) * COLUMN_GAP;
  const totalHeight = Math.max(currentY, CANVAS_PADDING * 2) + CANVAS_PADDING;

  return { cards, labels, selectsSlots, dividers, roundLabels, totalWidth, totalHeight, cardWidth: CARD_WIDTH, cardHeight, selectsHeight };
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
