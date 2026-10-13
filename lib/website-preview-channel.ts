export const WEBSITE_PREVIEW_MESSAGE_SOURCE = "aldriva-website-v2-preview";

export interface WebsitePreviewReadyMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "ready";
}

export interface WebsitePreviewHelloMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "hello";
  websiteId: string;
}

export interface WebsitePreviewDraftMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "draft";
  websiteId: string;
  content: Record<string, unknown>;
  pageSlug: string;
}

export interface WebsitePreviewPageMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "page";
  websiteId: string;
  pageSlug: string;
}

export interface WebsitePreviewOpenMenuEditorMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "open_menu_editor";
}

export interface WebsitePreviewUpdateMenuItemsMessage {
  source: typeof WEBSITE_PREVIEW_MESSAGE_SOURCE;
  kind: "update_menu_items";
  websiteId: string;
  menuItems: Array<{
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    imageUrl?: string | null;
    sectionName: string;
  }>;
}

export type WebsitePreviewMessage =
  | WebsitePreviewReadyMessage
  | WebsitePreviewHelloMessage
  | WebsitePreviewDraftMessage
  | WebsitePreviewPageMessage
  | WebsitePreviewOpenMenuEditorMessage
  | WebsitePreviewUpdateMenuItemsMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWebsitePreviewMessage(data: unknown): data is WebsitePreviewMessage {
  if (!isRecord(data) || data.source !== WEBSITE_PREVIEW_MESSAGE_SOURCE) return false;
  if (data.kind === "ready") return true;
  if (data.kind === "open_menu_editor") return true;
  if (data.kind === "hello") return typeof data.websiteId === "string" && data.websiteId.length > 0;
  if (data.kind === "page") {
    return typeof data.websiteId === "string" && data.websiteId.length > 0 &&
      typeof data.pageSlug === "string" && data.pageSlug.length > 0;
  }
  if (data.kind === "draft") {
    return typeof data.websiteId === "string" && data.websiteId.length > 0 &&
      typeof data.pageSlug === "string" && data.pageSlug.length > 0 &&
      isRecord(data.content);
  }
  if (data.kind === "update_menu_items") {
    return typeof data.websiteId === "string" && data.websiteId.length > 0 &&
      Array.isArray(data.menuItems);
  }
  return false;
}

export function isSameOriginWebsitePreviewMessage(
  eventOrigin: string,
  currentOrigin: string
): boolean {
  return eventOrigin.length > 0 && eventOrigin === currentOrigin;
}
