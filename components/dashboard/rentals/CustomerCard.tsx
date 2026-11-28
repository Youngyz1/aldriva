/**
 * components/dashboard/rentals/CustomerCard.tsx
 *
 * Customer/driver summary for the rental booking detail page. Matches the
 * bordered-card style introduced by FinancialsCard.tsx: rounded-xl border,
 * white surface, the same spacing/typography scale. Pure presentational —
 * no fetching, no client state.
 */

import {
  IconMail as Mail,
  IconPhone as Phone,
  IconId as IdCard,
  IconCalendar as Calendar,
  IconWorld as World,
} from "@tabler/icons-react";

export interface CustomerCardProps {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  source: string | null;
  canViewDriverPII: boolean;
  driverLicenseNumber?: string | null;
  driverLicenseCountry?: string | null;
  driverDob?: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

function calculateAge(dobIso: string, now: Date = new Date()): number | null {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function formatDob(dobIso: string): string {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return dobIso;
  return dob.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function sourceLabel(source: string | null): string {
  if (!source) return "Staff booking";
  if (source === "online") return "Online booking";
  if (source === "staff") return "Staff booking";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function CustomerCard({
  customerName,
  customerEmail,
  customerPhone,
  source,
  canViewDriverPII,
  driverLicenseNumber,
  driverLicenseCountry,
  driverDob,
}: CustomerCardProps) {
  const age = canViewDriverPII && driverDob ? calculateAge(driverDob) : null;
  const hasDriverBlock =
    canViewDriverPII && Boolean(driverLicenseNumber || driverLicenseCountry || driverDob);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white">
          {initials(customerName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-zinc-900 truncate">{customerName}</p>
          <p className="text-xs font-semibold text-zinc-400">{sourceLabel(source)}</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-3">
        {customerEmail && (
          <a
            href={`mailto:${customerEmail}`}
            className="flex items-center gap-2 text-sm text-zinc-700 hover:text-brand-700 transition"
          >
            <Mail className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{customerEmail}</span>
          </a>
        )}
        {customerPhone && (
          <a
            href={`tel:${customerPhone}`}
            className="flex items-center gap-2 text-sm text-zinc-700 hover:text-brand-700 transition"
          >
            <Phone className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{customerPhone}</span>
          </a>
        )}
        {!customerEmail && !customerPhone && (
          <p className="text-xs text-zinc-400 italic">No contact details on file.</p>
        )}
      </div>

      {hasDriverBlock && (
        <div className="space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Driver</p>
          {driverLicenseNumber && (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <IdCard className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="font-mono">{driverLicenseNumber}</span>
              {driverLicenseCountry && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  <World className="h-3 w-3" />
                  {driverLicenseCountry}
                </span>
              )}
            </div>
          )}
          {driverDob && (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Calendar className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span>{formatDob(driverDob)}</span>
              {age !== null && <span className="text-xs text-zinc-400">(Age {age})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
