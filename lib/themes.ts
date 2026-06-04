/**
 * Theme classifier — maps Meta ad names to creative themes.
 *
 * The themes here mirror the recurring creative buckets we use in analyses:
 *   GMAT Waiver / Profile Building / School Review / Case Study /
 *   Degree Selection / School Selection / Hook / Other.
 *
 * Classification is name-based (case-insensitive substring matching), so an
 * ad like "Gmat Waiver Akshay Daikat Hook - Copy 2" sorts into GMAT Waiver.
 */

export type ThemeName =
  | 'GMAT Waiver'
  | 'Profile Building'
  | 'School Review'
  | 'Case Study'
  | 'Degree Selection'
  | 'School Selection'
  | 'Hook / Pattern Interrupt'
  | 'Country / Geography'
  | 'Other';

export const ALL_THEMES: ThemeName[] = [
  'GMAT Waiver',
  'Profile Building',
  'School Review',
  'Case Study',
  'Degree Selection',
  'School Selection',
  'Hook / Pattern Interrupt',
  'Country / Geography',
  'Other',
];

export function classifyTheme(adName: string | undefined | null): ThemeName {
  const name = (adName || '').toLowerCase().trim();
  if (!name || name === '(unknown ad)' || name.includes('unknown')) return 'Other';

  // Order matters — more specific patterns first.
  if (name.includes('gmat waiver') || (name.includes('gmat') && name.includes('akshay')))
    return 'GMAT Waiver';
  if (name.includes('why gmat alone')) return 'GMAT Waiver';

  if (
    name.includes('profile building') ||
    name.includes('profile-building') ||
    name.includes('interstellar')
  )
    return 'Profile Building';

  if (
    name.includes('school review') ||
    name.includes('school-review') ||
    name.includes('hec') ||
    name.includes('insead') ||
    name.includes('oxford') ||
    name.includes('school selection')
  ) {
    // 'Oxford SAID' tends to be more of a hook / pattern test — split it out.
    if (name.includes('oxford said') || name.includes('four hands'))
      return 'Hook / Pattern Interrupt';
    if (name.includes('school selection') || name.includes('school-selection'))
      return 'School Selection';
    return 'School Review';
  }

  if (
    name.includes('case study') ||
    name.includes('case-study') ||
    name.includes('nyu') ||
    name.includes('cgpa') ||
    name.includes('gpa')
  )
    return 'Case Study';

  if (name.includes('degree selection') || name.includes('mim or mfin'))
    return 'Degree Selection';

  if (
    name.includes('joker') ||
    name.includes('karwadenge') ||
    name.includes('hook')
  )
    return 'Hook / Pattern Interrupt';

  if (
    name.includes('country') ||
    name.includes('don') /* "Don't Pick Your MBA Country..." */ ||
    name.includes('geography')
  )
    return 'Country / Geography';

  return 'Other';
}
