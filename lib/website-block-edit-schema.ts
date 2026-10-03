/**
 * lib/website-block-edit-schema.ts
 *
 * Controlled editable-property registry for Batch G.
 * Defines which paths may be edited per block type.
 * No arbitrary property exposure, no React, no DB.
 */

import type { BlockType } from "./website-blocks";

export type EditFieldType = "text" | "textarea" | "image" | "action" | "icon" | "url";

export interface EditFieldDef {
  type: EditFieldType;
  label: string;
}

// Registry: blockType -> allowed paths (with item placeholder)
// For repeatable items, path uses `items[<id>].field` pattern where <id> is stable item id.
// We store the field definition for the item field, not the collection.
export const BLOCK_EDIT_SCHEMA: Record<BlockType, Record<string, EditFieldDef>> = {
  hero: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "badge": { type: "text", label: "Badge" },
    "ctaLabel": { type: "text", label: "CTA Label" },
    "ctaHref": { type: "action", label: "CTA Destination" },
    "secondaryCtaLabel": { type: "text", label: "Secondary CTA Label" },
    "secondaryCtaHref": { type: "action", label: "Secondary CTA Destination" },
    "backgroundImage": { type: "image", label: "Background Image" },
  },
  features: {
    "heading": { type: "text", label: "Section Heading" },
    "subheading": { type: "textarea", label: "Section Subheading" },
    "items[].title": { type: "text", label: "Item Title" },
    "items[].description": { type: "textarea", label: "Item Description" },
    "items[].icon": { type: "icon", label: "Item Icon" },
    "items[].href": { type: "action", label: "Item Link" },
  },
  about: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "story": { type: "textarea", label: "Story" },
    "mission": { type: "textarea", label: "Mission" },
    "founderName": { type: "text", label: "Founder Name" },
    "founderRole": { type: "text", label: "Founder Role" },
    "founderImage": { type: "image", label: "Founder Image" },
    "highlights[].label": { type: "text", label: "Highlight Label" },
    "highlights[].value": { type: "text", label: "Highlight Value" },
  },
  gallery: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "images[].src": { type: "image", label: "Image" },
    "images[].alt": { type: "text", label: "Alt Text" },
    "images[].caption": { type: "text", label: "Caption" },
  },
  testimonials: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "items[].quote": { type: "textarea", label: "Quote" },
    "items[].author": { type: "text", label: "Author" },
    "items[].role": { type: "text", label: "Role" },
    "items[].avatar": { type: "image", label: "Avatar" },
  },
  contact: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "email": { type: "text", label: "Email" },
    "phone": { type: "text", label: "Phone" },
    "address": { type: "text", label: "Address" },
    "hours": { type: "text", label: "Hours" },
  },
  faq: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "items[].question": { type: "text", label: "Question" },
    "items[].answer": { type: "textarea", label: "Answer" },
  },
  events_embed: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
  },
  products_embed: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
  },
  fundraiser_embed: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
  },
  rich_text: {
    "html": { type: "textarea", label: "Content" },
  },
  cta_banner: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
    "ctaLabel": { type: "text", label: "CTA Label" },
    "ctaHref": { type: "action", label: "CTA Destination" },
  },
  services_embed: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
  },
  menu_embed: {
    "heading": { type: "text", label: "Heading" },
    "subheading": { type: "textarea", label: "Subheading" },
  },
};

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeSegment(seg: string): boolean {
  if (FORBIDDEN_SEGMENTS.has(seg)) return false;
  if (seg.includes("__proto__") || seg.includes("constructor") || seg.includes("prototype")) return false;
  return true;
}

/**
 * Normalizes a path that may contain stable IDs in brackets to a schema key.
 * e.g. "items[abc-123].title" -> "items[].title"
 *      "images[xyz].alt" -> "images[].alt"
 */
function toSchemaKey(path: string): string {
  return path.replace(/\[[^\]]+\]/g, "[]");
}

