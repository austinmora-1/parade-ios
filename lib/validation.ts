import { z } from 'zod';

export const planSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
  notes: z.string().max(2000, 'Notes must be under 2000 characters').optional().nullable(),
  duration: z.number().min(15, 'Duration must be at least 15 minutes').max(1440, 'Duration must be under 24 hours'),
  activity: z.string().min(1, 'Activity is required'),
});

export const friendshipSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be under 100 characters'),
});

export function validatePlan(data: { title: string; notes?: string | null; duration: number; activity: string }) {
  const result = planSchema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map(i => i.message).join(', ');
    throw new Error(msg);
  }
  return result.data;
}

export function validateFriendName(name: string) {
  const result = friendshipSchema.safeParse({ name });
  if (!result.success) {
    const msg = result.error.issues.map(i => i.message).join(', ');
    throw new Error(msg);
  }
  return result.data.name;
}
