'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

interface UseCanvasTransformReturn {
  transform: Transform;
  animating: boolean;
  onWheel: (e: React.WheelEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  zoomToRect: (rect: { x: number; y: number; w: number; h: number }, padding?: number) => void;
  fitAll: (totalW: number, totalH: number, viewportW: number, viewportH: number) => void;
  setTransform: (t: Transform, animate?: boolean) => void;
  setPanTransform: (t: Transform) => void;
  isPanning: boolean;
  panAnimating: boolean;
  spaceHeld: boolean;
  recentlyPanned: React.RefObject<boolean>;
}

// Momentum scrolling constants
const FRICTION = 0.95;
const VELOCITY_THRESHOLD = 0.5;
const VELOCITY_SAMPLES = 4;

const MIN_SCALE = 0.08;
const MAX_SCALE = 2;
const ZOOM_SPEED = 0.002;

export function useCanvasTransform(viewportRef: React.RefObject<HTMLElement | null>): UseCanvasTransformReturn {
  const [transform, setTransformState] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [animating, setAnimating] = useState(false);
  const [panAnimating, setPanAnimating] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const recentlyPanned = useRef(false);
  const recentlyPannedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const savedTransform = useRef<Transform | null>(null);
  const spaceRef = useRef(false);
  // Keep a ref to the latest transform so onPointerDown doesn't need it in deps
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Momentum scrolling: track recent pointer positions for velocity calculation
  const velocitySamples = useRef<{ x: number; y: number; t: number }[]>([]);
  const momentumRaf = useRef<number | null>(null);

  // Track spacebar for drag mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !e.repeat &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceRef.current = false;
        setSpaceHeld(false);
        // End any active pan
        panStart.current = null;
        setIsPanning(false);
        // Brief cooldown to suppress clicks immediately after panning
        recentlyPanned.current = true;
        if (recentlyPannedTimer.current) clearTimeout(recentlyPannedTimer.current);
        recentlyPannedTimer.current = setTimeout(() => { recentlyPanned.current = false; }, 200);
        // Stop momentum when space released
        if (momentumRaf.current !== null) {
          cancelAnimationFrame(momentumRaf.current);
          momentumRaf.current = null;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      // Clean up any active momentum animation
      if (momentumRaf.current !== null) {
        cancelAnimationFrame(momentumRaf.current);
        momentumRaf.current = null;
      }
    };
  }, []);

  const setTransform = useCallback((t: Transform, animate = false) => {
    if (animate) {
      setAnimating(true);
      setTransformState(t);
      setTimeout(() => setAnimating(false), 280);
    } else {
      setTransformState(t);
    }
  }, []);

  // Gentle pan for card-to-card navigation (slower, smoother curve)
  const setPanTransform = useCallback((t: Transform) => {
    setPanAnimating(true);
    setTransformState(t);
    setTimeout(() => setPanAnimating(false), 350);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Cancel momentum on scroll/zoom
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }
    const el = viewportRef.current;
    if (!el) return;

    // Figma model: Cmd/Ctrl + scroll = zoom, plain scroll = pan
    if (e.ctrlKey || e.metaKey) {
      // Zoom — centered on cursor
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      setTransformState(prev => {
        const zoomFactor = 1 - e.deltaY * ZOOM_SPEED;
        let newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * zoomFactor));
        // Snap to 100% when close
        if (Math.abs(newScale - 1) < 0.03) newScale = 1;

        const canvasX = (cursorX - prev.tx) / prev.scale;
        const canvasY = (cursorY - prev.ty) / prev.scale;
        const newTx = cursorX - canvasX * newScale;
        const newTy = cursorY - canvasY * newScale;

        return { scale: newScale, tx: newTx, ty: newTy };
      });
    } else {
      // Pan — trackpad scroll moves the canvas
      setTransformState(prev => ({
        scale: prev.scale,
        tx: prev.tx - e.deltaX,
        ty: prev.ty - e.deltaY,
      }));
    }
  }, [viewportRef]);

  // Read transform from ref to avoid recreating this callback on every transform change
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    // Don't capture clicks on interactive elements (cards, buttons)
    const target = e.target as HTMLElement;
    const isOnCard = target.closest('[data-card]');
    const isOnButton = target.closest('button');
    if ((isOnCard || isOnButton) && !spaceRef.current) return;

    // Cancel any active momentum animation
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }

    // Reset velocity samples
    velocitySamples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

    const current = transformRef.current;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: current.tx,
      ty: current.ty,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  }, [viewportRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = panStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.sqrt(dx * dx + dy * dy) > 3) {
      setIsPanning(true);
      const newTx = start.tx + dx;
      const newTy = start.ty + dy;
      setTransformState(prev => {
        // Only update if values actually changed to avoid unnecessary re-renders
        if (prev.tx === newTx && prev.ty === newTy) return prev;
        return { scale: prev.scale, tx: newTx, ty: newTy };
      });

      // Track velocity samples (keep last N)
      const now = performance.now();
      velocitySamples.current.push({ x: e.clientX, y: e.clientY, t: now });
      if (velocitySamples.current.length > VELOCITY_SAMPLES) {
        velocitySamples.current.shift();
      }
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const wasPanning = panStart.current !== null;
    panStart.current = null;
    setIsPanning(false);

    // Calculate velocity from recent samples and start momentum if significant
    if (!wasPanning) return;
    const samples = velocitySamples.current;
    if (samples.length < 2) return;

    const oldest = samples[0];
    const newest = samples[samples.length - 1];
    const dt = newest.t - oldest.t;
    if (dt <= 0 || dt > 200) return; // Ignore if too old (pointer was stationary)

    // Velocity in px/ms, convert to px/frame (~16.67ms)
    const frameTime = 16.667;
    let vx = ((newest.x - oldest.x) / dt) * frameTime;
    let vy = ((newest.y - oldest.y) / dt) * frameTime;

    // Only apply momentum if velocity exceeds threshold
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < VELOCITY_THRESHOLD) return;

    // rAF momentum loop
    const tick = () => {
      vx *= FRICTION;
      vy *= FRICTION;

      if (Math.abs(vx) < VELOCITY_THRESHOLD && Math.abs(vy) < VELOCITY_THRESHOLD) {
        momentumRaf.current = null;
        return;
      }

      setTransformState(prev => ({
        scale: prev.scale,
        tx: prev.tx + vx,
        ty: prev.ty + vy,
      }));

      momentumRaf.current = requestAnimationFrame(tick);
    };

    momentumRaf.current = requestAnimationFrame(tick);
  }, []);

  const zoomToRect = useCallback((rect: { x: number; y: number; w: number; h: number }, padding = 60) => {
    const el = viewportRef.current;
    if (!el) return;

    const vpW = el.clientWidth;
    const vpH = el.clientHeight;

    const scale = Math.min(
      (vpW - padding * 2) / rect.w,
      (vpH - padding * 2) / rect.h,
    );
    const tx = vpW / 2 - (rect.x + rect.w / 2) * scale;
    const ty = vpH / 2 - (rect.y + rect.h / 2) * scale;

    setTransform({ scale, tx, ty }, true);
  }, [viewportRef, setTransform]);

  const fitAll = useCallback((totalW: number, totalH: number, viewportW: number, viewportH: number) => {
    const padding = 40;
    const scale = Math.min(
      (viewportW - padding * 2) / totalW,
      (viewportH - padding * 2) / totalH,
      1,
    );
    const tx = (viewportW - totalW * scale) / 2;
    const ty = (viewportH - totalH * scale) / 2;
    setTransformState({ scale, tx, ty });
    savedTransform.current = { scale, tx, ty };
  }, []);

  return {
    transform,
    animating,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomToRect,
    fitAll,
    setTransform,
    setPanTransform,
    isPanning,
    panAnimating,
    spaceHeld,
    recentlyPanned,
  };
}
