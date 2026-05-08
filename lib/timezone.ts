/**
 * Timezone utility — maps user location (city/region) to IANA timezone.
 * Falls back to the browser's local timezone if no match is found.
 */

// Common city/region → IANA timezone mappings (US-focused, extendable)
const CITY_TIMEZONE_MAP: Record<string, string> = {
  // Eastern
  'new york': 'America/New_York',
  'nyc': 'America/New_York',
  'manhattan': 'America/New_York',
  'brooklyn': 'America/New_York',
  'queens': 'America/New_York',
  'bronx': 'America/New_York',
  'boston': 'America/New_York',
  'philadelphia': 'America/New_York',
  'philly': 'America/New_York',
  'washington': 'America/New_York',
  'dc': 'America/New_York',
  'miami': 'America/New_York',
  'atlanta': 'America/New_York',
  'charlotte': 'America/New_York',
  'orlando': 'America/New_York',
  'tampa': 'America/New_York',
  'jacksonville': 'America/New_York',
  'pittsburgh': 'America/New_York',
  'baltimore': 'America/New_York',
  'raleigh': 'America/New_York',
  'richmond': 'America/New_York',
  'detroit': 'America/New_York',
  'cleveland': 'America/New_York',
  'columbus': 'America/New_York',
  'cincinnati': 'America/New_York',
  'indianapolis': 'America/New_York',
  'hartford': 'America/New_York',
  'providence': 'America/New_York',
  'newark': 'America/New_York',
  'jersey city': 'America/New_York',
  'hoboken': 'America/New_York',
  'stamford': 'America/New_York',
  'buffalo': 'America/New_York',
  'rochester': 'America/New_York',
  'syracuse': 'America/New_York',
  'albany': 'America/New_York',
  'savannah': 'America/New_York',
  'charleston': 'America/New_York',
  'nashville': 'America/New_York',
  'knoxville': 'America/New_York',
  'louisville': 'America/New_York',
  'lexington': 'America/New_York',
  'norfolk': 'America/New_York',
  'virginia beach': 'America/New_York',

  // Central
  'chicago': 'America/Chicago',
  'houston': 'America/Chicago',
  'dallas': 'America/Chicago',
  'san antonio': 'America/Chicago',
  'austin': 'America/Chicago',
  'fort worth': 'America/Chicago',
  'memphis': 'America/Chicago',
  'milwaukee': 'America/Chicago',
  'minneapolis': 'America/Chicago',
  'st. paul': 'America/Chicago',
  'saint paul': 'America/Chicago',
  'kansas city': 'America/Chicago',
  'st. louis': 'America/Chicago',
  'saint louis': 'America/Chicago',
  'new orleans': 'America/Chicago',
  'oklahoma city': 'America/Chicago',
  'omaha': 'America/Chicago',
  'des moines': 'America/Chicago',
  'madison': 'America/Chicago',
  'birmingham': 'America/Chicago',
  'little rock': 'America/Chicago',
  'baton rouge': 'America/Chicago',
  'tulsa': 'America/Chicago',
  'wichita': 'America/Chicago',

  // Mountain
  'denver': 'America/Denver',
  'colorado springs': 'America/Denver',
  'boulder': 'America/Denver',
  'salt lake city': 'America/Denver',
  'slc': 'America/Denver',
  'albuquerque': 'America/Denver',
  'el paso': 'America/Denver',
  'boise': 'America/Denver',
  'billings': 'America/Denver',
  'cheyenne': 'America/Denver',
  'tucson': 'America/Denver',

  // Arizona (no DST)
  'phoenix': 'America/Phoenix',
  'scottsdale': 'America/Phoenix',
  'tempe': 'America/Phoenix',
  'mesa': 'America/Phoenix',
  'chandler': 'America/Phoenix',
  'gilbert': 'America/Phoenix',
  'glendale az': 'America/Phoenix',
  'flagstaff': 'America/Phoenix',
  'sedona': 'America/Phoenix',

  // Pacific
  'los angeles': 'America/Los_Angeles',
  'la': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  'sf': 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles',
  'seattle': 'America/Los_Angeles',
  'portland': 'America/Los_Angeles',
  'sacramento': 'America/Los_Angeles',
  'oakland': 'America/Los_Angeles',
  'long beach': 'America/Los_Angeles',
  'fresno': 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  'vegas': 'America/Los_Angeles',
  'reno': 'America/Los_Angeles',
  'santa monica': 'America/Los_Angeles',
  'pasadena': 'America/Los_Angeles',
  'berkeley': 'America/Los_Angeles',
  'palo alto': 'America/Los_Angeles',
  'mountain view': 'America/Los_Angeles',
  'santa barbara': 'America/Los_Angeles',
  'irvine': 'America/Los_Angeles',
  'anaheim': 'America/Los_Angeles',
  'tacoma': 'America/Los_Angeles',
  'eugene': 'America/Los_Angeles',

  // Alaska
  'anchorage': 'America/Anchorage',
  'fairbanks': 'America/Anchorage',
  'juneau': 'America/Anchorage',

  // Hawaii
  'honolulu': 'Pacific/Honolulu',
  'hawaii': 'Pacific/Honolulu',
  'maui': 'Pacific/Honolulu',

  // International - common destinations
  'london': 'Europe/London',
  'paris': 'Europe/Paris',
  'berlin': 'Europe/Berlin',
  'amsterdam': 'Europe/Amsterdam',
  'rome': 'Europe/Rome',
  'madrid': 'Europe/Madrid',
  'barcelona': 'Europe/Madrid',
  'lisbon': 'Europe/Lisbon',
  'dublin': 'Europe/Dublin',
  'zurich': 'Europe/Zurich',
  'vienna': 'Europe/Vienna',
  'prague': 'Europe/Prague',
  'warsaw': 'Europe/Warsaw',
  'copenhagen': 'Europe/Copenhagen',
  'stockholm': 'Europe/Stockholm',
  'oslo': 'Europe/Oslo',
  'helsinki': 'Europe/Helsinki',
  'athens': 'Europe/Athens',
  'istanbul': 'Europe/Istanbul',
  'moscow': 'Europe/Moscow',
  'dubai': 'Asia/Dubai',
  'abu dhabi': 'Asia/Dubai',
  'mumbai': 'Asia/Kolkata',
  'delhi': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata',
  'kolkata': 'Asia/Kolkata',
  'bangkok': 'Asia/Bangkok',
  'singapore': 'Asia/Singapore',
  'hong kong': 'Asia/Hong_Kong',
  'tokyo': 'Asia/Tokyo',
  'osaka': 'Asia/Tokyo',
  'seoul': 'Asia/Seoul',
  'shanghai': 'Asia/Shanghai',
  'beijing': 'Asia/Shanghai',
  'sydney': 'Australia/Sydney',
  'melbourne': 'Australia/Melbourne',
  'brisbane': 'Australia/Brisbane',
  'perth': 'Australia/Perth',
  'auckland': 'Pacific/Auckland',
  'toronto': 'America/Toronto',
  'montreal': 'America/Toronto',
  'vancouver': 'America/Vancouver',
  'calgary': 'America/Edmonton',
  'edmonton': 'America/Edmonton',
  'mexico city': 'America/Mexico_City',
  'cancun': 'America/Cancun',
  'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'lima': 'America/Lima',
  'bogota': 'America/Bogota',
  'santiago': 'America/Santiago',
  'havana': 'America/Havana',
  'san juan': 'America/Puerto_Rico',
  'caribbean': 'America/Puerto_Rico',
};

