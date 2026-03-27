import type { Concept } from '@/lib/types';

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

export interface CanvasLayout {
  cards: CardPosition[];
  labels: LabelPosition[];
  selectsSlots: SelectsSlot[];
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

export function computeCanvasLayout(
  concepts: Concept[],
  aspectRatio: string, // e.g. "16 / 9" or "794 / 1123"
): CanvasLayout {
  // Parse aspect ratio
  const parts = aspectRatio.split('/').map(s => parseFloat(s.trim()));
  const ratio = parts.length === 2 ? parts[1] / parts[0] : 9 / 16;
  const cardHeight = Math.round(CARD_WIDTH * ratio);
  const selectsHeight = Math.round(cardHeight * SELECTS_HEIGHT_RATIO);

  const cards: CardPosition[] = [];
  const labels: LabelPosition[] = [];
  const selectsSlots: SelectsSlot[] = [];

  if (concepts.length === 0) {
    return {
      cards,
      labels,
      selectsSlots,
      totalWidth: CANVAS_PADDING * 2,
      totalHeight: CANVAS_PADDING * 2,
      cardWidth: CARD_WIDTH,
      cardHeight,
      selectsHeight,
    };
  }

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

  // --- SELECTS ROW (one global row) ---
  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
    selectsSlots.push({
      conceptIndex: col,
      conceptId: concept.id,
      x,
      y: currentY,
    });
  });

  currentY += selectsHeight + SELECTS_GAP;

  // --- ALL VERSION CARDS (reverse order, latest first) ---
  const versionStartY = currentY;
  concepts.forEach((concept, col) => {
    const x = CANVAS_PADDING + col * (CARD_WIDTH + COLUMN_GAP);
    let colY = versionStartY;

    const versions = [...concept.versions].reverse();

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

  // If no versions, still leave some space
  if (currentY === versionStartY) {
    currentY += cardHeight + ROW_GAP;
  }

  // Total dimensions
  const totalWidth = CANVAS_PADDING * 2 + concepts.length * CARD_WIDTH + (concepts.length - 1) * COLUMN_GAP;
  const totalHeight = Math.max(currentY, CANVAS_PADDING * 2) + CANVAS_PADDING;

  return { cards, labels, selectsSlots, totalWidth, totalHeight, cardWidth: CARD_WIDTH, cardHeight, selectsHeight };
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
