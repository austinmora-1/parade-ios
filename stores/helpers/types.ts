/** Shape returned by the get_dashboard_data RPC */
export interface DashboardData {
  own_plans: any[];
  participated_plans: any[];
  plan_participants: Array<{
    plan_id: string;
    friend_id: string;
    status: string;
    role: string;
    responded_at: string | null;
  }>;
  participant_profiles: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  outgoing_friendships: Array<{
    id: string;
    user_id: string;
    friend_user_id: string | null;
    friend_name: string;
    friend_email: string | null;
    status: string;
    is_pod_member: boolean;
    created_at: string;
    updated_at: string;
  }>;
  outgoing_friend_profiles: Array<{
    user_id: string;
    avatar_url: string | null;
  }>;
  incoming_friendships: Array<{
    id: string;
    user_id: string;
    friend_user_id: string | null;
    friend_name: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  incoming_friend_profiles: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  availability: Array<{
    date: string;
    early_morning: boolean;
    late_morning: boolean;
    early_afternoon: boolean;
    late_afternoon: boolean;
    evening: boolean;
    late_night: boolean;
    location_status: string | null;
    trip_location: string | null;
    vibe: string | null;
    slot_location_early_morning: string | null;
    slot_location_late_morning: string | null;
    slot_location_early_afternoon: string | null;
    slot_location_late_afternoon: string | null;
    slot_location_evening: string | null;
    slot_location_late_night: string | null;
  }>;
  profile: {
    current_vibe: string | null;
    location_status: string | null;
    custom_vibe_tags: string[] | null;
    vibe_gif_url: string | null;
    default_work_days: string[] | null;
    default_work_start_hour: number | null;
    default_work_end_hour: number | null;
    default_availability_status: string | null;
    default_vibes: string[] | null;
    home_address: string | null;
    timezone: string | null;
  } | null;
  has_more_plans?: boolean;
}

export interface DefaultAvailabilitySettings {
  workDays: string[];
  workStartHour: number;
  workEndHour: number;
  defaultStatus: 'free' | 'unavailable';
  defaultVibes: string[];
}
