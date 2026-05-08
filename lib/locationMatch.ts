/**
 * Client-side city matching utility for determining if two users
 * are co-located (same city or within ~25 miles).
 *
 * Mirrors the normalize_trip_city DB function for consistency.
 */

const CITY_ABBREVIATIONS: Record<string, string> = {
  NYC: 'new york city',
  SF: 'san francisco',
  LA: 'los angeles',
  DC: 'washington dc',
  NOLA: 'new orleans',
  ATX: 'austin',
  PHX: 'phoenix',
  CHI: 'chicago',
  BMORE: 'baltimore',
  PHILLY: 'philadelphia',
  VEGAS: 'las vegas',
  BARCA: 'barcelona',
  CDMX: 'mexico city',
  KL: 'kuala lumpur',
  HK: 'hong kong',
};

const AIRPORT_CODES: Record<string, string> = {
  ATL: 'atlanta', BOS: 'boston', DEN: 'denver', DFW: 'dallas',
  EWR: 'new york city', JFK: 'new york city', LAX: 'los angeles',
  LGA: 'new york city', MIA: 'miami', ORD: 'chicago', SEA: 'seattle',
  SFO: 'san francisco', PHX: 'phoenix', LHR: 'london', LGW: 'london',
  CDG: 'paris', FCO: 'rome', AMS: 'amsterdam', FRA: 'frankfurt',
  MUC: 'munich', MAD: 'madrid', BCN: 'barcelona', ATH: 'athens',
  IST: 'istanbul', BER: 'berlin', MXP: 'milan', NRT: 'tokyo',
  HND: 'tokyo', ICN: 'seoul', SIN: 'singapore', HKG: 'hong kong',
  BKK: 'bangkok', SYD: 'sydney', DXB: 'dubai', GRU: 'são paulo',
  MEX: 'mexico city', CUN: 'cancún', AUS: 'austin', BNA: 'nashville',
  MSY: 'new orleans', PDX: 'portland', SAN: 'san diego', TPA: 'tampa',
  IAH: 'houston', DCA: 'washington dc', IAD: 'washington dc',
  MCO: 'orlando', LAS: 'las vegas', MDW: 'chicago', PHL: 'philadelphia',
  CLT: 'charlotte', DTW: 'detroit', MSP: 'minneapolis',
  SLC: 'salt lake city', BWI: 'baltimore', FLL: 'fort lauderdale',
  HNL: 'honolulu', RDU: 'raleigh', STL: 'st. louis', SMF: 'sacramento',
  SJC: 'san jose', PIT: 'pittsburgh', SAT: 'san antonio', OAK: 'oakland',
  MCI: 'kansas city',
};

