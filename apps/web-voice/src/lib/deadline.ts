/** "Sisa 3 jam" or "Terlambat 2 jam" for the deadline that applies to a Voice. */
export function remainingTime(dueAt: string | null | undefined, now = Date.now()) {
  if (!dueAt) return null;
  const ms = Date.parse(dueAt) - now;
  const late = ms < 0;
  const minutes = Math.round(Math.abs(ms) / 60000);
  const text =
    minutes < 60
      ? `${minutes} mnt`
      : minutes < 1440
        ? `${Math.round(minutes / 60)} jam`
        : `${Math.round(minutes / 1440)} hari`;
  return {
    late,
    urgent: late || ms < 2 * 3600000,
    text: late ? `Terlambat ${text}` : `Sisa ${text}`,
  };
}
