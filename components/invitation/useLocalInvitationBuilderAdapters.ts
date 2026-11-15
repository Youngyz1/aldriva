"use client";

/**
 * components/invitation/useLocalInvitationBuilderAdapters.ts
 *
 * Phase 5: the single place that ties the generic local-draft store
 * (lib/invitation-local-draft.ts) to InvitationPageBuilder's existing
 * props. Owns: the active draftId, loading the saved draft (if any) on
 * mount, the in-session blob map, and every InvitationBuilderPersistence
 * handler. InvitationPageBuilder and its sections know nothing about
 * IndexedDB — they only ever see `initialData`, `onLocalSave`, and the
 * context handlers this hook produces.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitationBuilderPersistence } from "./InvitationBuilderPersistenceContext";
import {
  createInvitationLocalDraft,
  updateInvitationLocalDraft,
  loadInvitationLocalDraft,
  saveInvitationLocalDraft,
  captureInvitationLocalDraftImages,
  restoreInvitationLocalDraftImages,
  getActiveInvitationDraftId,
  setActiveInvitationDraftId,
  requestPersistentStorage,
  getStorageEstimate,
  canAddGalleryImage,
  isWithinImageBudget,
  validateLocalImageFile,
  onInvitationLocalDraftChangedElsewhere,
  type InvitationLocalDraftPayload,
} from "@/lib/invitation-local-draft";
import { getUploadErrorMessage } from "@/lib/uploadImage";
import type { DraftEnvelope } from "@/lib/local-draft-envelope";
import { getInvitationTemplateCreateHref } from "@/lib/invitation-template-marketplace-routes";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import { supabase } from "@/lib/supabase";

export interface LocalBuilderInitialData {
  draft: Record<string, unknown>;
  event: {
    id: string;
    title: string;
    kind: string;
    event_date: string;
    venue: string | null;
    street_address: string | null;
    city: string | null;
  };
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
}

function emptyBuilderDraft(templateId: string): Record<string, unknown> {
  return {
    id: "",
    event_id: "",
    template_id: templateId,
    locale: "en",
    page_status: "draft",
    published_at: null,
    published_snapshot: null,
    blocks_layout: null,
    display_title: null,
    eyebrow: null,
    host_names: null,
    story_headline: null,
    story_text: null,
    story_image_url: null,
    hero_image_url: null,
    hero_image_alt: null,
    hero_image_focus_x: 50,
    hero_image_focus_y: 50,
    scroll_prompt: null,
    venue_name: null,
    address: null,
    parking_notes: null,
    timezone: "",
    dress_code: null,
    dress_code_notes: null,
    additional_notes: null,
    hashtag: null,
    music_audio_url: null,
    music_title: null,
    music_links: [],
    partner1_name: null,
    partner2_name: null,
    family_note: null,
    wedding_subtype: null,
    registry_note: null,
    celebrant_name: null,
    age_milestone: null,
    theme: null,
    gift_note: null,
    schedule: null,
    gallery: null,
    venues: null,
    accommodations: null,
    colors_of_the_day: null,
    wedding_story: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function toEvent(payload: Pick<InvitationLocalDraftPayload, "title" | "eventDate" | "venue" | "address" | "city">, draftId: string): LocalBuilderInitialData["event"] {
  return {
    id: draftId,
    title: payload.title || "",
    kind: "invitation",
    event_date: payload.eventDate ?? "",
    venue: payload.venue,
    street_address: payload.address,
    city: payload.city,
  };
}

export interface UseLocalInvitationBuilderAdaptersResult {
  status: "loading" | "ready";
  draftId: string;
  initialData: LocalBuilderInitialData;
  localPersistence: InvitationBuilderPersistence;
  onLocalSave: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  changedElsewhere: boolean;
  dismissChangedElsewhere: () => void;
}

/** One client-generated UUID per anonymous builder visit for this templateId, persisted via a small marker key so a refresh finds the same draft. */
function resolveDraftId(templateId: string): string {
  const existing = getActiveInvitationDraftId();
  if (existing) return existing;
  const fresh = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${templateId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  setActiveInvitationDraftId(fresh);
  return fresh;
}

export function useLocalInvitationBuilderAdapters(templateId: string): UseLocalInvitationBuilderAdaptersResult {
  const router = useRouter();
  const [draftId] = useState<string>(() => resolveDraftId(templateId));

  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [initialData, setInitialData] = useState<LocalBuilderInitialData>({
    draft: emptyBuilderDraft(templateId),
    event: toEvent({ title: "", eventDate: null, venue: null, address: null, city: null }, draftId),
    hasUnpublishedChanges: false,
    publishedAt: null,
  });
  const [changedElsewhere, setChangedElsewhere] = useState(false);

  const envelopeRef = useRef<DraftEnvelope<InvitationLocalDraftPayload> | null>(null);
  const activeTemplateIdRef = useRef<string>(templateId);
  const basicsRef = useRef<Pick<InvitationLocalDraftPayload, "title" | "eventDate" | "venue" | "address" | "city">>({
    title: "", eventDate: null, venue: null, address: null, city: null,
  });
  /** blob: URL -> Blob for every image picked this session, regardless of field. */
  const blobsByUrlRef = useRef<Map<string, Blob>>(new Map());
  /** Which image field keys already have a persisted blob (grows as images are captured on save). */
  const imageKeysRef = useRef<Record<string, string>>({});

  // ── Load on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const envelope = await loadInvitationLocalDraft(draftId);
      if (cancelled) return;
      if (!envelope) {
        setStatus("ready");
        return;
      }
      envelopeRef.current = envelope;
      basicsRef.current = {
        title: envelope.payload.title,
        eventDate: envelope.payload.eventDate,
        venue: envelope.payload.venue,
        address: envelope.payload.address,
        city: envelope.payload.city,
      };
      imageKeysRef.current = envelope.payload.images;
      const restoredDraft = await restoreInvitationLocalDraftImages(draftId, envelope.payload.builderDraft, envelope.payload.images);
      if (cancelled) return;

      const storedTemplateId = envelope.payload.templateId;
      const effectiveTemplateId = storedTemplateId !== templateId ? templateId : storedTemplateId;
      activeTemplateIdRef.current = effectiveTemplateId;

      if (storedTemplateId !== templateId) {
        // Route wins on entry if different: swap the template and keep user content fields
        const currentBlocksLayout = (restoredDraft.blocks_layout || null) as Parameters<typeof legacyInvitationTemplateToLayout>[1];
        const updatedBuilderDraft = {
          ...restoredDraft,
          template_id: templateId,
          blocks_layout: legacyInvitationTemplateToLayout(templateId, currentBlocksLayout),
        };
        const updatedPayload: InvitationLocalDraftPayload = {
          ...envelope.payload,
          templateId,
          builderDraft: updatedBuilderDraft,
        };
        envelopeRef.current = updateInvitationLocalDraft(envelope, updatedPayload);
        void saveInvitationLocalDraft(envelopeRef.current);
      }

      const activeBlocksLayout = (restoredDraft.blocks_layout || null) as Parameters<typeof legacyInvitationTemplateToLayout>[1];
      setInitialData({
        draft: {
          ...emptyBuilderDraft(effectiveTemplateId),
          ...restoredDraft,
          template_id: effectiveTemplateId,
          blocks_layout: legacyInvitationTemplateToLayout(effectiveTemplateId, activeBlocksLayout),
          id: draftId,
        },
        event: toEvent(envelope.payload, draftId),
        hasUnpublishedChanges: false,
        publishedAt: null,
      });
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // draftId/templateId are stable for the lifetime of this hook instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Multi-tab notice ─────────────────────────────────────────────────
  useEffect(() => {
    return onInvitationLocalDraftChangedElsewhere(draftId, () => setChangedElsewhere(true));
  }, [draftId]);

  const onLocalSave = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const images = await captureInvitationLocalDraftImages(draftId, payload, blobsByUrlRef.current);
        imageKeysRef.current = { ...imageKeysRef.current, ...images };
        const currentTemplateId = (typeof payload.template_id === "string" && payload.template_id)
          ? payload.template_id
          : activeTemplateIdRef.current;
        activeTemplateIdRef.current = currentTemplateId;
        const fullPayload: InvitationLocalDraftPayload = {
          templateId: currentTemplateId,
          ...basicsRef.current,
          builderDraft: payload,
          images: imageKeysRef.current,
        };
        envelopeRef.current = envelopeRef.current
          ? updateInvitationLocalDraft(envelopeRef.current, fullPayload)
          : createInvitationLocalDraft(draftId, fullPayload);
        await saveInvitationLocalDraft(envelopeRef.current);
        void requestPersistentStorage();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Could not save locally." };
      }
    },
    [draftId]
  );

  const handleLocalImageCropped = useCallback(
    (fieldKey: string, file: File, previewUrl: string, onUploaded: (url: string) => void, onError?: (message: string) => void) => {
      const invalid = validateLocalImageFile(file);
      if (invalid) {
        onError?.(getUploadErrorMessage(invalid));
        return;
      }
      // Keyed by the stable field path (not previewUrl, which is a fresh
      // blob: URL every crop) so re-cropping the same field overwrites this
      // entry in place instead of leaking the old one, and so
      // captureInvitationLocalDraftImages can find the blob by field key
      // even though the field's own value is the only other thing that
      // matches a bare value-based lookup.
      blobsByUrlRef.current.set(fieldKey, file);
      onUploaded(previewUrl);
    },
    []
  );

  const handleLocalGalleryImageCropped = useCallback(
    async (file: File, previewUrl: string, onUploaded: (url: string) => void, onError?: (message: string) => void) => {
      const invalid = validateLocalImageFile(file);
      if (invalid) {
        onError?.(getUploadErrorMessage(invalid));
        return;
      }
      const galleryKeys = Object.keys(imageKeysRef.current).filter((k) => k.startsWith("gallery_"));
      if (!canAddGalleryImage(galleryKeys)) return;
      const estimate = await getStorageEstimate();
      const currentBytes = Array.from(blobsByUrlRef.current.values()).reduce((sum, blob) => sum + blob.size, 0);
      if (!isWithinImageBudget(estimate, currentBytes, file.size)) return;
      blobsByUrlRef.current.set(previewUrl, file);
      onUploaded(previewUrl);
    },
    []
  );

  const handleLocalTemplateSwitch = useCallback(
    (newPageId: string) => {
      activeTemplateIdRef.current = newPageId;
      const currentBuilderDraft = (envelopeRef.current?.payload?.builderDraft || emptyBuilderDraft(newPageId)) as Record<string, unknown>;
      const currentBlocksLayout = (currentBuilderDraft.blocks_layout || null) as Parameters<typeof legacyInvitationTemplateToLayout>[1];
      const updatedBuilderDraft = {
        ...currentBuilderDraft,
        template_id: newPageId,
        blocks_layout: legacyInvitationTemplateToLayout(newPageId, currentBlocksLayout),
      };
      const basePayload: InvitationLocalDraftPayload = envelopeRef.current?.payload ?? {
        templateId: newPageId,
        ...basicsRef.current,
        builderDraft: updatedBuilderDraft,
        images: imageKeysRef.current,
      };
      const fullPayload: InvitationLocalDraftPayload = {
        ...basePayload,
        templateId: newPageId,
        builderDraft: updatedBuilderDraft,
      };
      envelopeRef.current = envelopeRef.current
        ? updateInvitationLocalDraft(envelopeRef.current, fullPayload)
        : createInvitationLocalDraft(draftId, fullPayload);
      void saveInvitationLocalDraft(envelopeRef.current);
      const targetHref = getInvitationTemplateCreateHref(newPageId);
      router.replace(targetHref);
    },
    [draftId, router]
  );

  const handleLocalBasicsUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      basicsRef.current = {
        title: typeof patch.title === "string" ? patch.title : basicsRef.current.title,
        eventDate: typeof patch.event_date === "string" || patch.event_date === null ? (patch.event_date as string | null) : basicsRef.current.eventDate,
        venue: typeof patch.venue === "string" || patch.venue === null ? (patch.venue as string | null) : basicsRef.current.venue,
        address: basicsRef.current.address,
        city: typeof patch.city === "string" || patch.city === null ? (patch.city as string | null) : basicsRef.current.city,
      };
      setInitialData((current) => ({ ...current, event: toEvent(basicsRef.current, draftId) }));
      // Persist immediately — otherwise a Basics-only edit (no other draft
      // field touched) only lives in basicsRef until the next unrelated
      // draft-level autosave sweeps it in, and is lost on reload before
      // that ever fires. Same immediate-persist pattern as
      // handleLocalTemplateSwitch above.
      const currentBuilderDraft = (envelopeRef.current?.payload?.builderDraft
        || emptyBuilderDraft(activeTemplateIdRef.current)) as Record<string, unknown>;
      const basePayload: InvitationLocalDraftPayload = envelopeRef.current?.payload ?? {
        templateId: activeTemplateIdRef.current,
        ...basicsRef.current,
        builderDraft: currentBuilderDraft,
        images: imageKeysRef.current,
      };
      const fullPayload: InvitationLocalDraftPayload = {
        ...basePayload,
        ...basicsRef.current,
      };
      envelopeRef.current = envelopeRef.current
        ? updateInvitationLocalDraft(envelopeRef.current, fullPayload)
        : createInvitationLocalDraft(draftId, fullPayload);
      void saveInvitationLocalDraft(envelopeRef.current);
    },
    [draftId]
  );

  const handleLocalSignInToPublish = useCallback(async () => {
    const currentTemplateId = activeTemplateIdRef.current || templateId;
    // One code path for both: /invitations/promote checks its own session
    // (handoff-design.md v3 §0 item c), so an already-authenticated click
    // can go straight there instead of round-tripping through /login for
    // nothing.
    const promoteTarget = `/invitations/promote?draftId=${encodeURIComponent(draftId)}&template=${encodeURIComponent(currentTemplateId)}`;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      router.push(promoteTarget);
      return;
    }
    router.push(`/login?redirect=${encodeURIComponent(promoteTarget)}`);
  }, [draftId, router, templateId]);

  const localPersistence: InvitationBuilderPersistence = {
    mode: "local",
    handleLocalImageCropped,
    handleLocalGalleryImageCropped,
    handleLocalTemplateSwitch,
    handleLocalBasicsUpdate,
    handleLocalSignInToPublish,
  };

  return {
    status,
    draftId,
    initialData,
    localPersistence,
    onLocalSave,
    changedElsewhere,
    dismissChangedElsewhere: () => setChangedElsewhere(false),
  };
}
