/** Marks a Voice migrated from an earlier platform with that platform's name. */
export function LegacySourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return (
    <span className="voice-legacy" title={`Dari platform ${source}`}>
      {source}
    </span>
  );
}
