/**
 * Push endpoint host allowlist (SSRF guard). Entries are exact hostnames or
 * `*.suffix` patterns; a wildcard matches subdomains of that suffix only.
 *
 * Browsers do not share one push service: Chrome (desktop and Android) uses
 * FCM, Firefox uses Mozilla autopush, Safari uses Apple, and Edge uses the
 * Windows Notification Service on varying `wns*-*.notify.windows.com` hostnames
 * — which is why the default configuration includes a wildcard entry.
 */
export function isAllowedPushEndpoint(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return allowedHosts.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pattern;
  });
}
