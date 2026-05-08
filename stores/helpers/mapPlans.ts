import { Plan, Friend, TimeSlot, ActivityType, PlanStatus } from '@/types/planner';
import { addDays } from 'date-fns';
import { convertTimeBetweenTimezones, getTimeSlotForTime, getTimeSlotMidpoint } from '@/lib/timezone';

export interface ParticipantRow {
  friend_id: string;
  status: string;
  role: string;
  responded_at: string | null;
}

/** Build a plan_id → participant rows lookup from a flat array */
export const buildParticipantsMap = (
  rows: Array<{ plan_id: string } & ParticipantRow>
): Record<string, ParticipantRow[]> => {
  const map: Record<string, ParticipantRow[]> = {};
  for (const pp of rows) {
    if (!map[pp.plan_id]) map[pp.plan_id] = [];
    map[pp.plan_id].push({
      friend_id: pp.friend_id,
      status: pp.status,
      role: pp.role,
      responded_at: pp.responded_at,
    });
  }
  return map;
};

/** Merge own + participated plan rows, deduplicating hang-request plans */
export const deduplicatePlanRows = (ownPlans: any[], participatedPlans: any[]): any[] => {
  const ownIds = new Set(ownPlans.map((p: any) => p.id));
  const ownHangKeys = new Set(
    ownPlans
      .filter((p: any) => p.source === 'hang-request')
      .map((p: any) => `${p.date}|${p.time_slot}`)
  );
  return [
    ...ownPlans,
    ...participatedPlans.filter((p: any) => {
      if (ownIds.has(p.id)) return false;
      if (p.source === 'hang-request' && ownHangKeys.has(`${p.date}|${p.time_slot}`)) return false;
      return true;
    }),
  ];
};

/** Convert a raw plan DB row to a Plan model */
export const mapRawPlanToModel = (
  p: any,
  userId: string,
  participantsMap: Record<string, ParticipantRow[]>,
  profilesMap: Record<string, string>,
  profileAvatarsMap: Record<string, string | null>,
  viewerTimezone: string,
): Plan => {
  const allPps = participantsMap[p.id] || [];
  const myParticipation = allPps.find(pp => pp.friend_id === userId);
  const myRole = p.user_id === userId
    ? 'participant'
    : (myParticipation?.role as 'participant' | 'subscriber') || 'participant';

  const rawPps = allPps.filter(pp => pp.friend_id !== userId);
  const pps = [...rawPps];
  if (p.user_id !== userId && !pps.some(pp => pp.friend_id === p.user_id)) {
    pps.push({ friend_id: p.user_id, status: 'accepted', role: 'participant', responded_at: null });
  }

  const planDateRaw = new Date(p.date);
  const planYear = planDateRaw.getUTCFullYear();
  const planMonth = planDateRaw.getUTCMonth();
  const planDay = planDateRaw.getUTCDate();
  let normalizedPlanDate = new Date(planYear, planMonth, planDay);

  let effectiveTimeSlot = p.time_slot as TimeSlot;
  let effectiveStartTime: string | undefined = p.start_time || undefined;
  let effectiveEndTime: string | undefined = p.end_time || undefined;

  const sourceTimezone = p.source_timezone;
  if (sourceTimezone && sourceTimezone !== viewerTimezone) {
    if (effectiveStartTime) {
      const converted = convertTimeBetweenTimezones(effectiveStartTime, normalizedPlanDate, sourceTimezone, viewerTimezone);
      effectiveStartTime = converted.time;
      if (converted.dayOffset !== 0) normalizedPlanDate = addDays(normalizedPlanDate, converted.dayOffset);
      effectiveTimeSlot = getTimeSlotForTime(converted.time) as TimeSlot;
    } else {
      const midpoint = getTimeSlotMidpoint(p.time_slot);
      const converted = convertTimeBetweenTimezones(midpoint, normalizedPlanDate, sourceTimezone, viewerTimezone);
      effectiveTimeSlot = getTimeSlotForTime(converted.time) as TimeSlot;
      if (converted.dayOffset !== 0) normalizedPlanDate = addDays(normalizedPlanDate, converted.dayOffset);
    }
    if (effectiveEndTime) {
      const convertedEnd = convertTimeBetweenTimezones(effectiveEndTime, new Date(planYear, planMonth, planDay), sourceTimezone, viewerTimezone);
      effectiveEndTime = convertedEnd.time;
    }
  }

  return {
    id: p.id,
    userId: p.user_id,
    title: p.title,
    activity: p.activity as ActivityType,
    date: normalizedPlanDate,
    endDate: p.end_date ? (() => {
      const ed = new Date(p.end_date);
      return new Date(ed.getUTCFullYear(), ed.getUTCMonth(), ed.getUTCDate());
    })() : undefined,
    timeSlot: effectiveTimeSlot,
    duration: p.duration,
    startTime: effectiveStartTime,
    endTime: effectiveEndTime,
    location: p.location ? { id: p.id, name: p.location, address: '' } : undefined,
    notes: p.notes || undefined,
    status: p.status as PlanStatus || 'confirmed',
    feedVisibility: p.feed_visibility || 'private',
    blocksAvailability: (p as any).blocks_availability !== false,
    participants: pps.map(pp => ({
      id: pp.friend_id,
      name: profilesMap[pp.friend_id] || 'Friend',
      avatar: profileAvatarsMap[pp.friend_id] || undefined,
      friendUserId: pp.friend_id,
      status: 'connected' as const,
      role: (pp.role as 'participant' | 'subscriber') || 'participant',
      rsvpStatus: pp.status as string || 'invited',
      respondedAt: pp.responded_at ? new Date(pp.responded_at) : undefined,
    })),
    myRole,
    myRsvpStatus: p.user_id === userId ? undefined : (myParticipation?.status as string || 'invited'),
    recurringPlanId: p.recurring_plan_id || undefined,
    proposedBy: p.proposed_by || undefined,
    createdAt: new Date(p.created_at),
    sourceTimezone: p.source_timezone || undefined,
    source: p.source || undefined,
  };
};
