import { durationTokens, easingTokens, springTokens, transformTokens } from './tokens.js';

export const motionTokens = {
  duration: durationTokens,
  easing: easingTokens,
  spring: springTokens,
  transform: transformTokens,
} as const;

export const reducedTransition = { duration: durationTokens.instant } as const;
