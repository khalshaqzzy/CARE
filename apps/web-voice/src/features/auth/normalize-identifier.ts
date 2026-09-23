/** Only workforce-style numeric No. Reg values are padded; Union/TM usernames stay intact. */
export function normalizeLoginIdentifier(value: string): string {
  const trimmed = value.trim();
  return /^\d{1,7}$/.test(trimmed) ? trimmed.padStart(8, '0') : trimmed;
}
