"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Local-only like/bookmark/follow toggles for the Articles landing page.
 *
 * There is no likes/bookmarks/followers table in the schema — articles has
 * no engagement columns, and profiles has no followers relation — so these
 * persist purely in the visitor's own browser via localStorage. They do not
 * sync across devices and do not contribute to any real, shared count. A
 * genuine "N people liked this" number would need a backend change, which is
 * out of scope here; this is an honest, frontend-only affordance rather than
 * a simulated backend feature.
 */

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage unavailable (private browsing, full quota) — non-critical, fail silently.
  }
}

function useLocalToggle(storageKey: string, id: string) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(readSet(storageKey).has(id));
  }, [storageKey, id]);

  const toggle = useCallback(() => {
    setActive((current) => {
      const next = !current;
      const set = readSet(storageKey);
      if (next) set.add(id);
      else set.delete(id);
      writeSet(storageKey, set);
      return next;
    });
  }, [storageKey, id]);

  return [active, toggle] as const;
}

const LIKES_KEY = "aldriva:article-likes";
const BOOKMARKS_KEY = "aldriva:article-bookmarks";
const FOLLOWS_KEY = "aldriva:article-author-follows";

export function useLocalArticleActions(articleId: string) {
  const [liked, toggleLike] = useLocalToggle(LIKES_KEY, articleId);
  const [bookmarked, toggleBookmark] = useLocalToggle(BOOKMARKS_KEY, articleId);
  return { liked, bookmarked, toggleLike, toggleBookmark };
}

export function useLocalFollow(authorId: string) {
  const [following, toggleFollow] = useLocalToggle(FOLLOWS_KEY, authorId);
  return { following, toggleFollow };
}
