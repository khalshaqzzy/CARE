// Chromium text rasterization differs across both OS and CPU architecture.
// CI uses linux-x64; Docker on Apple Silicon defaults to linux-arm64.
export const visualPlatform =
  process.platform === 'linux' ? `linux-${process.arch}` : process.platform;
