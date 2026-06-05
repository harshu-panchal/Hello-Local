/**
 * Normalize a raw phone input into a clean 10-digit Indian mobile number.
 *
 * Handles the common case where a user types/pastes the number with a country
 * code or trunk prefix (e.g. "+91 98765 43210", "919876543210", "09876543210").
 * Without this, stripping non-digits and slicing the first 10 chars would keep
 * the "91"/"0" prefix and produce a wrong number.
 */
export function normalizeMobile(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');

  // Only strip a prefix when there are clearly more than 10 digits, so we never
  // mangle a valid number the user is still typing.
  if (digits.length > 10) {
    if (digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}
