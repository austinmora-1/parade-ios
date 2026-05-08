import { Plan } from '@/types/planner';

/** Take just the first name from a full display name (e.g. "Dean Smith" → "Dean"). */
function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || name || '';
}

/** Join names as "A", "A & B", or "A, B & C". */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Returns a dynamic display title for a plan.
 *
 * For "Hang with …" plans, the title is rebuilt from the viewer's perspective:
 * the participants array on a Plan already excludes the viewer and includes the
 * organizer (when the viewer isn't the organizer), so we just join their names.
 * This means a hang between Austin and Dean reads "Hang with Dean" for Austin
 * and "Hang with Austin" for Dean.
 */
export function getPlanDisplayTitle(plan: Pick<Plan, 'title' | 'participants'>): string {
  const others = plan.participants
    .filter(p => p.role !== 'subscriber')
    .map(p => firstName(p.name))
    .filter(Boolean);

  if (plan.title.startsWith('Hang with') && others.length > 0) {
    return `Hang with ${joinNames(others)}`;
  }
  return plan.title;
}

/**
 * Returns a compact single-line title for narrow plan cards.
 * Prefer trimming trailing location detail after separators like " - ", then fall back to a max length.
 */
export function getCompactPlanTitle(
  plan: Pick<Plan, 'title' | 'participants'>,
  maxLength = 28,
): string {
  const fullTitle = getPlanDisplayTitle(plan).trim();

  const separatorIndex = fullTitle.lastIndexOf(' - ');
  const trimmed = separatorIndex > 0
    ? fullTitle.slice(0, separatorIndex).trim()
    : fullTitle;

  if (trimmed.length <= maxLength) {
    return separatorIndex > 0 ? `${trimmed}…` : trimmed;
  }

  return `${trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
