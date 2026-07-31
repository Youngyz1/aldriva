import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import AdminUserActions from "./AdminUserActions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function dateLabel(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function statusBadge(status: string) {
  return status === "active"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-red-100 text-red-600";
}

function roleBadge(role: string) {
  const classes: Record<string, string> = {
    admin: "bg-violet-100 text-violet-700",
    organizer: "bg-orange-100 text-orange-700",
    user: "bg-zinc-100 text-zinc-600",
  };
  return classes[role] ?? classes.user;
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const [{ data: authUserResult }, { data: profile }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(id),
    supabaseAdmin
      .from("profiles")
      .select("id, role, status, created_at, account_info, profile_photo")
      .eq("id", id)
      .maybeSingle(),
  ]);

  const authUser = authUserResult?.user;
  if (!authUser) notFound();

  const accountInfo = (profile?.account_info ?? {}) as {
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
    website?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  const metadata = authUser.user_metadata ?? {};
  const fullName =
    [accountInfo.firstName, accountInfo.lastName].filter(Boolean).join(" ").trim() ||
    String(metadata.display_name ?? metadata.full_name ?? metadata.name ?? "").trim() ||
    authUser.email?.split("@")[0] ||
    "User";
  const role = profile?.role ?? "user";
  const status = profile?.status ?? "active";

  const { data: organizers } = await supabaseAdmin
    .from("organizers")
    .select("id, name, bio, photo, banner, website, status, visibility, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  const organizerRows = organizers ?? [];
  const organizerIds = organizerRows.map((organizer) => organizer.id);

  const [eventsResult, fundraisersResult] = organizerIds.length > 0
    ? await Promise.all([
        supabaseAdmin
          .from("events")
          .select("id, title, slug, event_date, status, visibility, organizer_id, created_at")
          .in("organizer_id", organizerIds)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("fundraisers")
          .select("id, title, slug, organizer_id, raised, goal, created_at")
          .in("organizer_id", organizerIds)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const eventRows = eventsResult.data ?? [];
  const fundraiserRows = fundraisersResult.data ?? [];
  const fundraiserIds = fundraiserRows.map((fundraiser) => fundraiser.id);
  const eventIds = eventRows.map((event) => event.id);

  const [donationsResult, ticketSalesResult, ticketPurchasesResult] = await Promise.all([
    fundraiserIds.length > 0
      ? supabaseAdmin
          .from("donations")
          .select("id, fundraiser_id, donor_name, donor_email, amount, status, created_at")
          .in("fundraiser_id", fundraiserIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    eventIds.length > 0
      ? supabaseAdmin
          .from("ticket_orders")
          .select("id, event_id, buyer_name, buyer_email, quantity, total_amount, status, created_at")
          .in("event_id", eventIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    authUser.email
      ? supabaseAdmin
          .from("ticket_orders")
          .select("id, event_id, buyer_name, buyer_email, quantity, total_amount, status, created_at, events(title, slug)")
          .eq("buyer_email", authUser.email)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const donations = donationsResult.data ?? [];
  const ticketSales = ticketSalesResult.data ?? [];
  const ticketPurchases = ticketPurchasesResult.data ?? [];
  const donationsTotal = donations.reduce((sum, donation) => sum + Number(donation.amount ?? 0), 0);
  const ticketRevenue = ticketSales.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const ticketPurchaseTotal = ticketPurchases.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const organizerNameById = Object.fromEntries(organizerRows.map((organizer) => [organizer.id, organizer.name]));
  const fundraiserTitleById = Object.fromEntries(fundraiserRows.map((fundraiser) => [fundraiser.id, fundraiser.title]));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/admin/users" className="text-xs font-black uppercase tracking-wide text-violet-600 hover:text-violet-700">
              Back to users
            </Link>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{fullName}</h1>
            <p className="mt-2 text-sm font-medium text-zinc-500">{authUser.email}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${roleBadge(role)}`}>{role}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${statusBadge(status)}`}>{status}</span>
            </div>
          </div>
          <AdminUserActions userId={id} status={status} />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Organizations", organizerRows.length],
          ["Events", eventRows.length],
          ["Fundraisers", fundraiserRows.length],
          ["Donations", donations.length],
          ["Donation Total", money(donationsTotal)],
          ["Ticket Revenue", money(ticketRevenue)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-zinc-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black">Profile Information</h2>
          <dl className="mt-5 grid gap-4 text-sm">
            {[
              ["Full name", fullName],
              ["Email", authUser.email ?? "Unknown"],
              ["Phone", accountInfo.phone || "Not provided"],
              ["Company", accountInfo.company || "Not provided"],
              ["Website", accountInfo.website || "Not provided"],
              ["Location", [accountInfo.city, accountInfo.state, accountInfo.country].filter(Boolean).join(", ") || "Not provided"],
              ["Joined", dateLabel(profile?.created_at ?? authUser.created_at)],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                <dt className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</dt>
                <dd className="font-semibold text-zinc-800">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-black">Activity Summary</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Owned organizers", `${organizerRows.length}`],
              ["Owned events", `${eventRows.length}`],
              ["Owned fundraisers", `${fundraiserRows.length}`],
              ["Ticket purchases", `${ticketPurchases.length}`],
              ["Purchased total", money(ticketPurchaseTotal)],
              ["Tickets sold on owned events", `${ticketSales.reduce((sum, order) => sum + Number(order.quantity ?? 0), 0)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200/70">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p>
                <p className="mt-1 text-lg font-black text-zinc-950">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeader title="Organizations Owned By User" href="/admin/organizers" action="Moderate organizations" />
        <div className="mt-5 grid gap-3">
          {organizerRows.length === 0 ? (
            <Empty label="No organizations owned by this user." />
          ) : organizerRows.map((organizer) => (
            <div key={organizer.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-zinc-950">{organizer.name}</p>
                <p className="mt-1 text-sm text-zinc-500">{organizer.bio || "No bio"}</p>
                <p className="mt-2 text-xs font-bold uppercase text-zinc-400">{organizer.status ?? "pending"} / {organizer.visibility ?? "public"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/organizers/${organizer.id}`} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50">View Organization</Link>
                <Link href={`/organizers/${organizer.id}/edit`} className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-black text-orange-700 hover:bg-orange-50">Edit</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <TwoColumnSection
        leftTitle="Events Through Organizations"
        leftAction="View Events"
        leftHref="/admin/events"
        rightTitle="Fundraisers Through Organizations"
        rightAction="View Fundraisers"
        rightHref="/admin/fundraisers"
      >
        <div className="space-y-3">
          {eventRows.length === 0 ? <Empty label="No events owned through organizations." /> : eventRows.slice(0, 8).map((event) => (
            <CompactRow
              key={event.id}
              title={event.title}
              detail={`${organizerNameById[event.organizer_id] ?? "Organization"} / ${event.status ?? "approved"} / ${dateLabel(event.event_date)}`}
              href={event.slug ? `/events/${event.slug}` : undefined}
              label="View"
            />
          ))}
        </div>
        <div className="space-y-3">
          {fundraiserRows.length === 0 ? <Empty label="No fundraisers owned through organizations." /> : fundraiserRows.slice(0, 8).map((fundraiser) => (
            <CompactRow
              key={fundraiser.id}
              title={fundraiser.title}
              detail={`${organizerNameById[fundraiser.organizer_id] ?? "Organization"} / ${money(fundraiser.raised)} raised of ${money(fundraiser.goal)}`}
              href={fundraiser.slug ? `/fundraisers/${fundraiser.slug}` : undefined}
              label="View"
            />
          ))}
        </div>
      </TwoColumnSection>

      <TwoColumnSection
        leftTitle="Donations Received"
        rightTitle="Ticket Purchases"
      >
        <div className="space-y-3">
          {donations.length === 0 ? <Empty label="No donations received through owned fundraisers." /> : donations.slice(0, 8).map((donation) => (
            <CompactRow
              key={donation.id}
              title={donation.donor_name || "Anonymous"}
              detail={`${money(donation.amount)} / ${fundraiserTitleById[donation.fundraiser_id] ?? "Fundraiser"} / ${donation.status ?? "succeeded"}`}
            />
          ))}
        </div>
        <div className="space-y-3">
          {ticketPurchases.length === 0 ? <Empty label="No ticket purchases found for this email." /> : ticketPurchases.slice(0, 8).map((order) => {
            const eventRelation = Array.isArray(order.events) ? order.events[0] : order.events;
            return (
              <CompactRow
                key={order.id}
                title={eventRelation?.title || "Ticket order"}
                detail={`${order.quantity} ticket(s) / ${money(order.total_amount)} / ${order.status}`}
                href={eventRelation?.slug ? `/events/${eventRelation.slug}` : undefined}
                label="Event"
              />
            );
          })}
        </div>
      </TwoColumnSection>
    </div>
  );
}

function SectionHeader({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-black">{title}</h2>
      {href && action && <Link href={href} className="text-sm font-black text-violet-700 hover:text-violet-800">{action}</Link>}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-center text-sm font-semibold text-zinc-500">
      {label}
    </div>
  );
}

function CompactRow({
  title,
  detail,
  href,
  label = "View",
}: {
  title: string;
  detail: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4">
      <div className="min-w-0">
        <p className="truncate font-black text-zinc-950">{title}</p>
        <p className="mt-1 truncate text-sm text-zinc-500">{detail}</p>
      </div>
      {href && (
        <Link href={href} className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50">
          {label}
        </Link>
      )}
    </div>
  );
}

function TwoColumnSection({
  leftTitle,
  rightTitle,
  leftAction,
  rightAction,
  leftHref,
  rightHref,
  children,
}: {
  leftTitle: string;
  rightTitle: string;
  leftAction?: string;
  rightAction?: string;
  leftHref?: string;
  rightHref?: string;
  children: [React.ReactNode, React.ReactNode];
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeader title={leftTitle} href={leftHref} action={leftAction} />
        <div className="mt-5">{children[0]}</div>
      </div>
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeader title={rightTitle} href={rightHref} action={rightAction} />
        <div className="mt-5">{children[1]}</div>
      </div>
    </section>
  );
}
