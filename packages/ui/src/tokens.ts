export const colorTokens = {
  'brand-50': '#eff6ff',
  'brand-100': '#dbeafe',
  'brand-200': '#bfdbfe',
  'brand-300': '#93c5fd',
  'brand-400': '#60a5fa',
  'brand-500': '#2481ff',
  'brand-600': '#0866ff',
  'brand-700': '#0755d9',
  'brand-800': '#0b46ad',
  'brand-900': '#103d87',
  'brand-950': '#0a275c',
  'accent-500': '#18bde3',
  'neutral-0': '#ffffff',
  'neutral-50': '#fafbfc',
  'neutral-100': '#f4f6f8',
  'neutral-200': '#e8ebef',
  'neutral-300': '#d7dce2',
  'neutral-500': '#5f6b78',
  'neutral-600': '#59616d',
  'neutral-700': '#3c434d',
  'neutral-900': '#16191e',
  success: '#137333',
  warning: '#a94b00',
  danger: '#c62828',
} as const;

export const semanticColorTokens = {
  canvas: colorTokens['neutral-100'],
  'surface-subtle': colorTokens['neutral-50'],
  'surface-raised': colorTokens['neutral-0'],
  'surface-selected': colorTokens['brand-50'],
  'text-primary': colorTokens['neutral-900'],
  'text-secondary': colorTokens['neutral-600'],
  'text-inverse': colorTokens['neutral-0'],
  'action-primary': colorTokens['brand-600'],
  'action-accent': colorTokens['accent-500'],
  'border-default': colorTokens['neutral-200'],
  'border-strong': colorTokens['neutral-300'],
  'focus-ring': colorTokens['brand-600'],
  success: colorTokens.success,
  warning: colorTokens.warning,
  danger: colorTokens.danger,
} as const;

export const typographyTokens = {
  family: 'Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif',
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    display: '2rem',
  },
  lineHeights: { tight: '1.2', control: '1.35', body: '1.55', relaxed: '1.7' },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  letterSpacing: { tight: '-0.02em', normal: '0', caps: '0.08em' },
} as const;

export const spacingTokens = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export const radiusTokens = {
  none: '0',
  sm: '0.5rem',
  control: '0.75rem',
  card: '1.25rem',
  panel: '1.75rem',
  pill: '999px',
} as const;
export const elevationTokens = {
  card: '0 1px 2px rgb(16 24 40 / 0.04), 0 12px 32px rgb(16 24 40 / 0.06)',
  popover: '0 20px 48px rgb(16 24 40 / 0.14)',
  modal: '0 30px 80px rgb(16 24 40 / 0.2)',
  sticky: '0 1px 0 rgb(23 26 31 / 0.08)',
} as const;

export const durationTokens = {
  instant: 0,
  fast: 120,
  medium: 180,
  slow: 240,
  overlay: 320,
} as const;
export const easingTokens = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;
export const springTokens = {
  press: { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 },
  panel: { type: 'spring', stiffness: 420, damping: 40, mass: 0.5 },
  layout: { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 },
} as const;
export const transformTokens = {
  pressY: 1,
  hoverY: -2,
  overlayY: 12,
  disclosureRotate: 180,
} as const;
export const opacityTokens = { disabled: 0.52, scrim: 0.48, fadeStart: 0, fadeEnd: 1 } as const;
export const choreographyTokens = {
  staggerShort: 30,
  staggerMedium: 55,
  sequenceDelay: 80,
  tooltipDelay: 300,
  spinnerCycle: 900,
  skeletonCycle: 1400,
  toastDuration: 5000,
} as const;
export const densityTokens = {
  compact: { control: '2.5rem', row: '2.75rem', gap: spacingTokens[2] },
  comfortable: { control: '2.75rem', row: '3.25rem', gap: spacingTokens[3] },
  roomy: { control: '3rem', row: '3.75rem', gap: spacingTokens[4] },
} as const;
export const layerTokens = { base: 0, sticky: 20, popover: 40, modal: 60, toast: 80 } as const;
export const breakpointTokens = { mobile: 360, tablet: 768, desktop: 1280, wide: 1536 } as const;
export const focusTokens = {
  width: '3px',
  offset: '3px',
  color: semanticColorTokens['focus-ring'],
} as const;
export const chartTokens = {
  primary: colorTokens['brand-600'],
  accent: colorTokens['accent-500'],
  success: colorTokens.success,
  warning: colorTokens.warning,
  danger: colorTokens.danger,
  muted: colorTokens['neutral-300'],
} as const;

export const publicTokenFamilies = {
  colors: colorTokens,
  semanticColors: semanticColorTokens,
  typography: typographyTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  elevation: elevationTokens,
  duration: durationTokens,
  easing: easingTokens,
  springs: springTokens,
  transforms: transformTokens,
  opacity: opacityTokens,
  choreography: choreographyTokens,
  density: densityTokens,
  layers: layerTokens,
  breakpoints: breakpointTokens,
  focus: focusTokens,
  charts: chartTokens,
} as const;
