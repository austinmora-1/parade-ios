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

/**
 * Common holiday / observance names that calendars import as all-day events.
 * Secondary net for events that slipped through with a start time.
 */
const HOLIDAY_PATTERN = new RegExp(
  [
    'new year', 'mlk', 'martin luther king', "presidents'? day",
    'valentine', 'st\\.? patrick', 'easter', 'passover', 'ramadan', 'eid',
    "mother'?s day", "father'?s day", 'memorial day', 'flag day',
    'juneteenth', 'independence day', '4th of july', 'fourth of july',
    'labor day', 'columbus day', 'indigenous peoples', 'halloween',
    'veterans day', 'thanksgiving', 'hanukkah', 'christmas', 'kwanzaa',
    'groundhog', 'april fools', 'cinco de mayo', 'daylight saving',
    'tax day', 'election day', 'holiday',
  ].join('|'),
  'i',
);

/**
 * Imported all-day events (holidays, birthdays, observances) — not real
 * hangout plans, so they shouldn't surface as broadcast/anchor suggestions.
 *
 * Detection: calendar-sourced AND written without a start_time — the sync
 * edge functions only leave start_time NULL for all-day events (they also
 * set blocks_availability=false on them). A holiday-name match is the
 * fallback for older imports that did get a time stamped.
 */
export function isImportedAllDayEvent(plan: {
  source?: string | null;
  startTime?: string | null;
  title?: string | null;
}): boolean {
  if (!isCalendarSourced(plan)) return false;
  if (!plan.startTime) return true;
  return HOLIDAY_PATTERN.test(plan.title ?? '');
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
