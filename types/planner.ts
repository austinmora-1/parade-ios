import type { LucideIcon } from 'lucide-react-native';

export type VibeType = 'social' | 'chill' | 'athletic' | 'productive' | 'custom';

export type ActivityType =
  // ============ SOCIAL — Going Out / Food & Drink ============
  | 'drinks'
  | 'happy-hour'
  | 'cocktail-bar'
  | 'wine-bar'
  | 'beer-garden'
  | 'brewery-tour'
  | 'whiskey-tasting'
  | 'wine-tasting'
  | 'coffee'
  | 'boba'
  | 'brunch'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'get-food'
  | 'food-truck'
  | 'food-tour'
  | 'street-food'
  | 'fine-dining'
  | 'bbq'
  | 'picnic'
  | 'potluck'
  | 'dinner-party'
  | 'cooking-together'
  | 'baking'
  | 'farmers-market'
  | 'ice-cream'
  | 'dessert'
  // ============ SOCIAL — Nightlife ============
  | 'nightclub'
  | 'dancing'
  | 'dive-bar'
  | 'rooftop-bar'
  | 'speakeasy'
  | 'karaoke'
  | 'trivia-night'
  | 'open-mic'
  | 'pool-billiards'
  | 'darts'
  | 'bowling'
  | 'arcade'
  | 'pinball'
  | 'casino'
  | 'late-night-eats'
  | 'after-party'
  // ============ SOCIAL — Arts & Culture ============
  | 'museum'
  | 'art-gallery'
  | 'gallery-opening'
  | 'sculpture-garden'
  | 'photography-exhibit'
  | 'film-festival'
  | 'book-reading'
  | 'poetry-slam'
  | 'lecture-talk'
  | 'workshop-class'
  | 'pottery-class'
  | 'painting-class'
  | 'cooking-class'
  | 'craft-night'
  // ============ SOCIAL — Live Events / Performance ============
  | 'concert'
  | 'live-music'
  | 'jazz-club'
  | 'orchestra'
  | 'opera'
  | 'musical'
  | 'theater'
  | 'ballet'
  | 'dance-performance'
  | 'stand-up-comedy'
  | 'improv-show'
  | 'magic-show'
  | 'drag-show'
  | 'burlesque'
  | 'sports-event'
  | 'esports-event'
  | 'wrestling'
  | 'mma-boxing'
  | 'horse-racing'
  | 'rodeo'
  | 'fashion-show'
  | 'comic-con'
  | 'convention'
  | 'festival'
  | 'street-fair'
  | 'parade'
  | 'fireworks'
  | 'theme-park'
  | 'amusement-park'
  | 'circus'
  | 'aquarium'
  | 'zoo'
  // ============ SOCIAL — Hangout / General ============
  | 'hanging-out'
  | 'one-on-one'
  | 'house-party'
  | 'birthday-party'
  | 'game-night'
  | 'board-games'
  | 'video-games'
  | 'movie-night-in'
  | 'watch-party'
  | 'sleepover'
  | 'facetime'
  | 'sightseeing'
  | 'people-watching'
  | 'beach'
  | 'pool-day'
  | 'lake-day'
  | 'park'
  | 'date-night'
  | 'double-date'
  | 'meet-the-parents'
  | 'reunion'
  | 'networking'
  | 'meetup'
  | 'volunteering'
  | 'religious-service'
  // ============ ATHLETIC — Gym & Studio ============
  | 'gym'
  | 'weight-training'
  | 'crossfit'
  | 'f45'
  | 'orangetheory'
  | 'barre'
  | 'pilates'
  | 'yoga'
  | 'hot-yoga'
  | 'spin-class'
  | 'cycling-class'
  | 'rowing-class'
  | 'hiit'
  | 'bootcamp'
  | 'kickboxing'
  | 'boxing'
  | 'mma-training'
  | 'martial-arts'
  | 'jiu-jitsu'
  | 'fencing'
  | 'dance-class'
  | 'zumba'
  | 'aerial-yoga'
  | 'workout-in'
  // ============ ATHLETIC — Outdoor / Endurance ============
  | 'running'
  | 'trail-running'
  | 'jogging'
  | 'walking'
  | 'jaywalking'
  | 'hiking'
  | 'backpacking'
  | 'camping'
  | 'rock-climbing'
  | 'bouldering'
  | 'mountaineering'
  | 'cycling'
  | 'mountain-biking'
  | 'road-biking'
  | 'gravel-riding'
  | 'skateboarding'
  | 'longboarding'
  | 'rollerblading'
  | 'parkour'
  // ============ ATHLETIC — Water Sports ============
  | 'swimming'
  | 'lap-swim'
  | 'open-water-swim'
  | 'surfing'
  | 'paddleboarding'
  | 'kayaking'
  | 'canoeing'
  | 'rowing'
  | 'sailing'
  | 'windsurfing'
  | 'kitesurfing'
  | 'wakeboarding'
  | 'water-skiing'
  | 'jet-skiing'
  | 'scuba-diving'
  | 'snorkeling'
  | 'fishing'
  // ============ ATHLETIC — Snow Sports ============
  | 'skiing'
  | 'snowboarding'
  | 'cross-country-skiing'
  | 'ice-skating'
  | 'hockey'
  | 'snowshoeing'
  | 'sledding'
  // ============ ATHLETIC — Team & Racquet Sports ============
  | 'pickleball'
  | 'tennis'
  | 'squash'
  | 'racquetball'
  | 'badminton'
  | 'table-tennis'
  | 'basketball'
  | 'soccer'
  | 'football'
  | 'baseball'
  | 'softball'
  | 'volleyball'
  | 'beach-volleyball'
  | 'ultimate-frisbee'
  | 'lacrosse'
  | 'rugby'
  | 'cricket'
  | 'kickball'
  | 'dodgeball'
  // ============ ATHLETIC — Precision / Other ============
  | 'golf'
  | 'mini-golf'
  | 'driving-range'
  | 'disc-golf'
  | 'archery'
  | 'shooting-range'
  | 'horseback-riding'
  | 'equestrian'
  | 'larping'
  // ============ CHILL ============
  | 'listening-music'
  | 'watching-movie'
  | 'watching-tv'
  | 'movies'
  | 'reading'
  | 'shopping'
  | 'window-shopping'
  | 'thrifting'
  | 'spa-day'
  | 'massage'
  | 'meditation'
  | 'journaling'
  | 'puzzles'
  | 'gardening'
  | 'birdwatching'
  | 'stargazing'
  | 'scenic-drive'
  | 'cafe-hopping'
  | 'tea-house'
  | 'bookstore'
  | 'library'
  | 'black-hole'
  | 'get-off-lawn'
  // ============ PRODUCTIVE ============
  | 'work'
  | 'co-working'
  | 'study-session'
  | 'errands'
  | 'grocery-shopping'
  | 'meal-prep'
  | 'cleaning'
  | 'laundry'
  | 'home-improvement'
  | 'feeding-pets'
  | 'walking-dog'
  | 'hydrating'
  | 'doctor-appointment'
  | 'therapy'
  | 'haircut'
  | 'amateur-djing'
  | 'flight'
  | 'hotel'
  // Custom
  | 'custom';

