'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'driftgrid-tour-seen';

export type TourTrigger = 'arrow' | 'enter' | 'esc' | 'drift' | 'branch' | 'comment' | 'any';

export interface TourStep {
  eyebrow: string;
  hint: string;
  keys?: string[];
  /** Action that advances this step (action mode only) */
  advanceOn?: TourTrigger;
  autoDismissAfter?: number;
}

/** Default step list for action-triggered tour on regular share links */
export const TOUR_STEPS: TourStep[] = [
  {
    eyebrow: 'Welcome',
    hint: 'Rapid design iteration and sharing. You direct, your AI agent executes. Columns are concepts, rows are versions.',
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
    eyebrow: 'Leave a prompt',
    hint: 'Press C to drop a prompt anywhere on the frame. Your agent reads it and edits the design.',
    keys: ['C'],
    advanceOn: 'comment',
  },
  {
    eyebrow: 'Back to the grid',
    hint: 'Press Esc or G to come back to the grid.',
    keys: ['esc', 'G'],
    advanceOn: 'esc',
  },
  {
    eyebrow: 'Drift up — new version',
    hint: 'Press D to drift a new version of the current card. A new slot appears — tell your agent what to put in it.',
    keys: ['D'],
    advanceOn: 'drift',
  },
  {
    eyebrow: 'Drift right — new concept',
    hint: 'Press Shift+D to drift a new concept column — a whole new direction to explore.',
    keys: ['Shift', 'D'],
    advanceOn: 'branch',
  },
  {
    eyebrow: 'You\u2019re set',
    hint: 'Press ? anytime for all shortcuts. Press P to present your starred versions fullscreen.',
    keys: ['?', 'P'],
    advanceOn: 'any',
  },
];

/**
 * Walkthrough steps for the meta demo project.
 * One step per concept/column in the walkthrough project — advances automatically
 * as the user navigates through the columns. Persistent overlay, never auto-dismisses.
 */
export const WALKTHROUGH_STEPS: TourStep[] = [
  {
    eyebrow: '1 · Welcome',
    hint: 'DriftGrid is rapid design iteration and sharing. This walkthrough has 12 slides. → to advance.',
    keys: ['→'],
  },
  {
    eyebrow: '2 · Inside a Frame',
    hint: 'Enter or double-click any card to view the live HTML design.',
    keys: ['↵'],
  },
  {
    eyebrow: '3 · Leave a Prompt',
    hint: 'Press C to drop a comment — your instruction to the agent.',
    keys: ['C'],
  },
  {
    eyebrow: '4 · Copy to Terminal',
    hint: 'Copy the prompt and paste it into your AI agent in your terminal.',
    keys: ['⌘⇧C'],
  },
  {
    eyebrow: '5 · Agent Reply',
    hint: 'Your agent edits the file and replies in the thread. DriftGrid refreshes.',
  },
  {
    eyebrow: '6 · Drift Up',
    hint: 'Press D to drift a new version slot. Your next iteration appears above.',
    keys: ['D'],
  },
  {
    eyebrow: '7 · Drift Roundtrip',
    hint: 'Same loop — you direct, the agent executes. Keep drifting up.',
  },
  {
    eyebrow: '8 · Drift Right',
    hint: 'Press Shift+D to drift a new concept column — a new direction to explore.',
    keys: ['Shift', 'D'],
  },
  {
    eyebrow: '9 · Drift Right Roundtrip',
    hint: 'New column, same loop. Keep drifting up and to the right.',
  },
  {
    eyebrow: '10 · Star Your Picks',
    hint: 'Press S to star versions across concepts. These become your selects.',
    keys: ['S'],
  },
  {
    eyebrow: '11 · Present',
    hint: 'Press P to present starred versions fullscreen. Walk your team through.',
    keys: ['P'],
  },
  {
    eyebrow: '12 · Share',
    hint: 'Generate a public review link. No login needed. Clients comment, you iterate.',
  },
];

export type TourMode = 'action' | 'walkthrough';

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

export interface TourOptions {
  mode?: TourMode;
  /** In walkthrough mode, the current concept index drives the step */
  walkthroughStepIndex?: number;
  /** Custom steps for walkthrough mode */
  steps?: TourStep[];
  /** Called when user clicks Done on the last walkthrough step */
  onWalkthroughDone?: () => void;
}

/**
 * Tour state hook. Two modes:
 * - 'action' (default): auto-starts on first visit, advances when user performs actions (arrow, enter, etc.)
 * - 'walkthrough': persistent overlay, current step derives from walkthroughStepIndex (the conceptIndex)
 */
export function useTour(enabled: boolean, options: TourOptions = {}): TourState {
  const {
    mode = 'action',
    walkthroughStepIndex = 0,
    steps: customSteps,
    onWalkthroughDone,
  } = options;

  const isWalkthrough = mode === 'walkthrough';
  const steps = isWalkthrough ? (customSteps ?? WALKTHROUGH_STEPS) : TOUR_STEPS;

  const [active, setActive] = useState(isWalkthrough);
  const [actionStep, setActionStep] = useState(0);
  const firstRun = useRef(true);

  // Action mode: check localStorage and auto-start on first visit
  useEffect(() => {
    if (isWalkthrough) {
      setActive(true);
      return;
    }
    if (!firstRun.current) return;
    firstRun.current = false;
    if (!enabled) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const timer = setTimeout(() => setActive(true), 600);
        return () => clearTimeout(timer);
      }
    } catch {
      setActive(true);
    }
  }, [enabled, isWalkthrough]);

  const dismiss = useCallback(() => {
    if (isWalkthrough) {
      // Walkthrough "done" — call the handoff if provided, otherwise just hide
      onWalkthroughDone?.();
      setActive(false);
      return;
    }
    setActive(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, [isWalkthrough, onWalkthroughDone]);

  const replay = useCallback(() => {
    setActionStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    if (isWalkthrough) {
      // In walkthrough mode, "next" is handled externally by advancing conceptIndex
      // We call onWalkthroughDone if we're past the last step
      return;
    }
    setActionStep(s => {
      if (s + 1 >= steps.length) {
        dismiss();
        return s;
      }
      return s + 1;
    });
  }, [dismiss, isWalkthrough, steps.length]);

  const trigger = useCallback((kind: TourTrigger) => {
    if (isWalkthrough) return; // walkthrough doesn't use action triggers
    if (!active) return;
    const currentStep = steps[actionStep];
    if (!currentStep) return;

    const matches = currentStep.advanceOn === 'any' || currentStep.advanceOn === kind;
    if (!matches) return;

    if (actionStep + 1 >= steps.length) {
      dismiss();
    } else {
      setActionStep(s => s + 1);
    }
  }, [active, actionStep, dismiss, isWalkthrough, steps]);

  // Auto-dismiss handling for action-mode last step
  useEffect(() => {
    if (isWalkthrough) return;
    if (!active) return;
    const current = steps[actionStep];
    if (!current?.autoDismissAfter) return;
    const t = setTimeout(() => dismiss(), current.autoDismissAfter);
    return () => clearTimeout(t);
  }, [active, actionStep, dismiss, isWalkthrough, steps]);

  // Compute derived state
  const currentIndex = isWalkthrough
    ? Math.max(0, Math.min(walkthroughStepIndex, steps.length - 1))
    : actionStep;

  return {
    active,
    step: currentIndex,
    totalSteps: steps.length,
    currentStep: active ? steps[currentIndex] ?? null : null,
    dismiss,
    replay,
    next,
    trigger,
  };
}
