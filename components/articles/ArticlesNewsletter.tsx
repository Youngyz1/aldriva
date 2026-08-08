"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Frontend-only newsletter capture — there is no subscribers table or email
 * list integration in this codebase, and this task is scoped to UI only, so
 * submitting here just validates the address and shows a success state. It
 * does not persist anywhere. Wiring it to a real list (e.g. a Resend
 * audience) is a follow-up backend task.
 */
export default function ArticlesNewsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "success">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setStatus("error");
      return;
    }
    setStatus("success");
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 via-amber-50 to-violet-50 px-6 py-14 text-center shadow-sm ring-1 ring-orange-100 sm:px-12 sm:py-20">
        <div aria-hidden="true" className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-orange-200/40 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-violet-200/40 blur-3xl" />

        <div className="relative mx-auto max-w-xl">
          <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-sm">
            <Mail className="h-6 w-6" />
          </span>

          <h2 className="mt-5 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
            Stay Inspired Every Week
          </h2>
          <p className="mt-3 text-base font-medium text-zinc-600 sm:text-lg">
            Get the best new stories, fundraising ideas, and community highlights
            delivered straight to your inbox — no spam, unsubscribe anytime.
          </p>

          {status === "success" ? (
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700">
              You&apos;re on the list — thanks for subscribing!
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="you@example.com"
                className="h-12 flex-1 rounded-full border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-950 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
              <button
                type="submit"
                className="btn-ripple inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-orange-600 px-6 text-sm font-black text-white transition hover:bg-orange-700 active:scale-[0.98]"
              >
                Subscribe
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
          {status === "error" && (
            <p className="mt-3 text-xs font-bold text-red-600">Please enter a valid email address.</p>
          )}
        </div>
      </div>
    </section>
  );
}