/**
 * Normalize a location string for lookup.
 * Strips state abbreviations, zip codes, "USA", etc.
 */
function normalizeCity(location: string): string {
  return location
    .toLowerCase()
    .replace(/,?\s*(usa|us|united states|u\.s\.a?\.?)$/i, '')
    .replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?$/, '') // state + zip
    .replace(/,?\s*\d{5}(-\d{4})?$/, '') // just zip
    .replace(/,?\s*[A-Z]{2}$/i, '') // trailing state abbreviation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve an IANA timezone from a city/location string.
 * Returns browser timezone as fallback.
 */
export function getTimezoneForCity(location: string | null | undefined): string {
  if (!location) return getBrowserTimezone();

  const normalized = normalizeCity(location);

  // Direct match
  if (CITY_TIMEZONE_MAP[normalized]) {
    return CITY_TIMEZONE_MAP[normalized];
  }

  // Try matching the last segment (city name) after comma
  const parts = normalized.split(',').map(s => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    if (CITY_TIMEZONE_MAP[part]) {
      return CITY_TIMEZONE_MAP[part];
    }
  }

  // Try matching first segment
  if (parts.length > 1 && CITY_TIMEZONE_MAP[parts[0]]) {
    return CITY_TIMEZONE_MAP[parts[0]];
  }

  // Fuzzy: check if any key is contained in the location
  for (const [city, tz] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (normalized.includes(city)) {
      return tz;
    }
  }

  return getBrowserTimezone();
}

/**
 * Get the browser's local IANA timezone.
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York'; // safe fallback
  }
}

/**
 * Get a short timezone abbreviation (e.g. "ET", "PT", "CT") for display.
 */
export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Get the current time in a specific timezone as { hours, minutes }.
 */
export function getCurrentTimeInTimezone(timezone: string): { hours: number; minutes: number } {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).format(now);

  const [h, m] = formatted.split(':').map(Number);
  return { hours: h, minutes: h * 60 + m };
}

