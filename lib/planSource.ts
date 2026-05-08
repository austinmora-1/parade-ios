/**
 * Plans imported from external calendars (Google, Apple/iCal, Nylas/Outlook)
 * vs. plans created natively in Parade.
 *
 * Known native sources: undefined/null, 'parade', 'hang-request', 'open-invite'.
 * Known calendar sources: 'google', 'gcal', 'ical', 'apple', 'nylas', 'outlook'.
 */
const CALENDAR_SOURCES = new Set([
  'google', 'gcal', 'ical', 'apple', 'nylas', 'outlook',
]);

export function isCalendarSourced(plan: { source?: string | null }): boolean {
  const src = plan?.source;
  if (!src) return false;
  return CALENDAR_SOURCES.has(String(src).toLowerCase());
}

export function getCalendarSourceLabel(source?: string | null): string {
  switch (String(source || '').toLowerCase()) {
    case 'google':
    case 'gcal':
      return 'Google Calendar';
    case 'ical':
    case 'apple':
      return 'Apple Calendar';
    case 'nylas':
    case 'outlook':
      return 'Outlook';
    default:
      return 'Calendar';
  }
}
