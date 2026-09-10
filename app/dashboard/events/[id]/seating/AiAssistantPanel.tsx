"use client";

import { useState, useRef, useCallback } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  Check,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import type { ManualSectionFormItem } from "./ManualBuilder";
import type {
  AiSeatingProposal,
  AiSectionProposal,
  ConversationTurn,
} from "@/app/api/events/[id]/seating/ai-assistant/route";

// --- Proposal → ManualSectionFormItem converter ------------------------------
// Maps the narrow AI DTO to the richer ManualBuilder form shape.
// ticketTypeId and defaultPrice are intentionally left as empty safe defaults —
// the organizer owns those concerns in the ManualBuilder.

export function aiSectionToFormItem(
  section: AiSectionProposal,
  index: number
): ManualSectionFormItem {
  const id = `ai-sec-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: section.name,
    mode: section.mode,
    ticketTypeId: "",
    defaultPrice: "",
    isVip: Boolean(section.isVip),
    isAccessible: Boolean(section.isAccessible),
    // Rows
    rowCount: section.rowCount ?? 1,
    seatsPerRow: section.seatsPerRow ?? 10,
    rowLabelPrefix: "",
    startSeatNumber: 1,
    // Tables
    tableCount: section.tableCount ?? 1,
    seatsPerTable: section.seatsPerTable ?? 8,
    tableShape: section.tableShape ?? "round",
    tableNamePrefix: "Table",
    startTableNumber: 1,
  };
}

// --- Proposal summary card ---------------------------------------------------

function sectionSeatCount(s: AiSectionProposal): number {
  if (s.mode === "rows") return (s.rowCount ?? 0) * (s.seatsPerRow ?? 0);
  return (s.tableCount ?? 0) * (s.seatsPerTable ?? 0);
}

function sectionDetail(s: AiSectionProposal): string {
  if (s.mode === "rows") {
    return `${s.rowCount} row${(s.rowCount ?? 0) > 1 ? "s" : ""} × ${s.seatsPerRow} seats`;
  }
  return `${s.tableCount} table${(s.tableCount ?? 0) > 1 ? "s" : ""} × ${s.seatsPerTable} seats`;
}

function ProposalSummary({ proposal }: { proposal: AiSeatingProposal }) {
  const [open, setOpen] = useState(true);
  const totalSeats = proposal.sections.reduce((sum, s) => sum + sectionSeatCount(s), 0);
  const vipCount = proposal.sections
    .filter((s) => s.isVip)
    .reduce((sum, s) => sum + sectionSeatCount(s), 0);

  return (
    <div className="border-b border-zinc-200 pb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2 text-sm font-black text-zinc-900"
      >
        <span className="flex items-center gap-2">
          <Check size={14} className="text-emerald-600" />
          Proposed Plan — {totalSeats} seat{totalSeats !== 1 ? "s" : ""} across{" "}
          {proposal.sections.length} section{proposal.sections.length !== 1 ? "s" : ""}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {proposal.sections.map((s, i) => {
            const count = sectionSeatCount(s);
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-black ${
                    s.isVip
                      ? "bg-amber-100 text-amber-700"
                      : s.isAccessible
                      ? "bg-blue-50 text-blue-700"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {s.isVip ? "VIP" : s.isAccessible ? "ACC" : "GEN"}
                </span>
                <span className="font-semibold text-zinc-900">{s.name}</span>
                <span className="text-zinc-500">
                  {sectionDetail(s)} = {count} seat{count !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}

          <div className="mt-2 flex gap-4 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
            <span>
              <span className="font-black text-zinc-900">{totalSeats}</span> Total
            </span>
            {vipCount > 0 && (
              <span>
                <span className="font-black text-amber-700">{vipCount}</span> VIP
              </span>
            )}
            <span>
              <span className="font-black text-zinc-700">{totalSeats - vipCount}</span> Regular
            </span>
          </div>

          {proposal.assumptions.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
              <p className="mb-1 font-black text-zinc-700">Assumptions made:</p>
              <ul className="space-y-0.5 text-zinc-500">
                {proposal.assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main panel --------------------------------------------------------------

interface AiAssistantPanelProps {
  eventId: string;
  existingSeatsCount: number;
  existingVipCount: number;
  existingRegularCount: number;
  existingAccessibleCount: number;
  existingSectionsCount: number;
  onApplyConfig: (sections: ManualSectionFormItem[]) => void;
  onToast: (type: "success" | "error", message: string) => void;
}

export default function AiAssistantPanel({
  eventId,
  existingSeatsCount,
  existingVipCount,
  existingRegularCount,
  existingAccessibleCount,
  existingSectionsCount,
  onApplyConfig,
  onToast,
}: AiAssistantPanelProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AiSeatingProposal | null>(null);
  // Bounded conversation history for multi-turn clarification
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const maxChars = 2000;
  const charsLeft = maxChars - message.length;

  // Build existingSummary only when there is an existing layout worth describing.
  // Contains aggregate counts only — no PII, no seat IDs, no UUIDs.
  const existingSummary =
    existingSeatsCount > 0
      ? {
          totalSeats: existingSeatsCount,
          sections: existingSectionsCount,
          vipSeats: existingVipCount,
          regularSeats: existingRegularCount,
          accessibleSeats: existingAccessibleCount,
        }
      : undefined;

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    setProposal(null);

    // Include current proposal context in history if we had one
    const outgoingHistory: ConversationTurn[] = [...history];

    try {
      const res = await fetch(`/api/events/${eventId}/seating/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: outgoingHistory,
          ...(existingSummary ? { existingSummary } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Request failed. Please try again.");
        return;
      }

      const newProposal = data.proposal as AiSeatingProposal;
      setProposal(newProposal);

      // Advance bounded conversation history
      setHistory((prev) => [
        ...prev,
        { role: "user" as const, content: trimmed },
        {
          role: "assistant" as const,
          content:
            newProposal.sections.length > 0
              ? `Proposed ${newProposal.sections.length} section(s) with ${newProposal.sections.reduce(
                  (sum, s) => sum + sectionSeatCount(s),
                  0
                )} total seats.`
              : `Questions: ${newProposal.questions.join(" ")}`,
        },
      ]);

      setMessage("");
    } catch {
      setError(
        "The seating assistant is temporarily unavailable. You can still build your plan manually."
      );
    } finally {
      setIsLoading(false);
    }
  }, [message, isLoading, history, eventId, existingSummary]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleApply() {
    if (!proposal || proposal.sections.length === 0) return;
    const formSections = proposal.sections.map((s, i) => aiSectionToFormItem(s, i));
    onApplyConfig(formSections);
    onToast(
      "success",
      `AI plan applied — ${proposal.sections.length} section(s) loaded into the Manual Builder.`
    );
  }

  function handleReset() {
    setProposal(null);
    setHistory([]);
    setMessage("");
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const hasProposal = proposal && proposal.sections.length > 0;
  const hasQuestions = proposal && proposal.questions.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-zinc-900">
            <Sparkles size={16} className="text-violet-500" />
            AI Seating Assistant
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Describe your seating arrangement in plain language. The AI produces a configuration
            you can review and apply — it never saves automatically.
          </p>
        </div>
        {(proposal !== null || history.length > 0) && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="Start over"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <RefreshCcw size={12} />
            Start over
          </button>
        )}
      </div>

      {/* Compact conversation thread (user messages only) */}
      {history.filter((t) => t.role === "user").length > 0 && (
        <div className="space-y-2">
          {history
            .filter((t) => t.role === "user")
            .map((t, i) => (
              <div key={i} className="flex justify-end">
                <span className="max-w-xs rounded-xl rounded-tr-sm bg-violet-600 px-3 py-2 text-xs text-white">
                  {t.content}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Proposal summary */}
      {hasProposal && <ProposalSummary proposal={proposal} />}

      {/* Clarification questions */}
      {hasQuestions && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-black text-amber-800">
            The AI needs a bit more information:
          </p>
          <ul className="space-y-1">
            {proposal.questions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                {q}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-600">
            Type your answer below and press Generate.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxChars))}
            onKeyDown={handleKeyDown}
            placeholder={
              hasQuestions
                ? "Type your answer to the question above…"
                : hasProposal
                ? 'Refine this plan, e.g. "Add 4 accessible seats"…'
                : 'Describe your seating plan, e.g. "5 rows of 20 with 10 VIP seats at the front"…'
            }
            disabled={isLoading}
            rows={3}
            aria-label="Seating plan description"
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
          />
          <span
            className={`absolute bottom-2 right-3 text-xs ${
              charsLeft < 100 ? "text-amber-500" : "text-zinc-400"
            }`}
            aria-live="polite"
            aria-label={`${charsLeft} characters remaining`}
          >
            {charsLeft}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || message.trim().length === 0}
            aria-busy={isLoading}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-xs transition-opacity hover:bg-violet-700 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Send size={13} />
                Generate plan
              </>
            )}
          </button>
          <span className="text-xs text-zinc-400">Ctrl+Enter</span>

          {hasProposal && (
            <button
              type="button"
              onClick={handleApply}
              className="ml-auto flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 shadow-xs transition-colors hover:bg-violet-100"
            >
              Apply to Builder
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        The AI generates a configuration only. Saving requires your review and confirmation in the
        Manual Builder.
      </p>
    </div>
  );
}