/**
 * Convert a time string (HH:mm) from one timezone to another on a given date.
 * Returns { time: "HH:mm", dayOffset: number } where dayOffset is -1, 0, or 1
 * indicating if the converted time falls on the previous or next day.
 */
export function convertTimeBetweenTimezones(
  time: string,
  date: Date,
  fromTimezone: string,
  toTimezone: string,
): { time: string; dayOffset: number } {
  if (fromTimezone === toTimezone) {
    return { time, dayOffset: 0 };
  }

  const [hours, minutes] = time.split(':').map(Number);
  
  // Create a date in the source timezone by constructing an ISO string
  // Use the date's year/month/day with the given time
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  
  // Format a date string and parse it in the source timezone
  // We'll use the trick of formatting in both timezones and comparing
  const refDate = new Date(`${year}-${month}-${day}T${h}:${m}:00`);
  
  // Get the offset difference by formatting the same instant in both zones
  const sourceFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: fromTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const targetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: toTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  
  // Create a UTC date that represents the given time in the source timezone
  // First, find what UTC time corresponds to "hours:minutes on date in fromTimezone"
  // by creating a temp date and adjusting
  const tempDate = new Date(Date.UTC(year, date.getMonth(), date.getDate(), hours, minutes, 0));
  
  // Get what time this UTC moment shows in the source timezone
  const sourceParts = sourceFormatter.formatToParts(tempDate);
  const sourceHour = parseInt(sourceParts.find(p => p.type === 'hour')?.value || '0');
  const sourceMin = parseInt(sourceParts.find(p => p.type === 'minute')?.value || '0');
  
  // Calculate the offset: we want the time to be hours:minutes in the source tz
  // but tempDate shows as sourceHour:sourceMin in source tz
  const diffMinutes = (hours * 60 + minutes) - (sourceHour * 60 + sourceMin);
  
  // Adjust the UTC date by the difference
  const adjustedUtc = new Date(tempDate.getTime() + diffMinutes * 60 * 1000);
  
  // Now format this adjusted UTC time in the target timezone
  const targetParts = targetFormatter.formatToParts(adjustedUtc);
  const targetHour = parseInt(targetParts.find(p => p.type === 'hour')?.value || '0');
  const targetMin = parseInt(targetParts.find(p => p.type === 'minute')?.value || '0');
  const targetDay = parseInt(targetParts.find(p => p.type === 'day')?.value || '0');
  const targetMonth = parseInt(targetParts.find(p => p.type === 'month')?.value || '0');
  
  // Calculate day offset
  const sourceDay = date.getDate();
  const sourceMonth = date.getMonth() + 1;
  let dayOffset = 0;
  if (targetMonth !== sourceMonth || targetDay !== sourceDay) {
    // Determine direction
    if (targetMonth > sourceMonth || (targetMonth === sourceMonth && targetDay > sourceDay)) {
      dayOffset = 1;
    } else {
      dayOffset = -1;
    }
  }
  
  const convertedTime = `${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}`;
  return { time: convertedTime, dayOffset };
}

/**
 * Determine which time slot a given HH:mm time falls into.
 */
export function getTimeSlotForTime(time: string): string {
  const [h] = time.split(':').map(Number);
  if (h >= 2 && h < 9) return 'early-morning';
  if (h >= 9 && h < 12) return 'late-morning';
  if (h >= 12 && h < 15) return 'early-afternoon';
  if (h >= 15 && h < 18) return 'late-afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'late-night';
}

/**
 * Get the midpoint time for a time slot (used when no specific start_time exists).
 */
export function getTimeSlotMidpoint(timeSlot: string): string {
  const midpoints: Record<string, string> = {
    'early-morning': '07:30',
    'late-morning': '10:30',
    'early-afternoon': '13:30',
    'late-afternoon': '16:30',
    'evening': '20:00',
    'late-night': '23:00',
  };
  return midpoints[timeSlot] || '12:00';
}

/**
 * Determine the user's effective timezone based on their settings.
 * Priority:
 * 1. Explicit timezone setting from profile (if set by user)
 * 2. If "away" with a trip_location, use that city's timezone
 * 3. If "home", use the home_address timezone
 * 4. Fallback to browser timezone
 */
export function getUserTimezone(
  locationStatus: 'home' | 'away',
  homeAddress: string | null | undefined,
  tripLocation: string | null | undefined,
  explicitTimezone?: string | null,
): string {
  // When traveling, trip location timezone always wins
  if (locationStatus === 'away' && tripLocation) {
    return getTimezoneForCity(tripLocation);
  }
  // If user has explicitly set a timezone, use it when home
  if (explicitTimezone) {
    return explicitTimezone;
  }
  return getTimezoneForCity(homeAddress);
}