/** Activities that represent travel logistics, not social hangouts */
export const TRAVEL_ACTIVITIES: ActivityType[] = ['flight', 'hotel'];

export type TimeSlot = 'early-morning' | 'late-morning' | 'early-afternoon' | 'late-afternoon' | 'evening' | 'late-night';

export type LocationStatus = 'home' | 'away';

export interface Location {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

export type ParticipantRole = 'participant' | 'subscriber';
export type PlanStatus = 'confirmed' | 'tentative' | 'cancelled' | 'proposed';
export type FeedVisibility = 'private' | 'friends' | string; // string for 'pod:<id>'

export interface Friend {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  friendUserId?: string;
  status: 'connected' | 'pending' | 'invited';
  isIncoming?: boolean;
  role?: ParticipantRole;
  isPodMember?: boolean;
  rsvpStatus?: string; // 'accepted' | 'declined' | 'maybe' | 'invited'
  respondedAt?: Date;
}

export interface PendingChange {
  changeRequestId: string;
  proposedDate?: Date;
  proposedTimeSlot?: TimeSlot;
  proposedDuration?: number;
  proposedBy: string;
}

export interface PlanProposalOption {
  id: string;
  planId: string;
  date: Date;
  timeSlot: TimeSlot;
  startTime?: string;
  sortOrder: number;
}

export interface PlanProposalVote {
  id: string;
  optionId: string;
  userId: string;
  rank: number;
}

export type ProposalStatus = 'voting' | 'decided' | null;

export interface Plan {
  id: string;
  userId?: string; // owner of the plan
  title: string;
  activity: ActivityType | string; // Allow custom activity IDs
  location?: Location;
  date: Date;
  endDate?: Date; // For multi-day plans
  timeSlot: TimeSlot;
  duration: number;
  startTime?: string; // HH:mm format e.g. "14:30"
  endTime?: string;   // HH:mm format e.g. "16:00"
  participants: Friend[];
  notes?: string;
  status: PlanStatus;
  feedVisibility?: FeedVisibility;
  blocksAvailability?: boolean;
  createdAt: Date;
  myRole?: ParticipantRole;
  myRsvpStatus?: string;
  recurringPlanId?: string;
  proposedBy?: string;
  pendingChange?: PendingChange;
  sourceTimezone?: string;
  source?: string;
  proposalStatus?: ProposalStatus;
  proposalOptions?: PlanProposalOption[];
  proposalVotes?: PlanProposalVote[];
}

export interface Vibe {
  type: VibeType;
  customText?: string;
  customTags?: string[];
  gifUrl?: string;
}

export interface DayAvailability {
  date: Date;
  slots: {
    [key in TimeSlot]: boolean;
  };
  locationStatus: LocationStatus;
  customLocation?: Location;
  tripLocation?: string;
  vibe?: VibeType | null;
  slotLocations?: {
    [key in TimeSlot]?: string | null;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string;
  defaultLocation?: Location;
  currentVibe?: Vibe;
  friends: Friend[];
}

export const TIME_SLOT_LABELS: Record<TimeSlot, { label: string; time: string }> = {
  'early-morning': { label: 'Early Morning', time: '7-9am' },
  'late-morning': { label: 'Late Morning', time: '9am-12pm' },
  'early-afternoon': { label: 'Early Afternoon', time: '12-3pm' },
  'late-afternoon': { label: 'Late Afternoon', time: '3-6pm' },
  'evening': { label: 'Evening', time: '6-10pm' },
  'late-night': { label: 'Late Night', time: '10pm-2am' },
};

export interface ActivityConfig {
  label: string;
  icon: string;
  lucideIcon?: LucideIcon;
  color: string;
  vibeType: VibeType;
}

export interface CustomActivity {
  id: string;
  label: string;
  icon: string;
  vibeType: VibeType;
}

import {
  Wine, Sparkles, Landmark, Compass, Utensils, Music, User, Umbrella, Smile, Eye,
  Megaphone, Tent, Gamepad2, Video, Trophy, Sword, Drama, PartyPopper, Theater, Zap,
  Headphones, Clapperboard, TreePine, Tv, Film, BookOpen, Waves as WavesIcon, Footprints,
  Dumbbell, PersonStanding, Home, Mountain, PawPrint, GlassWater, Dog, Heart, Disc3,
  Plane, ShoppingBag, Users, Coffee, Activity, Target, Pencil, Beer, Martini, Cookie,
  Croissant, ChefHat, Cake, Salad, IceCream, Sandwich, Soup, Apple, Flame, Cigarette,
  Mic, Mic2, Dices, Crown, Volleyball, Bike, Snowflake, Anchor, Ship, Sailboat, Fish,
  Palette, Camera, Telescope, Star, Sun, Moon, Building2, Church, GraduationCap,
  Briefcase, Stethoscope, Scissors, Hammer, Sprout, ShowerHead, Bath, Brain, Pen,
  Puzzle, Bird, Car, Hotel, MapPin, Calendar, Clock, Smartphone, Globe, Award,
  Glasses, Shirt, Watch, Gift, Backpack, Shovel, Wrench, Recycle,
} from 'lucide-react-native';

export const VIBE_CONFIG: Record<VibeType, { label: string; icon: LucideIcon; color: string; description: string }> = {
  social: { label: 'Social', icon: Users, color: 'vibe-social', description: 'Hanging out with friends' },
  chill: { label: 'Chill', icon: Coffee, color: 'vibe-chill', description: 'Relaxing and unwinding' },
  athletic: { label: 'Athletic', icon: PersonStanding, color: 'vibe-athletic', description: 'Getting active' },
  productive: { label: 'Productive', icon: Target, color: 'vibe-productive', description: 'Getting things done' },
  custom: { label: 'Custom', icon: Pencil, color: 'primary', description: 'Your own vibe' },
};

export const ACTIVITY_CONFIG: Record<ActivityType, ActivityConfig> = {
  // ============ SOCIAL — Food & Drink ============
  'drinks': { label: 'Getting Drinks', icon: '🍹', lucideIcon: Wine, color: 'activity-drinks', vibeType: 'social' },
  'happy-hour': { label: 'Happy Hour', icon: '🍻', lucideIcon: Beer, color: 'activity-drinks', vibeType: 'social' },
  'cocktail-bar': { label: 'Cocktail Bar', icon: '🍸', lucideIcon: Martini, color: 'activity-drinks', vibeType: 'social' },
  'wine-bar': { label: 'Wine Bar', icon: '🍷', lucideIcon: Wine, color: 'activity-drinks', vibeType: 'social' },
  'beer-garden': { label: 'Beer Garden', icon: '🍺', lucideIcon: Beer, color: 'activity-drinks', vibeType: 'social' },
  'brewery-tour': { label: 'Brewery Tour', icon: '🏭', lucideIcon: Beer, color: 'activity-drinks', vibeType: 'social' },
  'whiskey-tasting': { label: 'Whiskey Tasting', icon: '🥃', lucideIcon: GlassWater, color: 'activity-drinks', vibeType: 'social' },
  'wine-tasting': { label: 'Wine Tasting', icon: '🍇', lucideIcon: Wine, color: 'activity-drinks', vibeType: 'social' },
  'coffee': { label: 'Coffee', icon: '☕', lucideIcon: Coffee, color: 'activity-food', vibeType: 'social' },
  'boba': { label: 'Boba / Bubble Tea', icon: '🧋', lucideIcon: Coffee, color: 'activity-food', vibeType: 'social' },
  'brunch': { label: 'Brunch', icon: '🥞', lucideIcon: Croissant, color: 'activity-food', vibeType: 'social' },
  'breakfast': { label: 'Breakfast', icon: '🍳', lucideIcon: Croissant, color: 'activity-food', vibeType: 'social' },
  'lunch': { label: 'Lunch', icon: '🥗', lucideIcon: Salad, color: 'activity-food', vibeType: 'social' },
  'dinner': { label: 'Dinner', icon: '🍝', lucideIcon: Utensils, color: 'activity-food', vibeType: 'social' },
  'get-food': { label: 'Get Food', icon: '🍽️', lucideIcon: Utensils, color: 'activity-food', vibeType: 'social' },
  'food-truck': { label: 'Food Truck', icon: '🚚', lucideIcon: Sandwich, color: 'activity-food', vibeType: 'social' },
  'food-tour': { label: 'Food Tour', icon: '🥘', lucideIcon: Soup, color: 'activity-food', vibeType: 'social' },
  'street-food': { label: 'Street Food', icon: '🌮', lucideIcon: Sandwich, color: 'activity-food', vibeType: 'social' },
  'fine-dining': { label: 'Fine Dining', icon: '🍾', lucideIcon: Utensils, color: 'activity-food', vibeType: 'social' },
  'bbq': { label: 'BBQ / Cookout', icon: '🍖', lucideIcon: Flame, color: 'activity-food', vibeType: 'social' },
  'picnic': { label: 'Picnic', icon: '🧺', lucideIcon: Apple, color: 'activity-food', vibeType: 'social' },
  'potluck': { label: 'Potluck', icon: '🥘', lucideIcon: Soup, color: 'activity-food', vibeType: 'social' },
  'dinner-party': { label: 'Dinner Party', icon: '🍽️', lucideIcon: Utensils, color: 'activity-food', vibeType: 'social' },
  'cooking-together': { label: 'Cooking Together', icon: '👨‍🍳', lucideIcon: ChefHat, color: 'activity-food', vibeType: 'social' },
  'baking': { label: 'Baking', icon: '🧁', lucideIcon: Cake, color: 'activity-food', vibeType: 'social' },
  'farmers-market': { label: "Farmers' Market", icon: '🥬', lucideIcon: Apple, color: 'activity-food', vibeType: 'social' },
  'ice-cream': { label: 'Ice Cream', icon: '🍦', lucideIcon: IceCream, color: 'activity-food', vibeType: 'social' },
  'dessert': { label: 'Dessert', icon: '🍰', lucideIcon: Cake, color: 'activity-food', vibeType: 'social' },

  // ============ SOCIAL — Nightlife ============
  'nightclub': { label: 'Nightclub', icon: '🪩', lucideIcon: Disc3, color: 'activity-events', vibeType: 'social' },
  'dancing': { label: 'Dancing', icon: '💃', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'dive-bar': { label: 'Dive Bar', icon: '🍺', lucideIcon: Beer, color: 'activity-drinks', vibeType: 'social' },
  'rooftop-bar': { label: 'Rooftop Bar', icon: '🌆', lucideIcon: Building2, color: 'activity-drinks', vibeType: 'social' },
  'speakeasy': { label: 'Speakeasy', icon: '🥂', lucideIcon: Martini, color: 'activity-drinks', vibeType: 'social' },
  'karaoke': { label: 'Karaoke', icon: '🎤', lucideIcon: Mic, color: 'activity-events', vibeType: 'social' },
  'trivia-night': { label: 'Trivia Night', icon: '🧠', lucideIcon: Brain, color: 'activity-events', vibeType: 'social' },
  'open-mic': { label: 'Open Mic', icon: '🎙️', lucideIcon: Mic2, color: 'activity-events', vibeType: 'social' },
  'pool-billiards': { label: 'Pool / Billiards', icon: '🎱', lucideIcon: Target, color: 'activity-events', vibeType: 'social' },
  'darts': { label: 'Darts', icon: '🎯', lucideIcon: Target, color: 'activity-events', vibeType: 'social' },
  'bowling': { label: 'Bowling', icon: '🎳', lucideIcon: Target, color: 'activity-events', vibeType: 'social' },
  'arcade': { label: 'Arcade', icon: '🕹️', lucideIcon: Gamepad2, color: 'activity-events', vibeType: 'social' },
  'pinball': { label: 'Pinball', icon: '🎰', lucideIcon: Gamepad2, color: 'activity-events', vibeType: 'social' },
  'casino': { label: 'Casino', icon: '🎰', lucideIcon: Dices, color: 'activity-events', vibeType: 'social' },
  'late-night-eats': { label: 'Late-night Eats', icon: '🌙', lucideIcon: Moon, color: 'activity-food', vibeType: 'social' },
  'after-party': { label: 'After-party', icon: '🎉', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },

  // ============ SOCIAL — Arts & Culture ============
  'museum': { label: 'Museum', icon: '🏛️', lucideIcon: Landmark, color: 'activity-events', vibeType: 'social' },
  'art-gallery': { label: 'Art Gallery', icon: '🖼️', lucideIcon: Palette, color: 'activity-events', vibeType: 'social' },
  'gallery-opening': { label: 'Gallery Opening', icon: '🎨', lucideIcon: Palette, color: 'activity-events', vibeType: 'social' },
  'sculpture-garden': { label: 'Sculpture Garden', icon: '🗿', lucideIcon: Landmark, color: 'activity-events', vibeType: 'social' },
  'photography-exhibit': { label: 'Photography Exhibit', icon: '📷', lucideIcon: Camera, color: 'activity-events', vibeType: 'social' },
  'film-festival': { label: 'Film Festival', icon: '🎞️', lucideIcon: Film, color: 'activity-events', vibeType: 'social' },
  'book-reading': { label: 'Book Reading', icon: '📖', lucideIcon: BookOpen, color: 'activity-events', vibeType: 'social' },
  'poetry-slam': { label: 'Poetry Slam', icon: '✍️', lucideIcon: Pen, color: 'activity-events', vibeType: 'social' },
  'lecture-talk': { label: 'Lecture / Talk', icon: '🎓', lucideIcon: GraduationCap, color: 'activity-events', vibeType: 'social' },
  'workshop-class': { label: 'Workshop / Class', icon: '🛠️', lucideIcon: Hammer, color: 'activity-events', vibeType: 'social' },
  'pottery-class': { label: 'Pottery Class', icon: '🏺', lucideIcon: Palette, color: 'activity-events', vibeType: 'social' },
  'painting-class': { label: 'Painting Class', icon: '🎨', lucideIcon: Palette, color: 'activity-events', vibeType: 'social' },
  'cooking-class': { label: 'Cooking Class', icon: '🍳', lucideIcon: ChefHat, color: 'activity-events', vibeType: 'social' },
  'craft-night': { label: 'Craft Night', icon: '🧶', lucideIcon: Scissors, color: 'activity-events', vibeType: 'social' },

  // ============ SOCIAL — Live Events / Performance ============
  'concert': { label: 'Concert', icon: '🎵', lucideIcon: Music, color: 'activity-events', vibeType: 'social' },
  'live-music': { label: 'Live Music', icon: '🎸', lucideIcon: Music, color: 'activity-events', vibeType: 'social' },
  'jazz-club': { label: 'Jazz Club', icon: '🎷', lucideIcon: Music, color: 'activity-events', vibeType: 'social' },
  'orchestra': { label: 'Orchestra / Symphony', icon: '🎻', lucideIcon: Music, color: 'activity-events', vibeType: 'social' },
  'opera': { label: 'Opera', icon: '🎭', lucideIcon: Theater, color: 'activity-events', vibeType: 'social' },
  'musical': { label: 'Musical', icon: '🎼', lucideIcon: Theater, color: 'activity-events', vibeType: 'social' },
  'theater': { label: 'Theater / Play', icon: '🎭', lucideIcon: Theater, color: 'activity-events', vibeType: 'social' },
  'ballet': { label: 'Ballet', icon: '🩰', lucideIcon: Drama, color: 'activity-events', vibeType: 'social' },
  'dance-performance': { label: 'Dance Performance', icon: '💃', lucideIcon: Drama, color: 'activity-events', vibeType: 'social' },
  'stand-up-comedy': { label: 'Stand-up Comedy', icon: '🎤', lucideIcon: Mic, color: 'activity-events', vibeType: 'social' },
  'improv-show': { label: 'Improv Show', icon: '🎭', lucideIcon: Drama, color: 'activity-events', vibeType: 'social' },
  'magic-show': { label: 'Magic Show', icon: '🎩', lucideIcon: Sparkles, color: 'activity-events', vibeType: 'social' },
  'drag-show': { label: 'Drag Show', icon: '👑', lucideIcon: Crown, color: 'activity-events', vibeType: 'social' },
  'burlesque': { label: 'Burlesque', icon: '🌹', lucideIcon: Drama, color: 'activity-events', vibeType: 'social' },
  'sports-event': { label: 'Sports Event', icon: '🏟️', lucideIcon: Trophy, color: 'activity-events', vibeType: 'social' },
  'esports-event': { label: 'Esports Event', icon: '🎮', lucideIcon: Gamepad2, color: 'activity-events', vibeType: 'social' },
  'wrestling': { label: 'Wrestling', icon: '🤼', lucideIcon: Trophy, color: 'activity-events', vibeType: 'social' },
  'mma-boxing': { label: 'MMA / Boxing Match', icon: '🥊', lucideIcon: Trophy, color: 'activity-events', vibeType: 'social' },
  'horse-racing': { label: 'Horse Racing', icon: '🐎', lucideIcon: Trophy, color: 'activity-events', vibeType: 'social' },
  'rodeo': { label: 'Rodeo', icon: '🤠', lucideIcon: Trophy, color: 'activity-events', vibeType: 'social' },
  'fashion-show': { label: 'Fashion Show', icon: '👗', lucideIcon: Shirt, color: 'activity-events', vibeType: 'social' },
  'comic-con': { label: 'Comic-Con', icon: '🦸', lucideIcon: Zap, color: 'activity-events', vibeType: 'social' },
  'convention': { label: 'Convention', icon: '🏷️', lucideIcon: Award, color: 'activity-events', vibeType: 'social' },
  'festival': { label: 'Festival', icon: '🎪', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'street-fair': { label: 'Street Fair', icon: '🎡', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'parade': { label: 'Parade', icon: '🎺', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'fireworks': { label: 'Fireworks', icon: '🎆', lucideIcon: Sparkles, color: 'activity-events', vibeType: 'social' },
  'theme-park': { label: 'Theme Park', icon: '🎢', lucideIcon: Zap, color: 'activity-events', vibeType: 'social' },
  'amusement-park': { label: 'Amusement Park', icon: '🎠', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'circus': { label: 'Circus', icon: '🎪', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'aquarium': { label: 'Aquarium', icon: '🐠', lucideIcon: Fish, color: 'activity-events', vibeType: 'social' },
  'zoo': { label: 'Zoo', icon: '🦁', lucideIcon: PawPrint, color: 'activity-events', vibeType: 'social' },

  // ============ SOCIAL — Hangout / General ============
  'hanging-out': { label: 'Hanging Out', icon: '🤙', lucideIcon: Smile, color: 'activity-events', vibeType: 'social' },
  'one-on-one': { label: '1:1 Time', icon: '👥', lucideIcon: User, color: 'activity-events', vibeType: 'social' },
  'house-party': { label: 'House Party', icon: '🏠', lucideIcon: PartyPopper, color: 'activity-events', vibeType: 'social' },
  'birthday-party': { label: 'Birthday Party', icon: '🎂', lucideIcon: Cake, color: 'activity-events', vibeType: 'social' },
  'game-night': { label: 'Game Night', icon: '🎲', lucideIcon: Dices, color: 'activity-events', vibeType: 'social' },
  'board-games': { label: 'Board Games', icon: '♟️', lucideIcon: Dices, color: 'activity-events', vibeType: 'social' },
  'video-games': { label: 'Video Games', icon: '🎮', lucideIcon: Gamepad2, color: 'activity-events', vibeType: 'social' },
  'movie-night-in': { label: 'Movie Night In', icon: '🍿', lucideIcon: Clapperboard, color: 'activity-events', vibeType: 'social' },
  'watch-party': { label: 'Watch Party', icon: '📺', lucideIcon: Tv, color: 'activity-events', vibeType: 'social' },
  'sleepover': { label: 'Sleepover', icon: '🛏️', lucideIcon: Home, color: 'activity-events', vibeType: 'social' },
  'facetime': { label: 'Facetime', icon: '📱', lucideIcon: Video, color: 'activity-events', vibeType: 'social' },
  'sightseeing': { label: 'Sightseeing', icon: '🧭', lucideIcon: Compass, color: 'activity-events', vibeType: 'social' },
  'people-watching': { label: 'People Watching', icon: '👀', lucideIcon: Eye, color: 'activity-events', vibeType: 'social' },
  'beach': { label: 'Beach Day', icon: '🏖️', lucideIcon: Umbrella, color: 'activity-events', vibeType: 'social' },
  'pool-day': { label: 'Pool Day', icon: '🏊', lucideIcon: WavesIcon, color: 'activity-events', vibeType: 'social' },
  'lake-day': { label: 'Lake Day', icon: '🛶', lucideIcon: WavesIcon, color: 'activity-events', vibeType: 'social' },
  'park': { label: 'Park', icon: '🌳', lucideIcon: TreePine, color: 'activity-events', vibeType: 'social' },
  'date-night': { label: 'Date Night', icon: '💕', lucideIcon: Heart, color: 'activity-events', vibeType: 'social' },
  'double-date': { label: 'Double Date', icon: '💑', lucideIcon: Heart, color: 'activity-events', vibeType: 'social' },
  'meet-the-parents': { label: 'Meet the Parents', icon: '👪', lucideIcon: Users, color: 'activity-events', vibeType: 'social' },
  'reunion': { label: 'Reunion', icon: '🫂', lucideIcon: Users, color: 'activity-events', vibeType: 'social' },
  'networking': { label: 'Networking', icon: '🤝', lucideIcon: Briefcase, color: 'activity-events', vibeType: 'social' },
  'meetup': { label: 'Meetup', icon: '👥', lucideIcon: Users, color: 'activity-events', vibeType: 'social' },
  'volunteering': { label: 'Volunteering', icon: '🤝', lucideIcon: Heart, color: 'activity-events', vibeType: 'social' },
  'religious-service': { label: 'Religious Service', icon: '⛪', lucideIcon: Church, color: 'activity-events', vibeType: 'social' },
  'get-off-lawn': { label: 'Get Off My Lawn', icon: '🌿', lucideIcon: Megaphone, color: 'activity-events', vibeType: 'social' },

  // ============ ATHLETIC — Gym & Studio ============
  'gym': { label: 'Gym', icon: '🏋️', lucideIcon: Dumbbell, color: 'activity-workout', vibeType: 'athletic' },
  'weight-training': { label: 'Weight Training', icon: '🏋️‍♂️', lucideIcon: Dumbbell, color: 'activity-workout', vibeType: 'athletic' },
  'crossfit': { label: 'CrossFit', icon: '💪', lucideIcon: Dumbbell, color: 'activity-workout', vibeType: 'athletic' },
  'f45': { label: 'F45 Training', icon: '🔥', lucideIcon: Flame, color: 'activity-workout', vibeType: 'athletic' },
  'orangetheory': { label: 'Orangetheory', icon: '🟠', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'barre': { label: 'Barre', icon: '🩰', lucideIcon: PersonStanding, color: 'activity-workout', vibeType: 'athletic' },
  'pilates': { label: 'Pilates', icon: '🧘', lucideIcon: PersonStanding, color: 'activity-workout', vibeType: 'athletic' },
  'yoga': { label: 'Yoga', icon: '🧘‍♀️', lucideIcon: PersonStanding, color: 'activity-workout', vibeType: 'athletic' },
  'hot-yoga': { label: 'Hot Yoga', icon: '🔥', lucideIcon: PersonStanding, color: 'activity-workout', vibeType: 'athletic' },
  'spin-class': { label: 'Spin Class', icon: '🚴', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'cycling-class': { label: 'Cycling Class', icon: '🚲', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'rowing-class': { label: 'Rowing Class', icon: '🚣', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'hiit': { label: 'HIIT', icon: '⚡', lucideIcon: Zap, color: 'activity-workout', vibeType: 'athletic' },
  'bootcamp': { label: 'Bootcamp', icon: '🎖️', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'kickboxing': { label: 'Kickboxing', icon: '🥋', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'boxing': { label: 'Boxing', icon: '🥊', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'mma-training': { label: 'MMA Training', icon: '🥋', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'martial-arts': { label: 'Martial Arts', icon: '🥋', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'jiu-jitsu': { label: 'Jiu-Jitsu', icon: '🥋', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'fencing': { label: 'Fencing', icon: '🤺', lucideIcon: Sword, color: 'activity-workout', vibeType: 'athletic' },
  'dance-class': { label: 'Dance Class', icon: '💃', lucideIcon: PartyPopper, color: 'activity-workout', vibeType: 'athletic' },
  'zumba': { label: 'Zumba', icon: '💃', lucideIcon: PartyPopper, color: 'activity-workout', vibeType: 'athletic' },
  'aerial-yoga': { label: 'Aerial Yoga', icon: '🪢', lucideIcon: PersonStanding, color: 'activity-workout', vibeType: 'athletic' },
  'workout-in': { label: 'Workout at Home', icon: '🏠', lucideIcon: Home, color: 'activity-workout', vibeType: 'athletic' },

  // ============ ATHLETIC — Outdoor / Endurance ============
  'running': { label: 'Running', icon: '🏃', lucideIcon: Footprints, color: 'activity-workout', vibeType: 'athletic' },
  'trail-running': { label: 'Trail Running', icon: '🏞️', lucideIcon: Mountain, color: 'activity-workout', vibeType: 'athletic' },
  'jogging': { label: 'Jogging', icon: '🏃‍♀️', lucideIcon: Footprints, color: 'activity-workout', vibeType: 'athletic' },
  'walking': { label: 'Walking', icon: '🚶', lucideIcon: Footprints, color: 'activity-workout', vibeType: 'athletic' },
  'jaywalking': { label: 'Jaywalking', icon: '🚶', lucideIcon: Footprints, color: 'activity-workout', vibeType: 'athletic' },
  'hiking': { label: 'Hiking', icon: '🥾', lucideIcon: Mountain, color: 'activity-workout', vibeType: 'athletic' },
  'backpacking': { label: 'Backpacking', icon: '🎒', lucideIcon: Backpack, color: 'activity-workout', vibeType: 'athletic' },
  'camping': { label: 'Camping', icon: '⛺', lucideIcon: Tent, color: 'activity-workout', vibeType: 'athletic' },
  'rock-climbing': { label: 'Rock Climbing', icon: '🧗', lucideIcon: Mountain, color: 'activity-workout', vibeType: 'athletic' },
  'bouldering': { label: 'Bouldering', icon: '🧗‍♂️', lucideIcon: Mountain, color: 'activity-workout', vibeType: 'athletic' },
  'mountaineering': { label: 'Mountaineering', icon: '⛰️', lucideIcon: Mountain, color: 'activity-workout', vibeType: 'athletic' },
  'cycling': { label: 'Cycling', icon: '🚴‍♀️', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'mountain-biking': { label: 'Mountain Biking', icon: '🚵', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'road-biking': { label: 'Road Biking', icon: '🚴', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'gravel-riding': { label: 'Gravel Riding', icon: '🚵‍♀️', lucideIcon: Bike, color: 'activity-workout', vibeType: 'athletic' },
  'skateboarding': { label: 'Skateboarding', icon: '🛹', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'longboarding': { label: 'Longboarding', icon: '🛹', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'rollerblading': { label: 'Rollerblading', icon: '🛼', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'parkour': { label: 'Parkour', icon: '🤸', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },

  // ============ ATHLETIC — Water Sports ============
  'swimming': { label: 'Swimming', icon: '🏊', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'lap-swim': { label: 'Lap Swim', icon: '🏊‍♂️', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'open-water-swim': { label: 'Open-Water Swim', icon: '🌊', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'surfing': { label: 'Surfing', icon: '🏄', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'paddleboarding': { label: 'Paddleboarding', icon: '🏄‍♀️', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'kayaking': { label: 'Kayaking', icon: '🛶', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'canoeing': { label: 'Canoeing', icon: '🛶', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'rowing': { label: 'Rowing', icon: '🚣', lucideIcon: Activity, color: 'activity-workout', vibeType: 'athletic' },
  'sailing': { label: 'Sailing', icon: '⛵', lucideIcon: Sailboat, color: 'activity-workout', vibeType: 'athletic' },
  'windsurfing': { label: 'Windsurfing', icon: '🏄‍♂️', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'kitesurfing': { label: 'Kitesurfing', icon: '🪁', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'wakeboarding': { label: 'Wakeboarding', icon: '🌊', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'water-skiing': { label: 'Water Skiing', icon: '🎿', lucideIcon: WavesIcon, color: 'activity-workout', vibeType: 'athletic' },
  'jet-skiing': { label: 'Jet Skiing', icon: '🛥️', lucideIcon: Ship, color: 'activity-workout', vibeType: 'athletic' },
  'scuba-diving': { label: 'Scuba Diving', icon: '🤿', lucideIcon: Anchor, color: 'activity-workout', vibeType: 'athletic' },
  'snorkeling': { label: 'Snorkeling', icon: '🐠', lucideIcon: Fish, color: 'activity-workout', vibeType: 'athletic' },
  'fishing': { label: 'Fishing', icon: '🎣', lucideIcon: Fish, color: 'activity-workout', vibeType: 'athletic' },

  // ============ ATHLETIC — Snow Sports ============
  'skiing': { label: 'Skiing', icon: '⛷️', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },
  'snowboarding': { label: 'Snowboarding', icon: '🏂', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },
  'cross-country-skiing': { label: 'Cross-Country Skiing', icon: '🎿', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },
  'ice-skating': { label: 'Ice Skating', icon: '⛸️', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },
  'hockey': { label: 'Hockey', icon: '🏒', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'snowshoeing': { label: 'Snowshoeing', icon: '🥾', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },
  'sledding': { label: 'Sledding', icon: '🛷', lucideIcon: Snowflake, color: 'activity-workout', vibeType: 'athletic' },

  // ============ ATHLETIC — Team & Racquet Sports ============
  'pickleball': { label: 'Pickleball', icon: '🥒', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'tennis': { label: 'Tennis', icon: '🎾', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'squash': { label: 'Squash', icon: '🟡', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'racquetball': { label: 'Racquetball', icon: '🎾', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'badminton': { label: 'Badminton', icon: '🏸', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'table-tennis': { label: 'Table Tennis', icon: '🏓', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'basketball': { label: 'Basketball', icon: '🏀', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'soccer': { label: 'Soccer', icon: '⚽', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'football': { label: 'Football', icon: '🏈', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'baseball': { label: 'Baseball', icon: '⚾', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'softball': { label: 'Softball', icon: '🥎', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'volleyball': { label: 'Volleyball', icon: '🏐', lucideIcon: Volleyball, color: 'activity-workout', vibeType: 'athletic' },
  'beach-volleyball': { label: 'Beach Volleyball', icon: '🏖️', lucideIcon: Volleyball, color: 'activity-workout', vibeType: 'athletic' },
  'ultimate-frisbee': { label: 'Ultimate Frisbee', icon: '🥏', lucideIcon: Disc3, color: 'activity-workout', vibeType: 'athletic' },
  'lacrosse': { label: 'Lacrosse', icon: '🥍', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'rugby': { label: 'Rugby', icon: '🏉', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'cricket': { label: 'Cricket', icon: '🏏', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'kickball': { label: 'Kickball', icon: '⚽', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'dodgeball': { label: 'Dodgeball', icon: '🔴', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },

  // ============ ATHLETIC — Precision / Other ============
  'golf': { label: 'Golf', icon: '⛳', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'mini-golf': { label: 'Mini Golf', icon: '🏌️', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'driving-range': { label: 'Driving Range', icon: '🏌️‍♂️', lucideIcon: Trophy, color: 'activity-workout', vibeType: 'athletic' },
  'disc-golf': { label: 'Disc Golf', icon: '🥏', lucideIcon: Disc3, color: 'activity-workout', vibeType: 'athletic' },
  'archery': { label: 'Archery', icon: '🏹', lucideIcon: Target, color: 'activity-workout', vibeType: 'athletic' },
  'shooting-range': { label: 'Shooting Range', icon: '🎯', lucideIcon: Target, color: 'activity-workout', vibeType: 'athletic' },
  'horseback-riding': { label: 'Horseback Riding', icon: '🐴', lucideIcon: PawPrint, color: 'activity-workout', vibeType: 'athletic' },
  'equestrian': { label: 'Equestrian', icon: '🏇', lucideIcon: PawPrint, color: 'activity-workout', vibeType: 'athletic' },
  'larping': { label: 'LARPing', icon: '⚔️', lucideIcon: Sword, color: 'activity-workout', vibeType: 'athletic' },

  // ============ CHILL ============
  'listening-music': { label: 'Listening to Music', icon: '🎧', lucideIcon: Headphones, color: 'activity-me-time', vibeType: 'chill' },
  'watching-movie': { label: 'Watching a Movie', icon: '🎬', lucideIcon: Clapperboard, color: 'activity-movies', vibeType: 'chill' },
  'watching-tv': { label: 'Watching TV', icon: '📺', lucideIcon: Tv, color: 'activity-watching', vibeType: 'chill' },
  'movies': { label: 'Going to the Movies', icon: '🎥', lucideIcon: Film, color: 'activity-movies', vibeType: 'chill' },
  'reading': { label: 'Reading', icon: '📚', lucideIcon: BookOpen, color: 'activity-reading', vibeType: 'chill' },
  'shopping': { label: 'Shopping', icon: '🛍️', lucideIcon: ShoppingBag, color: 'activity-shopping', vibeType: 'chill' },
  'window-shopping': { label: 'Window Shopping', icon: '🪟', lucideIcon: ShoppingBag, color: 'activity-shopping', vibeType: 'chill' },
  'thrifting': { label: 'Thrifting', icon: '👕', lucideIcon: Shirt, color: 'activity-shopping', vibeType: 'chill' },
  'spa-day': { label: 'Spa Day', icon: '🧖', lucideIcon: Bath, color: 'activity-me-time', vibeType: 'chill' },
  'massage': { label: 'Massage', icon: '💆', lucideIcon: Heart, color: 'activity-me-time', vibeType: 'chill' },
  'meditation': { label: 'Meditation', icon: '🧘', lucideIcon: Brain, color: 'activity-me-time', vibeType: 'chill' },
  'journaling': { label: 'Journaling', icon: '📓', lucideIcon: Pen, color: 'activity-me-time', vibeType: 'chill' },
  'puzzles': { label: 'Puzzles', icon: '🧩', lucideIcon: Puzzle, color: 'activity-me-time', vibeType: 'chill' },
  'gardening': { label: 'Gardening', icon: '🌱', lucideIcon: Sprout, color: 'activity-me-time', vibeType: 'chill' },
  'birdwatching': { label: 'Birdwatching', icon: '🐦', lucideIcon: Bird, color: 'activity-me-time', vibeType: 'chill' },
  'stargazing': { label: 'Stargazing', icon: '✨', lucideIcon: Star, color: 'activity-me-time', vibeType: 'chill' },
  'scenic-drive': { label: 'Scenic Drive', icon: '🚗', lucideIcon: Car, color: 'activity-me-time', vibeType: 'chill' },
  'cafe-hopping': { label: 'Café Hopping', icon: '☕', lucideIcon: Coffee, color: 'activity-me-time', vibeType: 'chill' },
  'tea-house': { label: 'Tea House', icon: '🍵', lucideIcon: Coffee, color: 'activity-me-time', vibeType: 'chill' },
  'bookstore': { label: 'Bookstore', icon: '📖', lucideIcon: BookOpen, color: 'activity-reading', vibeType: 'chill' },
  'library': { label: 'Library', icon: '📚', lucideIcon: BookOpen, color: 'activity-reading', vibeType: 'chill' },
  'black-hole': { label: 'In a Black Hole', icon: '🕳️', lucideIcon: Sparkles, color: 'activity-me-time', vibeType: 'chill' },

  // ============ PRODUCTIVE ============
  'work': { label: 'Work', icon: '💼', lucideIcon: Briefcase, color: 'activity-chores', vibeType: 'productive' },
  'co-working': { label: 'Co-working', icon: '💻', lucideIcon: Briefcase, color: 'activity-chores', vibeType: 'productive' },
  'study-session': { label: 'Study Session', icon: '📝', lucideIcon: BookOpen, color: 'activity-chores', vibeType: 'productive' },
  'errands': { label: 'Errands', icon: '🧾', lucideIcon: ShoppingBag, color: 'activity-errands', vibeType: 'productive' },
  'grocery-shopping': { label: 'Grocery Shopping', icon: '🛒', lucideIcon: ShoppingBag, color: 'activity-errands', vibeType: 'productive' },
  'meal-prep': { label: 'Meal Prep', icon: '🥡', lucideIcon: ChefHat, color: 'activity-chores', vibeType: 'productive' },
  'cleaning': { label: 'Cleaning', icon: '🧹', lucideIcon: Recycle, color: 'activity-chores', vibeType: 'productive' },
  'laundry': { label: 'Laundry', icon: '🧺', lucideIcon: ShowerHead, color: 'activity-chores', vibeType: 'productive' },
  'home-improvement': { label: 'Home Improvement', icon: '🔨', lucideIcon: Wrench, color: 'activity-chores', vibeType: 'productive' },
  'feeding-pets': { label: 'Feeding the Pets', icon: '🐾', lucideIcon: PawPrint, color: 'activity-chores', vibeType: 'productive' },
  'walking-dog': { label: 'Walking the Dog', icon: '🐕', lucideIcon: Dog, color: 'activity-chores', vibeType: 'productive' },
  'hydrating': { label: 'Hydrating', icon: '💧', lucideIcon: GlassWater, color: 'activity-chores', vibeType: 'productive' },
  'doctor-appointment': { label: 'Doctor Appointment', icon: '🩺', lucideIcon: Stethoscope, color: 'activity-errands', vibeType: 'productive' },
  'therapy': { label: 'Therapy', icon: '🧠', lucideIcon: Brain, color: 'activity-errands', vibeType: 'productive' },
  'haircut': { label: 'Haircut', icon: '💇', lucideIcon: Scissors, color: 'activity-errands', vibeType: 'productive' },
  'amateur-djing': { label: 'Amateur DJing', icon: '🎧', lucideIcon: Disc3, color: 'activity-errands', vibeType: 'productive' },
  'flight': { label: 'Flight', icon: '✈️', lucideIcon: Plane, color: 'activity-events', vibeType: 'productive' },
  'hotel': { label: 'Hotel / Stay', icon: '🏨', lucideIcon: Hotel, color: 'activity-events', vibeType: 'productive' },

  // Custom placeholder
  'custom': { label: 'Custom', icon: '✨', lucideIcon: Sparkles, color: 'primary', vibeType: 'social' },
};

export const getActivitiesByVibe = (vibeType: VibeType): ActivityType[] => {
  return (Object.keys(ACTIVITY_CONFIG) as ActivityType[]).filter(
    (type) => type !== 'custom' && ACTIVITY_CONFIG[type].vibeType === vibeType
  );
};

export const getAllVibes = (): VibeType[] => {
  return ['social', 'chill', 'athletic', 'productive'];
};

// Helper to get activity config, including custom activities
export const getActivityConfig = (
  activityId: string,
  customActivities: CustomActivity[] = []
): ActivityConfig | undefined => {
  if (activityId in ACTIVITY_CONFIG) {
    return ACTIVITY_CONFIG[activityId as ActivityType];
  }
  const customActivity = customActivities.find(a => a.id === activityId);
  if (customActivity) {
    return {
      label: customActivity.label,
      icon: customActivity.icon,
      color: `vibe-${customActivity.vibeType}`,
      vibeType: customActivity.vibeType,
    };
  }
  return undefined;
};

// Legacy support
export type ActivityCategory = 'staying-in' | 'going-out';
export const ACTIVITY_CATEGORIES: Record<ActivityCategory, { label: string; icon: string }> = {
  'staying-in': { label: 'Staying In', icon: '🏠' },
  'going-out': { label: 'Going Out', icon: '🚀' },
};
export const getActivitiesByCategory = (category: ActivityCategory): ActivityType[] => {
  if (category === 'staying-in') {
    return [...getActivitiesByVibe('chill'), 'workout-in'];
  }
  return [...getActivitiesByVibe('social'), 'gym', 'shopping'];
};