const NEIGHBORHOOD_MAP: Record<string, string> = {
  'new york': 'new york city',
  brooklyn: 'new york city', manhattan: 'new york city', queens: 'new york city',
  bronx: 'new york city', 'the bronx': 'new york city', 'staten island': 'new york city',
  harlem: 'new york city', soho: 'new york city', tribeca: 'new york city',
  williamsburg: 'new york city', bushwick: 'new york city', astoria: 'new york city',
  greenpoint: 'new york city', dumbo: 'new york city', chelsea: 'new york city',
  midtown: 'new york city', 'long island city': 'new york city',
  hollywood: 'los angeles', 'west hollywood': 'los angeles', weho: 'los angeles',
  'beverly hills': 'los angeles', 'santa monica': 'los angeles',
  'venice beach': 'los angeles', 'silver lake': 'los angeles',
  'culver city': 'los angeles', malibu: 'los angeles', pasadena: 'los angeles',
  burbank: 'los angeles', glendale: 'los angeles',
  soma: 'san francisco', 'mission district': 'san francisco',
  'the mission': 'san francisco', castro: 'san francisco',
  'noe valley': 'san francisco', 'hayes valley': 'san francisco',
  'pacific heights': 'san francisco', 'north beach': 'san francisco',
  dogpatch: 'san francisco', 'potrero hill': 'san francisco',
  'wicker park': 'chicago', 'logan square': 'chicago', 'lincoln park': 'chicago',
  lakeview: 'chicago', 'river north': 'chicago', 'the loop': 'chicago',
  loop: 'chicago', 'hyde park': 'chicago',
  shoreditch: 'london', camden: 'london', 'notting hill': 'london',
  brixton: 'london', hackney: 'london', islington: 'london',
  kensington: 'london', mayfair: 'london', 'covent garden': 'london',
  georgetown: 'washington dc', 'dupont circle': 'washington dc',
  'adams morgan': 'washington dc', 'capitol hill': 'washington dc',
  'south beach': 'miami', wynwood: 'miami', brickell: 'miami',
  'back bay': 'boston', 'beacon hill': 'boston', cambridge: 'boston',
  somerville: 'boston', fenway: 'boston', 'south boston': 'boston',
  southie: 'boston', brookline: 'boston',
  // Bay Area cities within 25 miles of SF
  'redwood city': 'san francisco', 'palo alto': 'san francisco',
  'mountain view': 'san francisco', sunnyvale: 'san francisco',
  'san mateo': 'san francisco', 'daly city': 'san francisco',
  'south san francisco': 'san francisco', oakland: 'san francisco',
  berkeley: 'san francisco', 'san jose': 'san francisco',
  fremont: 'san francisco', 'menlo park': 'san francisco',
  // DFW metroplex
  'fort worth': 'dallas', arlington: 'dallas', plano: 'dallas',
  irving: 'dallas', frisco: 'dallas', mckinney: 'dallas',
};

/**
 * ZIP code prefix → city mapping for common US zip codes.
 */
const ZIP_CODE_MAP: Record<string, string> = {
  '100': 'new york city', '101': 'new york city', '102': 'new york city',
  '103': 'new york city', '104': 'new york city', '110': 'new york city',
  '111': 'new york city', '112': 'new york city', '113': 'new york city',
  '114': 'new york city',
  '070': 'new york city', '071': 'new york city', // Newark/Jersey City (NYC metro)
  '200': 'washington dc', '201': 'washington dc', '202': 'washington dc',
  '203': 'washington dc', '204': 'washington dc', '205': 'washington dc',
  '220': 'washington dc', '221': 'washington dc', '222': 'washington dc',
  '900': 'los angeles', '901': 'los angeles', '902': 'los angeles',
  '906': 'los angeles', '910': 'los angeles', '911': 'los angeles',
  '912': 'los angeles', '913': 'los angeles', '914': 'los angeles',
  '941': 'san francisco', '940': 'san francisco',
  '606': 'chicago', '608': 'chicago',
  '331': 'miami', '330': 'miami',
  '021': 'boston', '022': 'boston',
  '750': 'dallas', '751': 'dallas', '752': 'dallas', '753': 'dallas',
  '760': 'dallas', '761': 'dallas',
  '770': 'houston', '773': 'houston', '774': 'houston',
  '782': 'austin', '787': 'austin',
  '850': 'phoenix', '852': 'phoenix', '853': 'phoenix',
  '981': 'seattle', '980': 'seattle',
};

/**
 * Attempts to resolve a zip code (possibly with prefix text) to a city.
 */
function resolveZipCode(input: string): string | null {
  // Pure zip code (5 digits, or 5+4 format)
  const pureZip = input.match(/^(\d{5})(-\d{4})?$/);
  if (pureZip) {
    const prefix3 = pureZip[1].slice(0, 3);
    return ZIP_CODE_MAP[prefix3] || null;
  }
  // "City ZIPCODE" or "STATE ZIPCODE" pattern (e.g., "DC 20006")
  const trailingZip = input.match(/(\d{5})(-\d{4})?$/);
  if (trailingZip) {
    const prefix3 = trailingZip[1].slice(0, 3);
    return ZIP_CODE_MAP[prefix3] || null;
  }
  return null;
}

/**
 * Normalizes a city/location string to a canonical city name.
 * Mirrors the DB normalize_trip_city function.
 */
