export type DashboardEventStatus = 'pending' | 'approved' | 'rejected';
export type DashboardEventSort = 'newest' | 'oldest' | 'alphabetical' | 'most_tickets' | 'most_revenue' | 'event_date';

export type DashboardEventRow = {
  id: string;
  title: string;
  slug: string | null;
  event_date: string | null;
  status: DashboardEventStatus;
  visibility: string;
  ticket_count: number;
  revenue: number;
  created_at: string;
};

export type DashboardEventStats = {
  total: number;
  published: number;
  draft: number;
  tickets_sold: number;
  revenue: number;
};

export type DashboardEventDetail = DashboardEventRow & {
  category: string | null;
  city: string | null;
  description: string | null;
  organizer_name: string;
};

export type DashboardFundraiserSort = 'newest' | 'oldest' | 'alphabetical' | 'most_raised' | 'most_donors' | 'progress';
export type DashboardFundraiserStatus = 'all' | 'active' | 'completed';

export type DashboardFundraiserRow = {
  id: string;
  title: string;
  slug: string | null;
  category: string;
  goal: number;
  raised: number;
  donor_count: number;
  progress: number;
  status: 'active' | 'completed';
  review_status: 'pending_review' | 'published' | 'rejected';
  created_at: string;
};

export type DashboardFundraiserStats = {
  total: number;
  active: number;
  completed: number;
  raised: number;
  donors: number;
};

export type DashboardFundraiserDetail = DashboardFundraiserRow & {
  short_description: string | null;
  story: string | null;
  organizer_name: string;
  update_count: number;
};

export type DashboardOrganizerSort = 'newest' | 'oldest' | 'alphabetical' | 'most_followers' | 'most_events' | 'most_revenue';

export type DashboardOrganizerRow = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  status: string;
  follower_count: number;
  event_count: number;
  fundraiser_count: number;
  revenue: number;
  created_at: string;
};

export type DashboardOrganizerStats = {
  total: number;
  verified: number;
  pending: number;
  followers: number;
  revenue: number;
};

export type DashboardOrganizerDetail = DashboardOrganizerRow & {
  bio: string | null;
  website: string | null;
  visibility: string;
};

export type DashboardDonationSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export type DashboardDonationRow = {
  id: string;
  donor_name: string;
  donor_email: string;
  campaign_id: string;
  campaign_title: string;
  campaign_slug: string | null;
  amount: number;
  status: string;
  created_at: string;
};

export type DashboardDonationStats = {
  total_raised: number;
  donations: number;
  average_gift: number;
  largest_gift: number;
};

export type DashboardDonationDetail = DashboardDonationRow & {
  message: string | null;
};

export type DashboardAttendeeSort = 'newest' | 'oldest' | 'amount_high' | 'name';

export type DashboardAttendeeRow = {
  id: string;
  attendee_name: string;
  email: string;
  event_id: string;
  event_title: string;
  quantity: number;
  paid: number;
  status: string;
  created_at: string;
  qr_code: string;
};

export type DashboardAttendeeStats = {
  total_attendees: number;
  tickets_sold: number;
  revenue: number;
  checked_in: number;
};

export type DashboardAttendeeDetail = DashboardAttendeeRow & {
  seat_label: string | null;
  checked_in_at: string | null;
  event_slug: string | null;
};

export type DashboardReportsRange = '7' | '30' | '90' | '365' | 'custom';

export type DashboardHomeStats = {
  events: number;
  fundraisers: number;
  tickets_sold: number;
  revenue: number;
  donations: number;
  organizer_profiles: number;
};

export type PaginatedResult<T, S> = {
  items: T[];
  stats: S;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};
