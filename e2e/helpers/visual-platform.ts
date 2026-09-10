// Capture provenance only; screenshots are never compared between environments.
export const visualPlatform =
  process.platform === 'linux' ? `linux-${process.arch}` : process.platform;
