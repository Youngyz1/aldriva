"use client";

/**
 * app/admin/ai/GrowthStudioClient.tsx — Stage 22 (P4b): Studio chat UI.
 *
 * Light admin system (PageHeader, zinc + brand-700, rounded-xl, shadow-xs).
 * ChatGPT-style thread with a server-backed conversation list (grouped
 * Today / Yesterday / Previous 7 days / Older via the shared pure helper
 * in lib/ai/studio-chat-groups.ts).
 *
 * Safety contracts (pinned by lib/ai/__tests__/studio-chat-ui.test.cjs):
 * - Model text renders as PLAIN TEXT only (whitespace-pre-wrap, no raw-HTML
 *   injection point, no markdown dependency).
 * - Tool-call chips show the tool NAME only — args/results never render
 *   in the thread.
 * - Failures surface fixed inline strings; server response text is never
 *   echoed into the UI.
 * - This client imports no service-role or data layer: fetch() against the
 *   admin-gated conversation/chat endpoints only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Lock,
  Menu,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import {
  groupConversations,
  type GroupableConversation,
} from "@/lib/ai/studio-chat-groups";

interface ConversationSummary extends GroupableConversation {
  provider: string;
  status: string;
  created_at: string;
}

interface ThreadMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  toolNames: string[];
  guardVerdict?: "pass" | "sanitised" | "rejected";
  guardReason?: string;
  provider?: string;
  notStored?: boolean;
}

interface ServerThreadRow {
  seq: number;
  role: string;
  content: string | null;
  tool_name: string | null;
  guard_verdict: string | null;
  guard_reason: string | null;
  provider: string | null;
}

// Fixed client strings: failures and notices never echo server text.
const LIST_ERROR = "Couldn't load conversations. Please try again.";
const THREAD_ERROR = "Couldn't load this conversation. Please try again.";
const SEND_ERROR = "Couldn't get a reply. Please try again.";
const RENAME_ERROR = "Couldn't rename this chat. Please try again.";
const DELETE_ERROR = "Couldn't delete this chat. Please try again.";
const TOOL_ERROR = "Tool run failed. Please try again.";
const GUARD_REJECTED_TEXT = "Content rejected by Output Guard.";
const NOT_STORED_NOTICE =
  "Not stored — this prompt looked like it contained a secret, so the turn was answered but not saved to history.";
const TRUNCATED_NOTICE = "Showing the 200 most recent messages — older history is kept on the server.";

const EXAMPLE_PROMPTS = [
  "Find upcoming approved events and summarize them",
  "List active fundraisers that are almost funded",
  "Summarize recent articles for the newsletter",
];

interface ShortcutTool {
  name: string;
  label: string;
  args?: Record<string, unknown>;
}

interface ShortcutGroup {
  key: string;
  label: string;
  tools: ShortcutTool[];
}

// The 9 read-only tools on STUDIO_DIRECT_TOOL_ALLOWLIST
// (app/api/ai/chat/route.ts) — same set, same default args as before.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    key: "catalog",
    label: "Catalog",
    tools: [
      { name: "get_upcoming_events", label: "Upcoming events" },
      { name: "get_active_fundraisers", label: "Active fundraisers" },
      { name: "get_featured_businesses", label: "Businesses" },
      { name: "get_recent_articles", label: "Recent articles" },
      { name: "get_available_products", label: "Products" },
    ],
  },
  {
    key: "research",
    label: "Research",
    tools: [
      { name: "fetch_url_summary", label: "URL summary", args: { url: "https://example.com" } },
      {
        name: "fetch_rss_feed",
        label: "RSS feed",
        args: { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", maxItems: 3 },
      },
      {
        name: "search_trends",
        label: "Search trends",
        args: { query: "Nigeria community fundraising trends 2026", maxResults: 3 },
      },
    ],
  },
  {
    key: "content",
    label: "Content",
    tools: [{ name: "get_content_history", label: "Content history" }],
  },
];

function isGuardVerdict(value: unknown): value is ThreadMessage["guardVerdict"] {
  return value === "pass" || value === "sanitised" || value === "rejected";
}

function formatWhen(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  return new Date(iso).toLocaleString();
}

function VerdictBadge({ message }: { message: ThreadMessage }) {
  if (!message.guardVerdict) return null;
  if (message.guardVerdict === "pass") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> Guard: Pass
      </span>
    );
  }
  if (message.guardVerdict === "sanitised") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
        <AlertTriangle className="h-3.5 w-3.5" /> Guard: Sanitised
        {message.guardReason ? ` (${message.guardReason})` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
      <Lock className="h-3.5 w-3.5" /> Guard: Rejected
      {message.guardReason ? ` (${message.guardReason})` : ""}
    </span>
  );
}

export default function GrowthStudioClient() {
  const [provider, setProvider] = useState<"gemini" | "openrouter">("gemini");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [toolResult, setToolResult] = useState<{ tool: string; data: unknown } | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [bgPaused, setBgPaused] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.conversations)) {
        setConversations(data.conversations as ConversationSummary[]);
      }
    } catch {
      // List refresh is best-effort; thread errors surface separately.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/conversations");
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data && Array.isArray(data.conversations)) {
          setConversations(data.conversations as ConversationSummary[]);
        } else {
          setError(LIST_ERROR);
        }
      } catch {
        if (!cancelled) setError(LIST_ERROR);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pause the empty-state background drift while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => setBgPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending, loadingThread]);

  const startNewChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setTruncated(false);
    setError(null);
    setToolResult(null);
    setToolError(null);
    setDrawerOpen(false);
    composerRef.current?.focus();
  }, []);

  const selectConversation = useCallback(
    async (id: string) => {
      setDrawerOpen(false);
      if (id === activeId && messages.length > 0) return;
      setActiveId(id);
      setError(null);
      setToolResult(null);
      setToolError(null);
      setLoadingThread(true);
      try {
        const res = await fetch(`/api/ai/conversations/${id}`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !Array.isArray(data.messages)) {
          setError(THREAD_ERROR);
          setMessages([]);
          setTruncated(false);
          return;
        }
        const rows = data.messages as ServerThreadRow[];
        setMessages(
          rows.map((row) => ({
            key: `${id}-${row.seq}`,
            role: row.role === "assistant" ? "assistant" : "user",
            text: row.content ?? "",
            toolNames: row.tool_name ? [row.tool_name] : [],
            guardVerdict: isGuardVerdict(row.guard_verdict) ? row.guard_verdict : undefined,
            guardReason: row.guard_reason ?? undefined,
            provider: row.provider ?? undefined,
          }))
        );
        setTruncated(data.truncated === true);
      } catch {
        setError(THREAD_ERROR);
        setMessages([]);
        setTruncated(false);
      } finally {
        setLoadingThread(false);
      }
    },
    [activeId, messages.length]
  );

  const handleSend = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? composer).trim();
      if (!text || sending) return;
      setError(null);
      const userKey = `local-${Date.now()}`;
      setMessages((prev) => [...prev, { key: userKey, role: "user", text, toolNames: [] }]);
      if (rawText === undefined) setComposer("");
      setSending(true);
      try {
        // New chats create their conversation on first send; the chat
        // endpoint only persists turns for an existing conversation id.
        let convoId = activeId;
        if (!convoId) {
          const created = await fetch("/api/ai/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const createdData = await created.json().catch(() => null);
          if (!created.ok || !createdData?.conversation?.id) {
            setMessages((prev) => prev.filter((m) => m.key !== userKey));
            setError(SEND_ERROR);
            return;
          }
          convoId = createdData.conversation.id as string;
          setActiveId(convoId);
        }
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, provider, enableTools: true, conversationId: convoId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          if (res.status === 422) {
            setMessages((prev) => [
              ...prev,
              {
                key: `${userKey}-guard`,
                role: "assistant",
                text: GUARD_REJECTED_TEXT,
                toolNames: [],
                guardVerdict: "rejected",
                guardReason: "Output Guard",
              },
            ]);
          } else {
            setError(SEND_ERROR);
          }
        } else if (data.rejected) {
          setMessages((prev) => [
            ...prev,
            {
              key: `${userKey}-guard`,
              role: "assistant",
              text: GUARD_REJECTED_TEXT,
              toolNames: [],
              guardVerdict: "rejected",
              guardReason: "Output Guard",
            },
          ]);
        } else {
          const toolNames = Array.isArray(data.toolCalls)
            ? (data.toolCalls as Array<{ tool?: unknown }>)
                .map((call) => call.tool)
                .filter((name): name is string => typeof name === "string")
            : [];
          setMessages((prev) => [
            ...prev,
            {
              key: `${userKey}-reply`,
              role: "assistant",
              text: typeof data.text === "string" ? data.text : "No text generated.",
              toolNames,
              guardVerdict: isGuardVerdict(data.guardVerdict) ? data.guardVerdict : undefined,
              guardReason: typeof data.guardReason === "string" ? data.guardReason : undefined,
              provider: typeof data.provider === "string" ? data.provider : undefined,
              notStored: data.persisted === false,
            },
          ]);
        }
        await refreshList();
      } catch {
        setError(SEND_ERROR);
      } finally {
        setSending(false);
      }
    },
    [activeId, composer, provider, refreshList, sending]
  );

  const commitRename = useCallback(
    async (id: string, draft: string) => {
      const title = draft.trim().slice(0, 80);
      setEditing(null);
      if (!title) return;
      try {
        const res = await fetch(`/api/ai/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.conversation) {
          setError(RENAME_ERROR);
          return;
        }
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      } catch {
        setError(RENAME_ERROR);
      }
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleteWorking(true);
    try {
      const res = await fetch(`/api/ai/conversations/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(DELETE_ERROR);
        return;
      }
      const deletedId = pendingDelete.id;
      setConversations((prev) => prev.filter((c) => c.id !== deletedId));
      if (activeId === deletedId) {
        setActiveId(null);
        setMessages([]);
        setTruncated(false);
      }
      setPendingDelete(null);
    } catch {
      setError(DELETE_ERROR);
    } finally {
      setDeleteWorking(false);
    }
  }, [activeId, pendingDelete]);

  const runTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      if (runningTool) return;
      setRunningTool(name);
      setToolError(null);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directTool: name, toolArgs: args ?? {} }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          setToolError(TOOL_ERROR);
        } else {
          setToolResult({ tool: name, data: data.result });
        }
      } catch {
        setToolError(TOOL_ERROR);
      } finally {
        setRunningTool(null);
      }
    },
    [runningTool]
  );

  const groups = groupConversations(conversations);
  const isEmpty = !loadingThread && messages.length === 0;

  const conversationList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={startNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-black text-white shadow-xs transition hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {listLoading ? (
          <p className="flex items-center gap-2 px-1 py-4 text-sm font-medium text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading chats…
          </p>
        ) : conversations.length === 0 ? (
          <p className="px-1 py-4 text-sm font-medium text-zinc-500">
            No chats yet — start one below and it will be saved here.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="mt-2 first:mt-0">
              <p className="px-1 py-1 text-[11px] font-black uppercase tracking-wide text-zinc-400">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((convo) => {
                  const isActive = convo.id === activeId;
                  const isEditing = editing?.id === convo.id;
                  return (
                    <li key={convo.id}>
                      <div
                        className={`group/item flex items-center gap-1 rounded-xl border px-2 py-1.5 transition ${
                          isActive
                            ? "border-brand-700 bg-brand-50"
                            : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectConversation(convo.id)}
                          className="min-w-0 flex-1 text-left"
                          aria-current={isActive ? "true" : undefined}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editing.draft}
                              onChange={(e) => setEditing({ id: convo.id, draft: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitRename(convo.id, editing.draft);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              onBlur={() => void commitRename(convo.id, editing.draft)}
                              onClick={(e) => e.stopPropagation()}
                              maxLength={80}
                              aria-label="Rename chat"
                              className="w-full rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-brand-700"
                            />
                          ) : (
                            <>
                              <span className="block truncate text-sm font-semibold text-zinc-950">
                                {convo.title || "Untitled chat"}
                              </span>
                              <span className="block text-[11px] font-medium text-zinc-400">
                                {formatWhen(convo.updated_at)}
                              </span>
                            </>
                          )}
                        </button>
                        {!isEditing && (
                          <span className="flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => setEditing({ id: convo.id, draft: convo.title })}
                              aria-label={`Rename ${convo.title || "chat"}`}
                              className="rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-700 focus:opacity-100 group-hover/item:opacity-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(convo)}
                              aria-label={`Delete ${convo.title || "chat"}`}
                              className="rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-red-100 hover:text-red-600 focus:opacity-100 group-hover/item:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Aldriva AI"
        title="Growth Studio"
        description="Ask about events, fundraisers, businesses, articles and products. Every answer passes the Output Guard; every data lookup uses the read-only tool allowlist."
        action={
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-xs"
              role="group"
              aria-label="AI provider"
            >
              {(["gemini", "openrouter"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setProvider(option)}
                  aria-pressed={provider === option}
                  className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize transition ${
                    provider === option ? "bg-zinc-950 text-white" : "text-zinc-500 hover:text-zinc-950"
                  }`}
                >
                  {option === "gemini" ? "Gemini" : "OpenRouter"}
                </button>
              ))}
            </div>
            <Link
              href="/admin/ai/rejections"
              className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-black text-amber-800 shadow-xs transition hover:bg-amber-100"
            >
              <ShieldAlert className="h-4 w-4" />
              Guard Rejections Audit
            </Link>
          </div>
        }
      />

      <div className="flex items-start gap-4">
        {/* Conversation list (desktop) */}
        <aside className="hidden max-h-[720px] min-h-[540px] w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs lg:flex">
          {conversationList}
        </aside>

        {/* Thread panel */}
        <section className="flex h-[720px] min-h-[540px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open conversation list"
              className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <Bot className="h-4 w-4 text-brand-700" />
            <span className="truncate text-sm font-black text-zinc-950">
              {activeId
                ? conversations.find((c) => c.id === activeId)?.title || "Chat"
                : "New chat"}
            </span>
            <span className="ml-auto hidden font-mono text-[11px] font-medium text-zinc-400 sm:block">
              {provider}
            </span>
          </div>

          {error && (
            <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          {/* Messages */}
          <div className="relative min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {loadingThread ? (
              <p className="flex items-center gap-2 px-4 py-8 text-sm font-medium text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-brand-700" /> Loading conversation…
              </p>
            ) : isEmpty ? (
              <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 py-10 text-center">
                {/* CSS-only soft gradient behind the empty state. Static under
                    prefers-reduced-motion, paused while the tab is hidden. */}
                <style>{`
@keyframes studio-blob-a { from { transform: translate3d(-8%, -5%, 0) scale(1); } to { transform: translate3d(8%, 6%, 0) scale(1.15); } }
@keyframes studio-blob-b { from { transform: translate3d(6%, 7%, 0) scale(1.1); } to { transform: translate3d(-6%, -7%, 0) scale(1); } }
.studio-blob { animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate; }
.studio-blob-a { animation-name: studio-blob-a; animation-duration: 26s; }
.studio-blob-b { animation-name: studio-blob-b; animation-duration: 34s; }
@media (prefers-reduced-motion: reduce) { .studio-blob { animation: none; } }
                `}</style>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <div
                    className="studio-blob studio-blob-a absolute -left-20 -top-20 h-72 w-72 rounded-full bg-orange-100 blur-3xl"
                    style={{ animationPlayState: bgPaused ? "paused" : "running" }}
                  />
                  <div
                    className="studio-blob studio-blob-b absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-zinc-200/70 blur-3xl"
                    style={{ animationPlayState: bgPaused ? "paused" : "running" }}
                  />
                </div>
                <div className="relative max-w-md">
                  <p className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white shadow-xs">
                    <Sparkles className="h-5 w-5" />
                  </p>
                  <h2 className="mt-3 text-xl font-black tracking-tight text-zinc-950">
                    What should we grow today?
                  </h2>
                  <p className="mt-1 text-sm font-medium text-zinc-500">
                    Ask in plain words, or try an example — answers stay in this
                    chat and every lookup uses the read-only allowlist.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {EXAMPLE_PROMPTS.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => void handleSend(example)}
                        disabled={sending}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-xs transition hover:border-brand-700 hover:text-brand-700 disabled:opacity-50"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-4 py-4">
                {truncated && (
                  <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
                    {TRUNCATED_NOTICE}
                  </p>
                )}
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.key} className="flex justify-end">
                      <div className="max-w-[85%] rounded-xl bg-brand-700 px-3.5 py-2.5 text-sm font-medium text-white shadow-xs sm:max-w-[75%]">
                        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                      </div>
                    </div>
                  ) : (
                    <div key={message.key} className="flex justify-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-brand-700">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 max-w-[85%] space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 shadow-xs sm:max-w-[75%]">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">
                          {message.text}
                        </p>
                        {message.toolNames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 border-t border-zinc-200 pt-2">
                            {message.toolNames.map((toolName) => (
                              <span
                                key={toolName}
                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-600"
                              >
                                <Terminal className="h-3 w-3 text-brand-700" />
                                {toolName}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <VerdictBadge message={message} />
                          {message.provider && (
                            <span className="font-mono text-[11px] font-medium text-zinc-400">
                              {message.provider}
                            </span>
                          )}
                        </div>
                        {message.notStored && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                            {NOT_STORED_NOTICE}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                )}
                {sending && (
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-700" /> Thinking…
                  </p>
                )}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          {/* Direct-tool result */}
          {(toolResult || toolError) && (
            <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 shrink-0 text-brand-700" />
                <span className="truncate text-xs font-black text-zinc-950">
                  {toolResult ? `Result: ${toolResult.tool}` : "Tool result"}
                </span>
                {runningTool && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Running…
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setToolResult(null);
                    setToolError(null);
                  }}
                  aria-label="Dismiss tool result"
                  className="ml-auto rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {toolError ? (
                <p className="mt-1 text-xs font-semibold text-red-600">{toolError}</p>
              ) : (
                toolResult && (
                  <pre className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-zinc-700">
                    {JSON.stringify(toolResult.data, null, 2)}
                  </pre>
                )
              )}
            </div>
          )}

          {/* Shortcut chips, grouped */}
          <div className="space-y-1.5 border-t border-zinc-200 bg-white px-4 py-2">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] font-black uppercase tracking-wide text-zinc-400">
                  {group.label}
                </span>
                {group.tools.map((tool) => (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => void runTool(tool.name, tool.args)}
                    disabled={runningTool !== null}
                    title={tool.name}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-600 shadow-xs transition hover:border-brand-700 hover:text-brand-700 disabled:opacity-50"
                  >
                    {runningTool === tool.name ? "Running…" : tool.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-zinc-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask Aldriva AI… (Enter to send, Shift+Enter for a new line)"
                rows={2}
                aria-label="Chat message"
                className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 shadow-xs focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || !composer.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-black text-white shadow-xs transition hover:bg-brand-800 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Send
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Conversation list drawer (mobile) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Conversations">
          <button
            type="button"
            aria-label="Close conversation list"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-zinc-950/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col rounded-r-xl border-r border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
              <span className="text-sm font-black text-zinc-950">Chats</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {conversationList}
          </div>
        </div>
      )}

      <AdminConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteWorking) setPendingDelete(null);
        }}
        title="Delete this chat?"
        description={`“${pendingDelete?.title || "Untitled chat"}” and all of its messages will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete chat"
        variant="danger"
        loading={deleteWorking}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
