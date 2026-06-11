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

/**
 * Flight + hotel reservation imports. Title-based: airline/lodging brand
 * names, travel keywords, and airport-code pairs ("JFK → BOS", "SFO-LAX").
 */
const FLIGHT_PATTERN = new RegExp(
  [
    '\\bflights?\\b', '✈', '\\bboarding\\b', '\\bdeparture\\b', '\\blayover\\b',
    '\\bdelta\\b', '\\bunited\\b', 'american airlines', '\\bjetblue\\b',
    '\\bsouthwest\\b', 'alaska air', '\\bspirit air', '\\bfrontier\\b',
    'british airways', '\\blufthansa\\b', 'air france', '\\bemirates\\b',
    '\\bqantas\\b', 'air canada', '\\bklm\\b', '\\bryanair\\b', '\\beasyjet\\b',
  ].join('|'),
  'i',
);
// Airport-code pair, e.g. "JFK → BOS", "SFO-LAX", "AUS to BNA" (uppercase only)
const AIRPORT_PAIR_PATTERN = /\b[A-Z]{3}\s*(?:→|->|–|—|-|to)\s*[A-Z]{3}\b/;

const HOTEL_PATTERN = new RegExp(
  [
    '\\bhotels?\\b', '\\bmotel\\b', '\\binn\\b', '\\bresorts?\\b', '\\bhostel\\b',
    '\\blodge\\b', '\\bsuites?\\b', '\\bairbnb\\b', '\\bvrbo\\b',
    'check[ -]?in', 'check[ -]?out',
    '\\bmarriott\\b', '\\bhilton\\b', '\\bhyatt\\b', '\\bsheraton\\b',
    '\\bwestin\\b', '\\britz\\b', 'four seasons', '\\bdoubletree\\b',
    '\\bcourtyard\\b', 'residence inn', '\\bhampton\\b', 'holiday inn',
    '\\bintercontinental\\b', '\\bradisson\\b', '\\bwyndham\\b',
    'best western', '\\bfairmont\\b',
  ].join('|'),
  'i',
);

/**
 * Flight or hotel reservation imported from a calendar — logistics, not a
 * social plan, so it shouldn't surface as a broadcast/anchor suggestion.
 */
export function isTravelReservationEvent(plan: {
  source?: string | null;
  title?: string | null;
}): boolean {
  if (!isCalendarSourced(plan)) return false;
  const title = plan.title ?? '';
  return (
    FLIGHT_PATTERN.test(title) ||
    AIRPORT_PAIR_PATTERN.test(title) ||
    HOTEL_PATTERN.test(title)
  );
}

/**
 * Anything imported that isn't a real social plan: all-day observances
 * (holidays, birthdays) and flight/hotel reservations. Use to filter
 * suggestion surfaces like the broadcast chooser.
 */
export function isNonSocialImport(plan: {
  source?: string | null;
  startTime?: string | null;
  title?: string | null;
}): boolean {
  return isImportedAllDayEvent(plan) || isTravelReservationEvent(plan);
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
