/**
 * lib/ai/studio-chat-groups.ts — Stage 22 (P4b): pure conversation grouping.
 *
 * Dependency-free on purpose: the Studio chat client and the node test
 * suite share this one implementation. Newest first; buckets are local
 * calendar days (Today / Yesterday / Previous 7 days / Older). Empty
 * buckets are omitted. Unparseable timestamps fall into Older rather than
 * disappearing.
 */

export interface GroupableConversation {
  id: string;
  title: string;
  updated_at: string;
}

export type ConversationGroupKey = 'today' | 'yesterday' | 'previous7' | 'older';

export interface ConversationGroup<T> {
  key: ConversationGroupKey;
  label: string;
  items: T[];
}

const GROUP_LABELS: Record<ConversationGroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  previous7: 'Previous 7 days',
  older: 'Older',
};

const DAY_MS = 86_400_000;

/** Local calendar-day bucket distance (round: DST days are 23/25h). */
function startOfMessageDay(time: number): number {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return +day;
}

export function groupConversations<T extends GroupableConversation>(
  conversations: T[],
  now: Date = new Date()
): ConversationGroup<T>[] {
  const sorted = [...conversations].sort(
    (a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)
  );
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const buckets: Record<ConversationGroupKey, T[]> = {
    today: [],
    yesterday: [],
    previous7: [],
    older: [],
  };
  for (const convo of sorted) {
    const time = +new Date(convo.updated_at);
    if (Number.isNaN(time)) {
      buckets.older.push(convo);
      continue;
    }
    const diffDays = Math.round((+startOfToday - +startOfMessageDay(time)) / DAY_MS);
    if (diffDays <= 0) buckets.today.push(convo);
    else if (diffDays === 1) buckets.yesterday.push(convo);
    else if (diffDays <= 7) buckets.previous7.push(convo);
    else buckets.older.push(convo);
  }
  const keys: ConversationGroupKey[] = ['today', 'yesterday', 'previous7', 'older'];
  return keys
    .map((key) => ({ key, label: GROUP_LABELS[key], items: buckets[key] }))
    .filter((group) => group.items.length > 0);
}
