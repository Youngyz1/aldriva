export const DEFAULT_WEBSITE_TIME_ZONE = "Africa/Abidjan";
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface ResolvedTodayHours {
  day: WeekdayKey;
  closed?: true;
  open?: string;
  close?: string;
  overnight?: boolean;
}

const SHORT_DAY_TO_KEY: Record<string, WeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

export function isValidWebsiteTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isOvernightWebsiteInterval(open: unknown, close: unknown): boolean {
  return isValidWebsiteTime(open) && isValidWebsiteTime(close) && close <= open;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function resolveTodayHours(
  hoursValue: unknown,
  timeZone = DEFAULT_WEBSITE_TIME_ZONE,
  now = new Date()
): ResolvedTodayHours | null {
  const hours = record(hoursValue);
  if (!hours) return null;

  let dayName: string;
  try {
    dayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(now).toLowerCase();
  } catch {
    dayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: DEFAULT_WEBSITE_TIME_ZONE }).format(now).toLowerCase();
  }
  const day = SHORT_DAY_TO_KEY[dayName];
  if (!day) return null;

  const row = record(hours[day]);
  if (!row) return null;
  if (row.closed === true) return { day, closed: true };
  if (!isValidWebsiteTime(row.open) || !isValidWebsiteTime(row.close)) return null;
  return {
    day,
    open: row.open,
    close: row.close,
    ...(isOvernightWebsiteInterval(row.open, row.close) ? { overnight: true } : {}),
  };
}

export interface OrderScheduleResult {
  isOpen: boolean;
  scheduledFor: string | null;
  nextOpenDay?: WeekdayKey;
  nextOpenTime?: string;
  blocked?: boolean;
  message?: string;
}

export function resolveOrderSchedule(
  hoursValue: unknown,
  timeZone = DEFAULT_WEBSITE_TIME_ZONE,
  now = new Date()
): OrderScheduleResult {
  const hours = record(hoursValue);
  if (!hours) {
    return { isOpen: true, scheduledFor: null };
  }

  const hasAnyDayConfigured = WEEKDAY_KEYS.some((day) => {
    const row = record(hours[day]);
    return row && (row.closed === true || (isValidWebsiteTime(row.open) && isValidWebsiteTime(row.close)));
  });
  if (!hasAnyDayConfigured) {
    return { isOpen: true, scheduledFor: null };
  }

  let dayFormatter: Intl.DateTimeFormat;
  let timeFormatter: Intl.DateTimeFormat;
  try {
    dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
    timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  } catch {
    dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: DEFAULT_WEBSITE_TIME_ZONE });
    timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DEFAULT_WEBSITE_TIME_ZONE });
  }

  const currentDayName = dayFormatter.format(now).toLowerCase();
  const currentDayKey = SHORT_DAY_TO_KEY[currentDayName];
  const currentTime = timeFormatter.format(now);

  const todayHours = currentDayKey ? record(hours[currentDayKey]) : null;
  const isTodayConfiguredOpen = todayHours && todayHours.closed !== true && isValidWebsiteTime(todayHours.open) && isValidWebsiteTime(todayHours.close);

  if (isTodayConfiguredOpen && todayHours) {
    const openTime = todayHours.open as string;
    const closeTime = todayHours.close as string;
    const isOvernight = isOvernightWebsiteInterval(openTime, closeTime);

    const currentlyOpen = isOvernight
      ? currentTime >= openTime || currentTime < closeTime
      : currentTime >= openTime && currentTime < closeTime;

    if (currentlyOpen) {
      return { isOpen: true, scheduledFor: null };
    }

    if (!isOvernight && currentTime < openTime) {
      const scheduledIso = formatTargetIso(now, 0, openTime, timeZone);
      return {
        isOpen: false,
        scheduledFor: scheduledIso,
        nextOpenDay: currentDayKey,
        nextOpenTime: openTime,
      };
    }
  }

  // Scan next 1..7 days
  for (let offset = 1; offset <= 7; offset++) {
    const candidateDate = new Date(now.getTime() + offset * 86400000);
    const candDayName = dayFormatter.format(candidateDate).toLowerCase();
    const candDayKey = SHORT_DAY_TO_KEY[candDayName];
    if (!candDayKey) continue;

    const row = record(hours[candDayKey]);
    if (row && row.closed !== true && isValidWebsiteTime(row.open) && isValidWebsiteTime(row.close)) {
      const openTime = row.open as string;
      const scheduledIso = formatTargetIso(now, offset, openTime, timeZone);
      return {
        isOpen: false,
        scheduledFor: scheduledIso,
        nextOpenDay: candDayKey,
        nextOpenTime: openTime,
      };
    }
  }

  return {
    isOpen: false,
    scheduledFor: null,
    blocked: true,
    message: "The restaurant has no upcoming opening hours scheduled within the next 7 days.",
  };
}

