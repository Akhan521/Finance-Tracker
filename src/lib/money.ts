const MAX_CENTS = 99_999_999; // under $1,000,000, the database bound
const GROUPED = /^[1-9]\d{0,2}(,\d{3})+(\.\d{1,2})?$/; // needs a comma group; no leading zero
const PLAIN = /^\d+(\.\d{1,2})?$/;

/**
 * Parse money typed by a person into integer cents, or null if it is not a
 * clear positive amount under $1,000,000. Integer/string math only, so no
 * float error ('0.29' is 29). One leading '$' is allowed; '$ 5' (space after
 * the sign) is refused rather than guessed at.
 */
export function parseCents(input: string): number | null {
  let s = input.trim();
  if (s.startsWith('$')) s = s.slice(1);
  if (!GROUPED.test(s) && !PLAIN.test(s)) return null;
  const [whole, frac = ''] = s.split(',').join('').split('.');
  const dollars = Number(whole);
  if (!Number.isSafeInteger(dollars) || dollars >= 1_000_000) return null;
  const cents = dollars * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** '$1,980' for whole dollars, else '$1,980.50'. Locale independent; input is assumed to be a finite integer. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}${rem === 0 ? '' : `.${String(rem).padStart(2, '0')}`}`;
}
