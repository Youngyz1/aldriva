export type OrganizerStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export type OrganizerSort =
  | 'newest'
  | 'oldest'
  | 'alphabetical'
  | 'most_events'
  | 'most_fundraisers';

export type UserSort =
  | 'newest'
  | 'oldest'
  | 'alphabetical'
  | 'most_events'
  | 'most_organizers'
  | 'most_fundraisers';

export type UserRole = 'admin' | 'organizer' | 'user';
export type UserStatus = 'active' | 'suspended';
export type UserActivity = 'all' | 'has_events' | 'has_fundraisers' | 'has_organizers';

export type AdminOrganizerRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  email: string;
  owner_name: string;
  status: OrganizerStatus;
  event_count: number;
  fundraiser_count: number;
  follower_count: number;
  follower_offset: number;
  events_offset: number;
  revenue: number;
  created_at: string;
  verified_at: string | null;
  badges: string[];
};

export type AdminOrganizerStats = {
  pending: number;
  verified: number;
  suspended: number;
  rejected: number;
  total: number;
};

export type VisibilityAuditEntry = {
  id: string;
  admin_user_id: string;
  field_name: 'follower_offset' | 'events_offset';
  old_value: number;
  new_value: number;
  created_at: string;
  admin_name?: string;
};

export type AdminOrganizerDetail = AdminOrganizerRow & {
  bio: string | null;
  photo: string | null;
  website: string | null;
  status_history: { status: string; at: string; label: string }[];
  visibility_history: VisibilityAuditEntry[];
};

export type AdminUserRow = {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  organizer_count: number;
  event_count: number;
  fundraiser_count: number;
  revenue: number;
  created_at: string;
  last_login: string | null;
  is_current_user: boolean;
};

export type AdminUserStats = {
  total: number;
  active: number;
  suspended: number;
  admins: number;
  organizers: number;
};

export type AdminUserDetail = AdminUserRow & {
  phone: string | null;
  company: string | null;
  website: string | null;
  location: string | null;
  organizers: {
    id: string;
    name: string;
    status: string;
    created_at: string;
  }[];
  recent_activity: {
    id: string;
    type: 'event' | 'fundraiser' | 'donation' | 'ticket';
    title: string;
    detail: string;
    at: string;
    href?: string;
  }[];
};

export type PaginatedResponse<T, S = Record<string, number>> = {
  items: T[];
  stats: S;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};
