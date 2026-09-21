import { supabaseAdmin } from "@/lib/dashboard-context";
import type { DashboardContext } from "@/lib/dashboard-context";

export type MyThingsEntity = { id: string; title: string; slug?: string | null; status?: string | null; created_at: string; href: string };
export type MyThingsSection = { key: string; label: string; items: MyThingsEntity[]; listHref: string; createHref: string };

export async function getMyThingsData(ctx: DashboardContext): Promise<{ sections: MyThingsSection[]; hasAny: boolean }> {
  const { user } = ctx;
  // Personal-only: entities where organizer_id IS NULL and owner/user_id = current user.
  // Organizer-owned entities are NOT shown as personal; they are reached via My Organizers → Organizer workspace.
  const [personalEventsRes, personalFundraisersRes, personalBusinessesRes, articlesRes, productsRes] = await Promise.all([
    supabaseAdmin.from("events").select("id, title, slug, status, created_at").eq("user_id", user.id).is("organizer_id", null).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("fundraisers").select("id, title, slug, status, created_at").eq("user_id", user.id).is("organizer_id", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("businesses").select("id, name, slug, status, created_at").eq("owner_id", user.id).is("organizer_id", null).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("articles").select("id, title, slug, status, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("products").select("id, name, slug, status, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  const organizersSection: MyThingsSection = {
    key: "organizers",
    label: "My Organizers",
    listHref: "/dashboard/organizations",
    createHref: "/create-organizer",
    items: (ctx.organizers ?? []).map((o) => ({ id: o.id, title: o.name, slug: o.slug ?? undefined, status: o.status ?? undefined, created_at: (o as {created_at?:string}).created_at ?? new Date().toISOString(), href: `/dashboard/org/${o.id}/overview` })),
  };

  const personalSections: MyThingsSection[] = [
    {
      key: "fundraisers",
      label: "My Campaigns",
      listHref: "/dashboard/fundraisers",
      createHref: "/create-fundraiser",
      items: ((personalFundraisersRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {id:string; title:string; slug:string; status:string; created_at:string};
        return { id: x.id, title: x.title, slug: x.slug, status: x.status, created_at: x.created_at, href: `/dashboard/fundraisers/${x.id}/overview` };
      }),
    },
    {
      key: "events",
      label: "My Events",
      listHref: "/dashboard/events",
      createHref: "/create-event",
      items: ((personalEventsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {id:string; title:string; slug:string; status:string; created_at:string};
        return { id: x.id, title: x.title, slug: x.slug, status: x.status, created_at: x.created_at, href: `/dashboard/events/${x.id}/overview` };
      }),
    },
    {
      key: "businesses",
      label: "My Businesses",
      listHref: "/dashboard/businesses",
      createHref: "/dashboard/businesses/new",
      items: ((personalBusinessesRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {id:string; name:string; slug:string; status:string; created_at:string};
        return { id: x.id, title: x.name, slug: x.slug, status: x.status, created_at: x.created_at, href: `/dashboard/businesses/${x.id}/overview` };
      }),
    },
    {
      key: "articles",
      label: "My Articles",
      listHref: "/dashboard/articles",
      createHref: "/dashboard/articles/new",
      items: ((articlesRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {id:string; title:string; slug:string; status:string; created_at:string};
        return { id: x.id, title: x.title, slug: x.slug, status: x.status, created_at: x.created_at, href: `/dashboard/articles/${x.id}/edit` };
      }),
    },
    {
      key: "products",
      label: "My Products",
      listHref: "/dashboard/products",
      createHref: "/dashboard/products/new",
      items: ((productsRes.data as unknown[]) ?? []).map((r: unknown) => {
        const x = r as {id:string; name:string; slug:string; status:string; created_at:string};
        return { id: x.id, title: x.name, slug: x.slug, status: x.status, created_at: x.created_at, href: `/dashboard/products/${x.id}/edit` };
      }),
    },
  ];

  // Only show personal sections that actually have items (per spec: don't display empty My Campaigns etc.)
  const visiblePersonalSections = personalSections.filter((s) => s.items.length > 0);

  const sections: MyThingsSection[] = [organizersSection, ...visiblePersonalSections];

  // hasAny true if user has any organizer OR any personal entity
  const hasAny = sections.some((s) => s.items.length > 0);
  // For global empty state, we consider both organizers and personal; if none, show Create New
  return { sections, hasAny };
}