export function isEditablePath(blockType: BlockType, path: string): boolean {
  if (!path || typeof path !== "string") return false;
  const segments = path.split(".");
  for (const seg of segments) {
    // seg may be like "items[abc-123]" -> extract base "items"
    const base = seg.replace(/\[[^\]]+\]/g, "");
    if (!sanitizeSegment(base)) return false;
    if (base && !/^[a-zA-Z0-9_]+$/.test(base)) return false;
  }
  // Check against schema
  const schemaKey = toSchemaKey(path);
  const blockSchema = BLOCK_EDIT_SCHEMA[blockType];
  if (!blockSchema) return false;
  return schemaKey in blockSchema;
}

export function getFieldDef(blockType: BlockType, path: string): EditFieldDef | null {
  const schemaKey = toSchemaKey(path);
  return BLOCK_EDIT_SCHEMA[blockType]?.[schemaKey] ?? null;
}

export function listEditablePaths(blockType: BlockType): string[] {
  return Object.keys(BLOCK_EDIT_SCHEMA[blockType] ?? {});
}

// Safe value access using stable IDs for repeatable items
export function getElementValue(block: Record<string, unknown>, path: string): unknown {
  if (!isEditablePath(block.type as BlockType, path)) return undefined;
  const parts = path.split(".");
  let cur: unknown = block;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    const m = part.match(/^([a-zA-Z0-9_]+)\[([^\]]+)\]$/);
    if (m) {
      const arrKey = m[1];
      const id = m[2];
      if (!sanitizeSegment(arrKey) || !sanitizeSegment(id)) return undefined;
      const arr = (cur as Record<string, unknown>)[arrKey];
      if (!Array.isArray(arr)) return undefined;
      cur = arr.find((it: unknown) => (it as Record<string, unknown>)?.id === id);
      if (cur == null) {
        // Fallback to numeric index for legacy data (only if id not found)
        const idx = Number(id);
        if (!Number.isNaN(idx) && idx >= 0 && idx < arr.length) cur = arr[idx];
        else return undefined;
      }
    } else {
      if (!sanitizeSegment(part)) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

export function setElementValue(block: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  if (!isEditablePath(block.type as BlockType, path)) return block;
  // Deep clone via JSON for immutability
  const cloned: Record<string, unknown> = JSON.parse(JSON.stringify(block));
  const parts = path.split(".");
  let cur: Record<string, unknown> = cloned;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const m = part.match(/^([a-zA-Z0-9_]+)\[([^\]]+)\]$/);
    if (m) {
      const arrKey = m[1];
      const id = m[2];
      if (!sanitizeSegment(arrKey) || !sanitizeSegment(id)) return block;
      const arr = cur[arrKey] as unknown[];
      if (!Array.isArray(arr)) return block;
      const idx = arr.findIndex((it) => (it as Record<string, unknown>)?.id === id);
      let targetIdx = idx;
      if (targetIdx === -1) {
        const num = Number(id);
        if (!Number.isNaN(num) && num >= 0 && num < arr.length) targetIdx = num;
        else return block;
      }
      if (isLast) {
        // This case shouldn't happen for our schema (path ends with field, not collection)
        return block;
      } else {
        // Next part is the field inside the item
        const nextPart = parts[i + 1];
        if (i + 1 === parts.length - 1) {
          // Last field is inside item: items[id].title
          if (!sanitizeSegment(nextPart)) return block;
          (arr[targetIdx] as Record<string, unknown>)[nextPart] = value;
          return cloned;
        } else {
          // Deeper nesting not used in current schema, but support generically
          cur = arr[targetIdx] as Record<string, unknown>;
          // Skip next iteration handling? We'll handle by advancing
          // To keep simple, we treat the remaining path as field on the item
          // Actually this branch handles paths like items[id].title where we have already consumed items[id],
          // next loop will handle title
          cur = arr[targetIdx] as Record<string, unknown>;
          continue;
        }
      }
    } else {
      if (!sanitizeSegment(part)) return block;
      if (isLast) {
        cur[part] = value;
        return cloned;
      } else {
        const next = cur[part];
        if (next == null || typeof next !== "object") return block;
        // Clone nested object to preserve immutability (already deep cloned)
        cur = next as Record<string, unknown>;
      }
    }
  }
  return cloned;
}
