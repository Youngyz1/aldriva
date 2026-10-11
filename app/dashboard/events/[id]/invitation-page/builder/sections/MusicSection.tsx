"use client";

/**
 * Builder Music section — background music upload (invitation-media) plus
 * external provider links (Spotify / SoundCloud embeds).
 * Same AudioUploadField wiring as the wizard Media step; links validate
 * locally and persist through the existing draft autosave.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Plus, Trash2, X } from "lucide-react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import { AudioUploadField } from "@/components/invitation/AudioUploadField";
import {
  MAX_MUSIC_LINKS,
  MUSIC_PROVIDER_NAMES,
  validateMusicLink,
  type MusicLinkProvider,
} from "@/lib/invitation-music-links";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  showUnsupportedLinksNotice?: boolean;
  onDismissUnsupportedLinksNotice?: () => void;
  disabled?: boolean;
}

const PROVIDERS: MusicLinkProvider[] = ["spotify", "soundcloud"];

export function MusicSection({
  eventId,
  draft,
  updateDraft,
  showUnsupportedLinksNotice = false,
  onDismissUnsupportedLinksNotice,
  disabled,
}: Props) {
  const t = useTranslations("Events");
  const [provider, setProvider] = useState<MusicLinkProvider>("spotify");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const links = draft.music_links ?? [];
  const canAdd = links.length < MAX_MUSIC_LINKS && !disabled;

  function handleAdd() {
    setError("");
    const checked = validateMusicLink(url);
    if (!checked.ok) {
      setError(
        checked.error === "soundcloud_short_link"
          ? t("musicLinkSoundCloudShortLink")
          : checked.error === "unsupported_provider"
            ? t("musicLinkUnsupported")
          : t("musicLinkInvalid")
      );
      return;
    }
    if (checked.item.provider !== provider) {
      setError(t("musicLinkProviderMismatch"));
      return;
    }
    updateDraft({ music_links: [...links, checked.item] });
    setUrl("");
  }

  function handleRemove(index: number) {
    updateDraft({ music_links: links.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      {showUnsupportedLinksNotice && (
        <div role="status" className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
          <p>{t("musicLinkLegacyProviderNotice")}</p>
          <button
            type="button"
            onClick={onDismissUnsupportedLinksNotice}
            aria-label={t("musicLinkDismissNotice")}
            className="shrink-0 rounded-md p-0.5 hover:bg-amber-100"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <AudioUploadField
        eventId={eventId}
        value={draft.music_audio_url}
        title={draft.music_title}
        locale={draft.locale || "en"}
        disabled={disabled}
        onChange={(url: string | null, title?: string | null) =>
          updateDraft({ music_audio_url: url, music_title: title || null })
        }
      />

      <div className="space-y-3 border-t border-zinc-200 pt-5">
        <div>
          <h3 className="text-sm font-black text-zinc-900">{t("musicLinksHeading")}</h3>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">{t("musicLinksDescription")}</p>
        </div>

        {links.length > 0 && (
          <ul className="space-y-2">
            {links.map((link, i) => (
              <li
                key={`${link.provider}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-xs"
              >
                <Link2 size={14} className="shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-zinc-900">
                    {MUSIC_PROVIDER_NAMES[link.provider]}
                  </p>
                  <p className="truncate text-[11px] font-medium text-zinc-500">{link.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  disabled={disabled}
                  aria-label={t("musicLinkRemove")}
                  className="shrink-0 rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {links.length < MAX_MUSIC_LINKS && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  {t("musicLinkProvider")}
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as MusicLinkProvider)}
                  disabled={disabled}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {MUSIC_PROVIDER_NAMES[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  {t("musicLinkUrl")}
                </label>
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t("musicLinkUrlPlaceholder")}
                  disabled={disabled}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-xs font-bold text-red-600">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd || url.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-orange-700 disabled:opacity-50"
            >
              <Plus size={14} />
              {t("musicLinkAdd")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
