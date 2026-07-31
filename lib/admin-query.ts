/**
 * Shared helpers for admin list APIs — pagination, date filters, display names.
 */

export type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';

export function parseIntParam(value: string | null, fallback: number, min = 1, max = 1000) {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parsePageParams(searchParams: URLSearchParams) {
  const page = parseIntParam(searchParams.get('page'), 1);
  const perPage = parseIntParam(searchParams.get('per_page'), 25, 25, 100);
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

export function getDateRangeStart(filter: DateFilter): string | null {
  if (filter === 'all') return null;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (filter) {
    case 'today':
      return start.toISOString();
    case 'week': {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      return start.toISOString();
    }
    case 'month':
      start.setDate(1);
      return start.toISOString();
    case 'year':
      start.setMonth(0, 1);
      return start.toISOString();
    default:
      return null;
  }
}

export function formatAdminDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatAdminMoney(value: number | string | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type AccountInfo = {
  firstName?: string;
  lastName?: string;
  username?: string;
};

type AuthLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string | null;
};

type ProfileLike = {
  account_info?: AccountInfo | Record<string, unknown> | null;
  created_at?: string | null;
};

export function getUserDisplayName(profile: ProfileLike | null | undefined, authUser: AuthLike) {
  const accountInfo = (profile?.account_info ?? {}) as AccountInfo;
  const metadata = authUser.user_metadata ?? {};
  return (
    [accountInfo.firstName, accountInfo.lastName].filter(Boolean).join(' ').trim() ||
    String(metadata.display_name ?? metadata.full_name ?? metadata.name ?? '').trim() ||
    authUser.email?.split('@')[0] ||
    'User'
  );
}

export function getUserUsername(profile: ProfileLike | null | undefined, authUser: AuthLike) {
  const accountInfo = (profile?.account_info ?? {}) as AccountInfo;
  const metadata = authUser.user_metadata ?? {};
  return (
    accountInfo.username?.trim() ||
    String(metadata.username ?? metadata.user_name ?? '').trim() ||
    authUser.email?.split('@')[0] ||
    ''
  );
}

export function matchesUserSearch(
  search: string,
  profile: ProfileLike | null | undefined,
  authUser: AuthLike
) {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  const fullName = getUserDisplayName(profile, authUser).toLowerCase();
  const username = getUserUsername(profile, authUser).toLowerCase();
  const email = (authUser.email ?? '').toLowerCase();
  return fullName.includes(q) || username.includes(q) || email.includes(q);
}

export function matchesOrganizerSearch(
  search: string,
  organizer: { id: string; name: string },
  ownerEmail: string
) {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  const slug = slugify(organizer.name);
  return (
    organizer.name.toLowerCase().includes(q) ||
    organizer.id.toLowerCase().includes(q) ||
    slug.includes(q) ||
    ownerEmail.toLowerCase().includes(q)
  );
}

export function toCsv(rows: Record<string, string | number | null | undefined>[], headers: string[]) {
  const escape = (value: string | number | null | undefined) => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}
