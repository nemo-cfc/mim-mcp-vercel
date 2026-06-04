/**
 * Theme classifier — maps Meta ad names to creative themes.
 *
 * Per marketing — GMAT Waiver, Degree Selection, and Profile Building all
 * fall under the same creative bucket (Profile Building). The recurring
 * themes are:
 *   Profile Building / School Review / Case Study / School Selection /
 *   Hook / Country-Geography / Other.
 *
 * Classification is name-based (case-insensitive substring matching).
 */

export type ThemeName =
  | 'Profile Building'
  | 'School Review'
  | 'Case Study'
  | 'School Selection'
  | 'Hook / Pattern Interrupt'
  | 'Country / Geography'
  | 'Other';

export const ALL_THEMES: ThemeName[] = [
  'Profile Building',
  'School Review',
  'Case Study',
  'School Selection',
  'Hook / Pattern Interrupt',
  'Country / Geography',
  'Other',
];

export function classifyTheme(adName: string | undefined | null): ThemeName {
  const name = (adName || '').toLowerCase().trim();
  if (!name || name === '(unknown ad)' || name.includes('unknown')) return 'Other';

  // Order matters — more specific patterns first.

  // ── Profile Building bucket (includes GMAT Waiver + Degree Selection) ──
  if (
    name.includes('profile building') ||
    name.includes('profile-building') ||
    name.includes('interstellar') ||
    name.includes('gmat waiver') ||
    name.includes('why gmat alone') ||
    (name.includes('gmat') && name.includes('akshay')) ||
    name.includes('degree selection') ||
    name.includes('mim or mfin') ||
    name.includes('mim, or mfin') ||
    name.includes('mba, mim') ||
    name.includes('mba or mim')
  )
    return 'Profile Building';

  // ── School Review (HEC / INSEAD / Oxford / etc. school-specific) ──
  if (
    name.includes('school review') ||
    name.includes('school-review') ||
    name.includes('hec') ||
    name.includes('insead') ||
    name.includes('oxford') ||
    name.includes('school selection')
  ) {
    // 'Oxford SAID' is a hook / pattern test, not a school review.
    if (name.includes('oxford said') || name.includes('four hands'))
      return 'Hook / Pattern Interrupt';
    if (name.includes('school selection') || name.includes('school-selection'))
      return 'School Selection';
    return 'School Review';
  }

  // ── Case Study ──
  if (
    name.includes('case study') ||
    name.includes('case-study') ||
    name.includes('nyu') ||
    name.includes('cgpa') ||
    name.includes('gpa')
  )
    return 'Case Study';

  // ── Hook / Pattern Interrupt ──
  if (
    name.includes('joker') ||
    name.includes('karwadenge') ||
    name.includes('hook')
  )
    return 'Hook / Pattern Interrupt';

  // ── Country / Geography ──
  if (
    name.includes('country') ||
    name.includes("don'") /* "Don't Pick Your MBA Country..." */ ||
    name.includes('geography')
  )
    return 'Country / Geography';

  return 'Other';
}
