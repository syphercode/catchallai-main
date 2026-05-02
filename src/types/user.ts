// Shape of the authenticated user returned by `base44.auth.me()`.
// Commonly-accessed fields are typed explicitly so callers get autocomplete
// and real type checks. The tail uses `unknown` (not `any`) so anything not
// listed forces the caller to narrow before use — matches the convention
// used elsewhere in `src/types/`.

export type User = {
  // Identity & role
  id?: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  role?: string;
  social_media_role?: string;
  business_id?: string;
  current_business_id?: string;
  department?: string | null;

  // Profile
  phone?: string;
  company?: string;
  website?: string;
  bio?: string;
  location?: string;
  job_title?: string;
  status?: string;
  status_emoji?: string;
  timezone?: string;
  language?: string;
  created_date?: string;

  // Appearance & 2FA
  theme?: string;
  two_factor_enabled?: boolean;

  // Notification flags
  email_notifications?: boolean;
  marketing_emails?: boolean;
  weekly_digest?: boolean;
  messages_enabled?: boolean;
  mentions_enabled?: boolean;
  updates_enabled?: boolean;
  sound_enabled?: boolean;
  desktop_notifications_enabled?: boolean;
  do_not_disturb_enabled?: boolean;
  dnd_start_time?: string;
  dnd_end_time?: string;
  muted_channels?: string[];

  // Integrations
  google_calendar_connected?: boolean;
  google_calendar_email?: string;

  // Nested settings — shapes vary by caller, narrow before use
  preferences?: Record<string, unknown>;
  notification_preferences?: Record<string, unknown>;
  notification_settings?: Record<string, unknown>;
  api_keys?: Array<{
    id: string;
    name: string;
    key: string;
    created: string;
    lastUsed?: string | null;
  }>;
  favorite_links?: Array<{ page: string; label: string }>;

  // Anything else returned by the server but not listed above.
  [key: string]: unknown;
};