export function normalizeCity(loc: string | null | undefined): string {
  if (!loc || loc.trim() === '') return '';

  const trimmed = loc.trim();
  const upper = trimmed.toUpperCase();

  // Check abbreviations
  if (CITY_ABBREVIATIONS[upper]) return CITY_ABBREVIATIONS[upper];

  // Check airport codes (3 uppercase letters)
  if (/^[A-Z]{3}$/.test(upper) && AIRPORT_CODES[upper]) {
    return AIRPORT_CODES[upper];
  }

  // Check zip code patterns before other processing
  const zipCity = resolveZipCode(trimmed);
  if (zipCity) return zipCity;

  const lower = trimmed.toLowerCase();

  // Check neighborhood mapping
  if (NEIGHBORHOOD_MAP[lower]) return NEIGHBORHOOD_MAP[lower];

  // Take first part before comma, strip hotel names
  let normalized = lower.split(',')[0].trim();
  normalized = normalized
    .replace(/\b(residence inn|courtyard|marriott|hilton|hyatt|sheraton|westin|holiday inn|hampton|doubletree|ritz|four seasons|intercontinental|radisson|airbnb|hotel|motel|inn|lodge|resort|suites?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*by\s+/i, '')
    .trim();

  // Strip well-known airport names that append to city names
  // e.g. "New York Kennedy" → "new york", "London Heathrow" → "london"
  const AIRPORT_SUFFIXES: Record<string, string> = {
    'kennedy': 'new york city', 'jfk': 'new york city', 'laguardia': 'new york city',
    'newark': 'new york city', 'heathrow': 'london', 'gatwick': 'london',
    'stansted': 'london', 'luton': 'london', "o'hare": 'chicago', 'ohare': 'chicago',
    'midway': 'chicago', 'dulles': 'washington dc', 'reagan': 'washington dc',
    'logan': 'boston', 'love field': 'dallas', 'hobby': 'houston',
    'intercontinental': 'houston', 'pearson': 'toronto', 'sky harbor': 'phoenix',
    'orly': 'paris', 'charles de gaulle': 'paris', 'schiphol': 'amsterdam',
    'fiumicino': 'rome', 'narita': 'tokyo', 'haneda': 'tokyo',
    'ben gurion': 'tel aviv', 'changi': 'singapore',
  };
  for (const [suffix, city] of Object.entries(AIRPORT_SUFFIXES)) {
    if (normalized.endsWith(` ${suffix}`)) {
      return city;
    }
  }

  return normalized;
}

/**
 * Determines if two normalized city names refer to the same metro area.
 */
export function citiesMatch(cityA: string, cityB: string): boolean {
  if (!cityA || !cityB) return false;
  if (cityA === cityB) return true;
  // Check substring containment (e.g., "new york" matches "new york city")
  if (cityA.includes(cityB) || cityB.includes(cityA)) return true;
  return false;
}

/**
 * Gets the effective city for a user on a given date.
 *
 * @param locationStatus - 'home' or 'away' for that date
 * @param tripLocation  - trip_location from availability (set when away)
 * @param homeAddress   - the user's home_address from profile
 * @returns normalized city string
 */
export function getEffectiveCity(
  locationStatus: string | null | undefined,
  tripLocation: string | null | undefined,
  homeAddress: string | null | undefined,
): string {
  if (locationStatus === 'away' && tripLocation) {
    return normalizeCity(tripLocation);
  }
  return normalizeCity(homeAddress);
}

/**
 * Determines if two users are co-located on a given date.
 */
export function areUsersCoLocated(
  userA: { locationStatus: string | null; tripLocation: string | null; homeAddress: string | null },
  userB: { locationStatus: string | null; tripLocation: string | null; homeAddress: string | null },
): boolean {
  const cityA = getEffectiveCity(userA.locationStatus, userA.tripLocation, userA.homeAddress);
  const cityB = getEffectiveCity(userB.locationStatus, userB.tripLocation, userB.homeAddress);
  return citiesMatch(cityA, cityB);
}
