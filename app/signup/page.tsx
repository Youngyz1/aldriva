"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const password = form.password;
  const isMinLength = password.length >= 8;
  const hasCapitalLetter = /[A-Z]/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(password);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/");
      }
    });
  }, [router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const isMinLength = form.password.length >= 8;
    const hasCapitalLetter = /[A-Z]/.test(form.password);
    const hasLetter = /[a-zA-Z]/.test(form.password);
    const hasNumber = /[0-9]/.test(form.password);
    const hasSpecialChar = /[^a-zA-Z0-9]/.test(form.password);

    if (!isMinLength || !hasCapitalLetter || !hasLetter || !hasNumber || !hasSpecialChar) {
      setError("Password does not meet the security requirements.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    // Guard: block re-registration if email is in pending-deletion grace period
    try {
      const guardRes = await fetch("/api/signup-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      if (guardRes.ok) {
        const guardData = await guardRes.json();
        if (guardData.isPendingDeletion) {
          const purgeDate = guardData.purgeAt
            ? new Date(guardData.purgeAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : "soon";
          setError(
            `An account with this email is currently scheduled for deletion (purge date: ${purgeDate}). ` +
              `Please log in to recover it, or wait until after the deletion date to register again.`
          );
          setLoading(false);
          return;
        }
      }
    } catch {
      // Guard API failure is non-fatal; proceed with signup
    }

    const emailRedirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : undefined;

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { emailRedirectTo },
    });

    setLoading(false);

    if (signupError) {
      const msg = signupError.message.toLowerCase();
      if (
        msg.includes("already registered") ||
        msg.includes("already exists") ||
        msg.includes("email address is already") ||
        msg.includes("user already registered")
      ) {
        setError(
          "An account with this email already exists. Please log in instead."
        );
      } else {
        setError(signupError.message);
      }
      return;
    }

    if (
      data.user &&
      data.user.identities &&
      data.user.identities.length === 0
    ) {
      setError(
        "An account with this email already exists. Please log in instead."
      );
      return;
    }

    await supabase.auth.signOut();
    setSuccess(true);
  }

  return (
    <div className="w-full min-h-screen flex">

      {/* LEFT — Hero */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-orange-900 to-orange-600 items-center justify-center p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-orange-300 blur-3xl" />
        </div>
        <div className="text-white max-w-lg relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <img src="/logo.png" alt="Aldriva Logo" className="h-10 w-10 object-contain rounded-xl" />
            <span className="text-2xl font-black tracking-tight">
              Aldriva
            </span>
          </div>

          <h1 className="text-5xl font-bold mb-6 leading-tight">
            Create events, raise funds, find sponsors.
          </h1>
          <p className="text-lg text-orange-100 mb-10">
            Join thousands of organizers already using Aldriva to run
            successful events and campaigns.
          </p>

          {/* Stats */}
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
            <img src="/logo.png" alt="Aldriva Logo" className="h-8 w-8 object-contain rounded-lg" />
            <span className="text-xl font-black">Aldriva</span>
          </div>

          <h2 className="text-3xl font-black text-zinc-900 mb-2">
            Create your account
          </h2>
          <p className="text-zinc-500 mb-8">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-orange-500 font-semibold hover:text-orange-600"
            >
              Log in
            </Link>
          </p>

          {/* Error */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-5 py-4 rounded-2xl text-sm">
              {error}
              {error.includes("already exists") && (
                <span>
                  {" "}
                  <Link
                    href="/login"
                    className="font-bold underline text-red-700"
                  >
                    Log in here
                  </Link>
                </span>
              )}
            </div>
          )}

          {/* Success */}
          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-6 text-sm text-green-800">
              <p className="text-lg font-black mb-1">✓ Account created!</p>
              <p>
                Check your email and confirm your account before logging in.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block font-bold text-green-700 underline"
              >
                Go to login →
              </Link>
            </div>
          ) : (
            <>
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
                    d="M5.84 14.09c-.22-.66-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {googleLoading
                  ? "Redirecting..."
                  : "Continue with Google"}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-zinc-200" />
                <span className="text-sm text-zinc-400 font-medium">or</span>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>

              {/* Email form toggle */}
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
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        onFocus={() => setIsPasswordFocused(true)}
                        onBlur={() => setIsPasswordFocused(false)}
                        required
                        type={showPassword ? "text" : "password"}
                        placeholder="Min. 8 characters"
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

                    <AnimatePresence>
                      {(isPasswordFocused || password.length > 0) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2.5 text-xs text-zinc-600">
                            <p className="font-bold text-zinc-700 mb-1">Password must contain:</p>
                            <div className="flex items-center gap-2">
                              {isMinLength ? (
                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                </div>
                              )}
                              <span className={isMinLength ? "text-emerald-700 font-semibold" : "text-zinc-500"}>At least 8 characters</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {hasCapitalLetter ? (
                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                </div>
                              )}
                              <span className={hasCapitalLetter ? "text-emerald-700 font-semibold" : "text-zinc-500"}>At least 1 capital letter</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {hasLetter ? (
                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                </div>
                              )}
                              <span className={hasLetter ? "text-emerald-700 font-semibold" : "text-zinc-500"}>At least 1 letter</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {hasNumber ? (
                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                </div>
                              )}
                              <span className={hasNumber ? "text-emerald-700 font-semibold" : "text-zinc-500"}>At least 1 number</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {hasSpecialChar ? (
                                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                                </div>
                              )}
                              <span className={hasSpecialChar ? "text-emerald-700 font-semibold" : "text-zinc-500"}>At least 1 special character</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">
                      Confirm Password
                    </label>
                    <input
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      required
                      type="password"
                      placeholder="Repeat your password"
                      className="w-full border border-zinc-300 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-4 rounded-2xl font-bold text-lg transition"
                  >
                    {loading ? "Creating account..." : "Create Account"}
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
                By creating an account you agree to our{" "}
                <Link href="/privacy" className="underline hover:text-zinc-600">
                  Privacy Policy
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}