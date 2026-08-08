"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type CommentTarget = "event" | "fundraiser";

type CommentItem = {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  user_id?: string | null;
  author_profile?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type CommentsSectionProps = {
  targetType: CommentTarget;
  targetId: string;
  title?: string;
  accent?: "orange" | "green";
  commentsOnly?: boolean;
};

const accentClasses = {
  orange: {
    label: "text-brand-700",
    button: "bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300",
    ring: "focus:border-brand-600",
    avatar: "bg-brand-100 text-brand-800",
    badge: "bg-brand-50 text-brand-800 border-brand-200",
    icon: "text-brand-600",
  },
  green: {
    label: "text-green-700",
    button: "bg-green-600 hover:bg-green-700 disabled:bg-green-300",
    ring: "focus:border-green-500",
    avatar: "bg-green-100 text-green-700",
    badge: "bg-green-50 text-green-700 border-green-200",
    icon: "text-green-600",
  },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Gate step ──────────────────────────────────────────────────────────────
function GatePrompt({
  targetType,
  targetId,
  accent,
  onVerified,
}: {
  targetType: CommentTarget;
  targetId: string;
  accent: "orange" | "green";
  onVerified: (email: string, name: string) => void;
}) {
  const styles = accentClasses[accent];
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const actionLabel =
    targetType === "event" ? "purchased a ticket" : "made a donation";
  const gateIcon =
    targetType === "event" ? (
      // Ticket icon
      <svg className={`w-10 h-10 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
      </svg>
    ) : (
      // Heart/donate icon
      <svg className={`w-10 h-10 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    );

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setChecking(true);
    try {
      const params = new URLSearchParams({ targetType, targetId, email: trimmedEmail });
      const res = await fetch(`/api/comments/verify?${params.toString()}`);
      const data = await res.json() as { eligible: boolean };

      if (data.eligible) {
        onVerified(trimmedEmail, name.trim());
      } else {
        setError(
          targetType === "event"
            ? "We couldn't find a ticket purchase for this email on this event. Only ticket holders can comment."
            : "We couldn't find a donation for this email on this fundraiser. Only donors can comment."
        );
      }
    } catch {
      setError("Unable to verify eligibility. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
      <div className="flex justify-center mb-4">{gateIcon}</div>
      <h3 className="text-lg font-black text-zinc-900">
        Comments are for {targetType === "event" ? "ticket holders" : "donors"} only
      </h3>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm mx-auto">
        To keep the conversation genuine, only people who have {actionLabel} can leave a comment.
        Enter the email you used below to unlock commenting.
      </p>

      <form onSubmit={handleVerify} className="mt-5 flex flex-col gap-3 max-w-sm mx-auto text-left">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Your name (optional)"
          className={`w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm outline-none ${styles.ring}`}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          required
          placeholder={`Email used to ${targetType === "event" ? "buy your ticket" : "donate"}`}
          className={`w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm outline-none ${styles.ring}`}
        />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={checking}
          className={`rounded-full px-6 py-3 text-sm font-black text-white transition ${styles.button}`}
        >
          {checking ? "Checking…" : "Unlock commenting"}
        </button>
      </form>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CommentsSection({
  targetType,
  targetId,
  title = "Comments",
  accent = "orange",
  commentsOnly = false,
}: CommentsSectionProps) {
  const styles = accentClasses[accent];
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Gate state
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState<string>("");

  // Comment form state (shown only after verification)
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const mountedRef = useRef(false);

  const helperText = useMemo(
    () =>
      targetType === "event"
        ? "Ask a question, share a note, or help others know what to expect."
        : "Leave encouragement, a question, or a public update for this fundraiser.",
    [targetType]
  );

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    async function loadComments() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({ targetType, targetId });
      const response = await fetch(`/api/comments?${params.toString()}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!active || !mountedRef.current) return;

      if (!response.ok) {
        setError(result.error || "Could not load comments.");
      } else {
        setComments(result.comments || []);
      }

      setLoading(false);
    }

    loadComments();

    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [targetType, targetId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError("");

    if (body.trim().length < 2) {
      setSubmitError("Please write a comment before posting.");
      return;
    }

    setSubmitting(true);

    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        authorName: verifiedName || "Anonymous",
        authorEmail: verifiedEmail,
        body,
      }),
    });
    const result = await response.json();

    if (!mountedRef.current) return;

    if (!response.ok) {
      setSubmitError(result.error || "Could not post your comment.");
      setSubmitting(false);
      return;
    }

    setComments((current) => [result.comment, ...current]);
    setBody("");
    setSubmitting(false);
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8">
      <p className={`text-sm font-black uppercase tracking-wide ${styles.label}`}>
        Community
      </p>
      <h2 className="mt-2 text-3xl font-black">{title}</h2>
      <p className="mt-3 text-zinc-600">{helperText}</p>

      {!commentsOnly && (
        !verifiedEmail ? (
          <GatePrompt
            targetType={targetType}
            targetId={targetId}
            accent={accent}
            onVerified={(email, name) => {
              setVerifiedEmail(email);
              setVerifiedName(name);
            }}
          />
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Verified badge */}
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${styles.badge}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Commenting as {verifiedName || verifiedEmail}
              <button
                type="button"
                onClick={() => { setVerifiedEmail(null); setVerifiedName(""); }}
                className="ml-1 opacity-50 hover:opacity-100 transition"
                title="Switch email"
              >
                ✕
              </button>
            </div>

            <div>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={1000}
                required
                rows={4}
                placeholder="Write a public comment"
                className={`w-full resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none ${styles.ring}`}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-sm text-zinc-500">
                <span>Comments appear publicly on this page.</span>
                <span>{body.length}/1000</span>
              </div>
            </div>

            {submitError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`rounded-full px-6 py-3 font-black text-white transition ${styles.button}`}
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </form>
        )
      )}

      {/* Comment list */}
      <div className="mt-8 space-y-4">
        {loading ? (
          <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-500">Loading comments…</div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-600">{error}</div>
        ) : comments.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-5 text-zinc-500">
            {commentsOnly ? "No comments yet" : "No comments yet. Be the first to start the conversation."}
          </div>
        ) : (
          comments.map((comment) => {
            const displayName = comment.author_name || "Anonymous";
            const profile = comment.author_profile;
            const canLinkProfile = profile && displayName !== "Anonymous";

            return (
              <article key={comment.id} className="rounded-2xl border border-zinc-200 p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black ${styles.avatar}`}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {canLinkProfile ? (
                        <Link
                          href={`/profile/${profile.id}`}
                          className="font-black hover:underline"
                        >
                          {profile.display_name || displayName}
                        </Link>
                      ) : (
                        <h3 className="font-black">{displayName}</h3>
                      )}
                      {!comment.user_id && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-500">
                          Guest
                        </span>
                      )}
                      <p className="text-sm text-zinc-500">{formatDate(comment.created_at)}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700">
                      {comment.body}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
