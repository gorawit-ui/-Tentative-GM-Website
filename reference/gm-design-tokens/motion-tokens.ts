// Generated from tokens.json. CSS/chart durations are ms; Motion transitions are seconds.
export const motionTokens = {
  "duration_ms": {
    "fast": 150,
    "base": 200,
    "enter": 280,
    "layout": 300,
    "chart": 800,
    "countup": 800,
    "highlight": 1500,
    "skeleton": 900
  },
  "ease_out": [
    0.22,
    1,
    0.36,
    1
  ],
  "ease_standard": [
    0.2,
    0,
    0,
    1
  ],
  "page_offset_px": 8,
  "card_offset_px": 8,
  "skeleton_iterations": 2,
  "drag_spring": {
    "stiffness": 380,
    "damping": 32,
    "mass": 0.8
  },
  "drag_momentum": false
} as const;

export function getMotionSettings(reducedMotion: boolean) {
  const seconds = (ms: number) => reducedMotion ? 0 : ms / 1000;
  const tween = (ms: number) => ({ type: 'tween' as const, duration: seconds(ms), ease: motionTokens.ease_out });
  return {
    page: {
      initial: reducedMotion ? false : { opacity: 0, y: motionTokens.page_offset_px },
      animate: { opacity: 1, y: 0 },
      exit: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -motionTokens.page_offset_px },
      transition: tween(motionTokens.duration_ms.enter)
    },
    newCard: {
      initial: reducedMotion ? false : { opacity: 0, y: motionTokens.card_offset_px },
      animate: { opacity: 1, y: 0 }, transition: tween(motionTokens.duration_ms.enter)
    },
    layout: { enabled: !reducedMotion, transition: tween(motionTokens.duration_ms.layout) },
    drag: { momentum: false, transition: reducedMotion ? tween(0) : { type: 'spring' as const, ...motionTokens.drag_spring } },
    status: { transition: tween(motionTokens.duration_ms.base), crossfadeText: false },
    check: { animatePath: !reducedMotion, transition: tween(motionTokens.duration_ms.enter) },
    chart: { isAnimationActive: !reducedMotion, animationDuration: reducedMotion ? 0 : motionTokens.duration_ms.chart, animationEasing: 'ease-out' as const },
    countup: { enabled: !reducedMotion, durationMs: reducedMotion ? 0 : motionTokens.duration_ms.countup },
    highlight: { enabled: !reducedMotion, durationMs: reducedMotion ? 0 : motionTokens.duration_ms.highlight },
    skeleton: { durationMs: reducedMotion ? 0 : motionTokens.duration_ms.skeleton, iterations: reducedMotion ? 0 : motionTokens.skeleton_iterations }
  };
}