function formatTargetIso(baseDate: Date, dayOffset: number, timeStr: string, timeZone: string): string {
  const targetDate = new Date(baseDate.getTime() + dayOffset * 86400000);
  let ymdFormatter: Intl.DateTimeFormat;
  try {
    ymdFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone });
  } catch {
    ymdFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: DEFAULT_WEBSITE_TIME_ZONE });
  }
  const datePart = ymdFormatter.format(targetDate);
  return `${datePart}T${timeStr}:00.000Z`;
}

export interface ScheduleValidationResult {
  valid: boolean;
  scheduledFor?: string;
  error?: "invalid_format" | "lead_time_too_short" | "horizon_exceeded" | "outside_opening_hours";
  message?: string;
}

const PREVIOUS_DAY_MAP: Record<WeekdayKey, WeekdayKey> = {
  mon: "sun",
  tue: "mon",
  wed: "tue",
  thu: "wed",
  fri: "thu",
  sat: "fri",
  sun: "sat",
};

export function validateScheduledOrderTime(
  requestedIso: unknown,
  hoursValue: unknown,
  timeZone = DEFAULT_WEBSITE_TIME_ZONE,
  minLeadTimeMin = 30,
  maxHorizonDays = 7,
  now = new Date()
): ScheduleValidationResult {
  if (typeof requestedIso !== "string" || !requestedIso.trim()) {
    return { valid: false, error: "invalid_format", message: "Please specify a valid schedule time." };
  }

  const targetDate = new Date(requestedIso);
  if (isNaN(targetDate.getTime())) {
    return { valid: false, error: "invalid_format", message: "Invalid date format." };
  }

  const nowMs = now.getTime();
  const targetMs = targetDate.getTime();
  const minLeadMs = minLeadTimeMin * 60 * 1000;
  const maxHorizonMs = maxHorizonDays * 86400000;

  if (targetMs < nowMs + minLeadMs) {
    return {
      valid: false,
      error: "lead_time_too_short",
      message: `Orders must be scheduled at least ${minLeadTimeMin} minutes in advance.`,
    };
  }

  if (targetMs > nowMs + maxHorizonMs) {
    return {
      valid: false,
      error: "horizon_exceeded",
      message: `Orders cannot be scheduled more than ${maxHorizonDays} days in advance.`,
    };
  }

  const hours = record(hoursValue);
  if (!hours) {
    return { valid: true, scheduledFor: targetDate.toISOString() };
  }

  const hasAnyDayConfigured = WEEKDAY_KEYS.some((day) => {
    const row = record(hours[day]);
    return row && (row.closed === true || (isValidWebsiteTime(row.open) && isValidWebsiteTime(row.close)));
  });
  if (!hasAnyDayConfigured) {
    return { valid: true, scheduledFor: targetDate.toISOString() };
  }

  let dayFormatter: Intl.DateTimeFormat;
  let timeFormatter: Intl.DateTimeFormat;
  try {
    dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
    timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  } catch {
    dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: DEFAULT_WEBSITE_TIME_ZONE });
    timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DEFAULT_WEBSITE_TIME_ZONE });
  }

  const targetDayName = dayFormatter.format(targetDate).toLowerCase();
  const targetDayKey = SHORT_DAY_TO_KEY[targetDayName];
  const targetTime = timeFormatter.format(targetDate);

  if (!targetDayKey) {
    return { valid: false, error: "outside_opening_hours", message: "Selected time is outside business opening hours." };
  }

  const dayRow = record(hours[targetDayKey]);
  let isOpen = false;

  // 1. Check current day interval
  if (dayRow && dayRow.closed !== true && isValidWebsiteTime(dayRow.open) && isValidWebsiteTime(dayRow.close)) {
    const isOvernight = isOvernightWebsiteInterval(dayRow.open, dayRow.close);
    if (isOvernight) {
      if (targetTime >= dayRow.open || targetTime < dayRow.close) {
        isOpen = true;
      }
    } else {
      if (targetTime >= dayRow.open && targetTime < dayRow.close) {
        isOpen = true;
      }
    }
  }

  // 2. Check previous day overnight spillover (e.g. Fri 18:00-02:00 spilling into Sat morning)
  if (!isOpen) {
    const prevDayKey = PREVIOUS_DAY_MAP[targetDayKey];
    const prevDayRow = record(hours[prevDayKey]);
    if (
      prevDayRow &&
      prevDayRow.closed !== true &&
      isValidWebsiteTime(prevDayRow.open) &&
      isValidWebsiteTime(prevDayRow.close) &&
      isOvernightWebsiteInterval(prevDayRow.open, prevDayRow.close)
    ) {
      if (targetTime < prevDayRow.close) {
        isOpen = true;
      }
    }
  }

  if (!isOpen) {
    return { valid: false, error: "outside_opening_hours", message: "Selected time is outside business opening hours." };
  }

  return { valid: true, scheduledFor: targetDate.toISOString() };
}


