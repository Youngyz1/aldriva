/**
 * lib/website-hydration.ts
 *
 * Approved business data hydration for template instantiation (Stage E token phase, but
 * needed atomically for Stage C/E flow). Only whitelisted organizer fields are hydrated.
 * No arbitrary field access, no external APIs, no file uploads inside transaction.
 */

import type { Block } from "./website-blocks";

export const ALLOWED_HYDRATION_FIELDS = [
  "organizer.name",
  "organizer.bio",
  "organizer.website",
  "organizer.contact_email",
  "organizer.photo",
  "organizer.slug",
] as const;

export type HydrationContext = {
  organizerName?: string | null;
  organizerBio?: string | null;
  organizerWebsite?: string | null;
  organizerContactEmail?: string | null;
  organizerPhoto?: string | null;
  organizerSlug?: string | null;
};

export function buildHydrationContext(organizerRow: Record<string, unknown> | null): HydrationContext {
  if (!organizerRow) return {};
  return {
    organizerName: typeof organizerRow.name === "string" ? organizerRow.name : null,
    organizerBio: typeof organizerRow.bio === "string" ? organizerRow.bio : null,
    organizerWebsite: typeof organizerRow.website === "string" ? organizerRow.website : null,
    organizerContactEmail: typeof organizerRow.contact_email === "string" ? organizerRow.contact_email : null,
    organizerPhoto: typeof organizerRow.photo === "string" ? organizerRow.photo : null,
    organizerSlug: typeof organizerRow.slug === "string" ? organizerRow.slug : null,
  };
}

const TOKEN_MAP: Record<string, keyof HydrationContext> = {
  "{{organizer.name}}": "organizerName",
  "{{organizer.bio}}": "organizerBio",
  "{{organizer.website}}": "organizerWebsite",
  "{{organizer.contact_email}}": "organizerContactEmail",
  "{{organizer.photo}}": "organizerPhoto",
  "{{organizer.slug}}": "organizerSlug",
  // Business aliases (map to same organizer fields for now)
  "{{business.name}}": "organizerName",
  "{{business.description}}": "organizerBio",
  "{{business.website}}": "organizerWebsite",
  "{{business.email}}": "organizerContactEmail",
  "{{business.logo}}": "organizerPhoto",
};

function hydrateString(value: string, ctx: HydrationContext): string {
  let result = value;
  for (const [token, key] of Object.entries(TOKEN_MAP)) {
    if (result.includes(token)) {
      const replacement = ctx[key] ?? "";
      result = result.split(token).join(replacement);
    }
  }
  return result;
}

function hydrateValue(value: unknown, ctx: HydrationContext): unknown {
  if (typeof value === "string") {
    return hydrateString(value, ctx);
  }
  if (Array.isArray(value)) {
    return value.map((v) => hydrateValue(v, ctx));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = hydrateValue(v, ctx);
    }
    return out;
  }
  return value;
}

export function hydrateBlocks(blocks: Block[], ctx: HydrationContext): Block[] {
  if (!ctx || Object.keys(ctx).length === 0) return blocks;
  return blocks.map((block) => hydrateValue(block, ctx) as Block);
}

export function hasUnresolvedTokens(blocks: Block[]): boolean {
  const str = JSON.stringify(blocks);
  return str.includes("{{");
}
