"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// ── Inner component that reads searchParams ──────────────────────
function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const suspendedNotice = searchParams.get("suspended") === "1";
  // Set by proxy.ts when a purged account is bounced off a protected route.
  // Without this the redirect landed here silently and the user was told
  // nothing about why they had been signed out.
  const deletedNotice = searchParams.get("deleted") === "1";

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const redirectUrl = searchParams.get("redirect") || "/";
        router.push(redirectUrl);
      }
    });
  }, [router, searchParams]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError("");
    const redirectUrl = searchParams.get("redirect") || "/dashboard";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectUrl)}`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    if (data.user && !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setError("Please verify your email before logging in.");
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, deleted_at, purge_at")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.status === "suspended") {
        await supabase.auth.signOut();
        setError(
          "Your account is suspended. Please contact support for help."
        );
        setLoading(false);
        return;
      }

      // Account is in the 14-day recovery grace period
      if (profile?.deleted_at && profile?.purge_at) {
        const purgeAt = new Date(profile.purge_at);
        if (purgeAt > new Date()) {
          // Still recoverable — send to recovery page
          router.push("/recover-account");
          return;
        }
        // Grace period has expired — sign out and block
        await supabase.auth.signOut();
        setError("This account has been permanently deleted.");
        setLoading(false);
        return;
      }
    }

    const redirectUrl = searchParams.get("redirect") || "/";
    router.push(redirectUrl);
    router.refresh();
  }

  return (
    <div className="w-full min-h-screen flex">

      {/* LEFT — Hero */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-orange-900 to-orange-600 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-orange-300 blur-3xl" />
        </div>
        <div className="text-white max-w-lg relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <img src="/icons/icon-source.png" alt="Aldriva Logo" className="h-10 w-10 object-contain rounded-xl" />
            <span className="text-2xl font-black tracking-tight">
              Aldriva
            </span>
          </div>

          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Welcome back to your events hub.
          </h1>
          <p className="text-lg text-orange-100 mb-10">
            Manage your events, track donations, and connect with your
            community — all in one place.
          </p>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-3xl font-black text-white">10K+</p>
              <p className="text-sm text-orange-200">Events hosted</p>
            </div>
            <div>
              <p className="text-3xl font-black text-white">$2M+</p>
              <p className="text-sm text-orange-200">Funds raised</p>
            </div>
            <div>
              <p className="text-3xl font-black text-white">98%</p>
              <p className="text-sm text-orange-200">Satisfaction</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — Form */}
      <div className="flex-1 bg-zinc-50 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-8">
            <img src="/icons/icon-source.png" alt="Aldriva Logo" className="h-8 w-8 object-contain rounded-lg" />
            <span className="text-xl font-black">Aldriva</span>
          </div>

          <h2 className="text-3xl font-black text-zinc-900 mb-2">
            Welcome back
          </h2>
          <p className="text-zinc-500 mb-8">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-orange-500 font-semibold hover:text-orange-600"
            >
              Sign up free
            </Link>
          </p>

          {/* Notices */}
          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
              <p>{error}</p>
              <Link
                href={`/forgot-password${form.email ? `?email=${encodeURIComponent(form.email)}` : ""}`}
                className="mt-2 inline-block font-black text-red-700 underline underline-offset-4"
              >
                Forgot your password?
              </Link>
            </div>
          )}

          {resetSuccess && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              ✓ Password updated. You can now log in with your new password.
            </div>
          )}

          {suspendedNotice && !error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
              Your account is suspended. Please contact support for help.
            </div>
          )}

          {deletedNotice && !error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
              This account has been permanently deactivated and can no longer be
              restored. Contact support if you believe this is a mistake.
            </div>
          )}

          {/* Google — PRIMARY */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-zinc-300 rounded-2xl px-5 py-4 font-bold text-zinc-800 hover:bg-zinc-50 transition shadow-sm disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-sm text-zinc-400 font-medium">or</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          {/* Email toggle */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="w-full border border-zinc-300 bg-white rounded-2xl px-5 py-4 font-bold text-zinc-600 hover:bg-zinc-50 transition shadow-sm"
            >
              Continue with Email
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  Email
                </label>
                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  type="email"
                  placeholder="you@example.com"
                  className="w-full border border-zinc-300 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 bg-white"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-zinc-700">
                    Password
                  </label>
                  <Link
                    href={`/forgot-password${form.email ? `?email=${encodeURIComponent(form.email)}` : ""}`}
                    className="text-sm font-black text-orange-600 hover:text-orange-700"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    type={showPassword ? "text" : "password"}
                    placeholder="Your password"
                    className="w-full border border-zinc-300 rounded-2xl px-5 py-4 pr-12 outline-none focus:border-orange-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-600"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-4 rounded-2xl font-bold text-lg transition"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>

              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition"
              >
                ← Back
              </button>
            </form>
          )}

          <p className="text-xs text-zinc-400 text-center mt-6">
            By logging in you agree to our{" "}
            <Link href="/privacy" className="underline hover:text-zinc-600">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Default export wraps LoginForm in Suspense ───────────────────
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}