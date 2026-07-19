import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a name as "FirstName L." — falls back to display_name, then a
 * friendly generic ("Someone") for nameless profiles (XPE-307).
 */
export function formatDisplayName(opts: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const { firstName, lastName, displayName } = opts;
  if (firstName?.trim()) {
    const first = firstName.trim();
    if (lastName?.trim()) return `${first} ${lastName.trim().charAt(0).toUpperCase()}.`;
    return first;
  }
  return displayName?.trim() || 'Someone';
}

/** Return the user's initials (up to 2 chars) for avatar fallbacks. */
export function getInitials(opts: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const { firstName, lastName, displayName } = opts;
  if (firstName?.trim() && lastName?.trim()) {
    return `${firstName.trim()[0]}${lastName.trim()[0]}`.toUpperCase();
  }
  if (firstName?.trim()) return firstName.trim()[0].toUpperCase();
  if (displayName?.trim()) return displayName.trim().slice(0, 2).toUpperCase();
  return '?';
}
