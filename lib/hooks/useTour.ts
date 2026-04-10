'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'driftgrid-tour-seen';

export type TourTrigger = 'arrow' | 'enter' | 'esc' | 'drift' | 'branch' | 'any';

export interface TourStep {
  eyebrow: string;
  hint: string;
  keys?: string[];
  advanceOn: TourTrigger;
  autoDismissAfter?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    eyebrow: 'Welcome',
    hint: 'This is DriftGrid. An infinite grid for rapid design iteration. You direct, your AI agent executes. Columns are concepts, rows are versions.',
    keys: ['←', '→', '↑', '↓'],
    advanceOn: 'arrow',
  },
  {
    eyebrow: 'See a design',
    hint: 'Press Enter or double-click a card to open the live HTML frame.',
    keys: ['↵', '2x click'],
    advanceOn: 'enter',
  },
  {
    eyebrow: 'Back to the grid',
    hint: 'Press Esc or G to come back to the grid.',
    keys: ['esc', 'G'],
    advanceOn: 'esc',
  },
  {
    eyebrow: 'Drift — new version',
    hint: 'Press D to open a new empty version slot. Tell your agent what you want — it fills it in.',
    keys: ['D'],
    advanceOn: 'drift',
  },
  {
    eyebrow: 'Branch — new concept',
    hint: 'Press Shift+D to start a new concept column — a new direction to explore.',
    keys: ['⇧', 'D'],
    advanceOn: 'branch',
  },
  {
    eyebrow: 'You\u2019re set',
    hint: 'Press ? anytime for all shortcuts. Press P to present your starred versions fullscreen.',
    keys: ['?', 'P'],
    advanceOn: 'any',
  },
];

export interface TourState {
  active: boolean;
  step: number;
  totalSteps: number;
  currentStep: TourStep | null;
  dismiss: () => void;
  replay: () => void;
  next: () => void;
  trigger: (kind: TourTrigger) => void;
}

/**
 * Tour state hook. Auto-starts on first visit when `enabled === true`.
 * Reads/writes localStorage.driftgrid-tour-seen.
 */
export function useTour(enabled: boolean): TourState {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const firstRun = useRef(true);

  // On mount: check localStorage and auto-start if appropriate
  useEffect(() => {
    if (!firstRun.current) return;
    firstRun.current = false;
    if (!enabled) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        // Small delay so the tour doesn't pop in before the page settles
        const timer = setTimeout(() => setActive(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      setActive(true);
    }
  }, [enabled]);

  const dismiss = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const replay = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStep(s => {
      if (s + 1 >= TOUR_STEPS.length) {
        dismiss();
        return s;
      }
      return s + 1;
    });
  }, [dismiss]);

  const trigger = useCallback((kind: TourTrigger) => {
    if (!active) return;
    const currentStep = TOUR_STEPS[step];
    if (!currentStep) return;

    const matches = currentStep.advanceOn === 'any' || currentStep.advanceOn === kind;
    if (!matches) return;

    if (step + 1 >= TOUR_STEPS.length) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  }, [active, step, dismiss]);

  // Auto-dismiss handling for last step
  useEffect(() => {
    if (!active) return;
    const current = TOUR_STEPS[step];
    if (!current?.autoDismissAfter) return;
    const t = setTimeout(() => dismiss(), current.autoDismissAfter);
    return () => clearTimeout(t);
  }, [active, step, dismiss]);

  return {
    active,
    step,
    totalSteps: TOUR_STEPS.length,
    currentStep: active ? TOUR_STEPS[step] ?? null : null,
    dismiss,
    replay,
    next,
    trigger,
  };
}
