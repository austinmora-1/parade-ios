/**
 * Phone-number helpers for the phone-first signup flow.
 *
 * Supabase native phone auth expects E.164 (`+15551234567`). We keep the
 * normalizer deliberately small — no full libphonenumber dependency — because
 * the auth path only needs "good enough" formatting before handing the number
 * to Supabase, which does its own validation. Used by:
 *   - app/(auth)/login.tsx  (phone entry → signInWithOtp)
 *   - app/(app)/onboarding.tsx (mirror auth phone → profiles.phone_number)
 */

/**
 * Normalize loose user input to E.164.
 *
 * Rules:
 *   - Strip everything except digits and a leading `+`.
 *   - If the user already typed `+…`, trust their country code.
 *   - Otherwise assume US/CA (+1) when given 10 digits, or a leading `1`
 *     followed by 10 digits.
 *
 * Returns null when the input can't be coerced into a plausible E.164 number
 * (caller should treat null as "invalid, don't submit").
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    // Trust an explicit country code; E.164 allows up to 15 digits.
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // No country code typed — assume North America (+1).
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return null;
}

/** True when the input can be normalized to a plausible E.164 number. */
export function isValidPhone(input: string): boolean {
  return toE164(input) !== null;
}

/**
 * Light display formatting for US/CA numbers: `+1 (555) 123-4567`.
 * Falls back to the raw E.164 string for other country codes.
 */
export function formatPhoneDisplay(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}
