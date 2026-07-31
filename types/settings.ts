// types/settings.ts

export interface AddressInfo {
  address: string;
  address2: string;
  city: string;
  country: string;
  zip: string;
  state: string;
}

export interface AccountInfo {
  prefix: string;
  firstName: string;
  lastName: string;
  suffix: string;
  homePhone: string;
  cellPhone: string;
  jobTitle: string;
  company: string;
  website: string;
  blog: string;
  homeAddress: AddressInfo;
  billingAddress: AddressInfo;
  shippingAddress: AddressInfo;
  workAddress: AddressInfo;
}

export interface NotificationPreferences {
  notify_ticket_purchase: boolean;
  notify_donation: boolean;
  notify_event_reminder: boolean;
  notify_marketing?: boolean;
  notify_security_alerts?: boolean;
}

export interface PrivacySettings {
  profile_visibility: 'public' | 'private';
  show_email: boolean;
  show_organized_events: boolean;
  show_donations: boolean;
  allow_search_indexing: boolean;
}

export interface Profile {
  id: string;
  role: 'admin' | 'organizer' | 'user';
  status: 'active' | 'suspended';
  created_at: string;
  updated_at?: string;
  profile_photo: string | null;
  account_info: AccountInfo;
  preferences: NotificationPreferences;
  privacy_settings?: PrivacySettings;
}

export const defaultAddress: AddressInfo = {
  address: "",
  address2: "",
  city: "",
  country: "United States",
  zip: "",
  state: "",
};

export const defaultAccountInfo: AccountInfo = {
  prefix: "",
  firstName: "",
  lastName: "",
  suffix: "",
  homePhone: "",
  cellPhone: "",
  jobTitle: "",
  company: "",
  website: "",
  blog: "",
  homeAddress: defaultAddress,
  billingAddress: defaultAddress,
  shippingAddress: defaultAddress,
  workAddress: defaultAddress,
};

