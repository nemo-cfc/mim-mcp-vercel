/**
 * Theme classifier — maps Meta ad names to creative themes.
 *
 * Per marketing — the recurring buckets are:
 *   Profile Building (includes GMAT Waiver, Degree Selection, MBA Country)
 *   School Review (includes Oxford SAID / four hands)
 *   Case Study
 *   School Selection
 *   Anti CPA (Karwadenge / Joker / Hook patterns)
 *   Other
 *
 * Classification is name-based (case-insensitive substring matching).
 */

export type ThemeName =
  | 'Profile Building'
  | 'School Review'
  | 'Case Study'
  | 'School Selection'
  | 'Anti CPA'
  | 'Other';

export const ALL_THEMES: ThemeName[] = [
  'Profile Building',
  'School Review',
  'Case Study',
  'School Selection',
  'Anti CPA',
  'Other',
];

export function classifyTheme(adName: string | undefined | null): ThemeName {
  const name = (adName || '').toLowerCase().trim();
  if (!name || name === '(unknown ad)' || name.includes('unknown')) return 'Other';

  // Order matters — more specific patterns first.

  // ── School Review (school-specific, includes Oxford SAID / four hands) ──
  if (
    name.includes('school review') ||
    name.includes('school-review') ||
    name.includes('hec') ||
    name.includes('insead') ||
    name.includes('oxford') ||
    name.includes('four hands') ||
    name.includes('said')
  ) {
    if (name.includes('school selection') || name.includes('school-selection'))
      return 'School Selection';
    return 'School Review';
  }

  // ── School Selection ──
  if (name.includes('school selection') || name.includes('school-selection'))
    return 'School Selection';

  // ── Anti CPA (Karwadenge / Joker / Hook patterns) ──
  if (
    name.includes('joker') ||
    name.includes('karwadenge') ||
    name.includes('anti cpa') ||
    name.includes('anti-cpa') ||
    name.includes('anticpa') ||
    name.includes('hook')
  )
    return 'Anti CPA';

  // ── Case Study ──
  if (
    name.includes('case study') ||
    name.includes('case-study') ||
    name.includes('nyu') ||
    name.includes('cgpa') ||
    name.includes('gpa')
  )
    return 'Case Study';

  // ── Profile Building (includes GMAT Waiver, Degree Selection, MBA Country) ──
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
    name.includes('mba or mim') ||
    name.includes('country') ||
    name.includes("don'") /* "Don't Pick Your MBA Country..." */ ||
    name.includes('geography')
  )
    return 'Profile Building';

  return 'Other';
}
