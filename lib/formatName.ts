/**
 * Format a display name as "FirstName L." (first name + last initial).
 * Falls back to display_name (username) if first/last name aren't available.
 */
export function formatDisplayName(
  opts: {
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
  }
): string {
  const { firstName, lastName, displayName } = opts;

  if (firstName && firstName.trim()) {
    const first = firstName.trim();
    if (lastName && lastName.trim()) {
      return `${first} ${lastName.trim().charAt(0).toUpperCase()}.`;
    }
    return first;
  }

  // A nameless profile (e.g. a phone signup that skipped identity) should read
  // as intentional, not a raw "User" placeholder (XPE-307).
  return displayName?.trim() || 'Someone';
}
