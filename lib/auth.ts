/**
 * lib/auth.ts
 * Server-side RBAC helper functions.
 * All functions are async and safe for use in Server Components and API routes.
 * Do NOT import React hooks here — this is server-only code.
 */

import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS for privileged reads (profile role lookups).
// Service role: bypasses RLS — admin operations only
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase service role is not configured.');
  }

  return createClient(url, key);
}

/** Returns the currently authenticated Supabase auth user, or null. */
export async function getCurrentUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** Returns the profile row (id, role, status) for the current user, or null. */
export async function getCurrentUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabaseAdmin = getServiceClient();
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status, deleted_at, purge_at')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  if (data.deleted_at && data.purge_at) {
    const purgeAt = new Date(data.purge_at);
    if (purgeAt <= new Date()) {
      return null;
    }
  }

  return data as {
    id: string;
    role: string;
    status: string;
    deleted_at?: string | null;
    purge_at?: string | null;
  };
}

/** Returns true if the current user has role 'admin'. */
export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentUserProfile();
  return profile?.role === 'admin' && profile.status === 'active' && !profile.deleted_at;
}

/** Returns true if the current user has role 'organizer' or 'admin'. */
export async function isOrganizer(): Promise<boolean> {
  const profile = await getCurrentUserProfile();
  return (
    profile?.status === 'active' &&
    !profile.deleted_at &&
    (profile.role === 'organizer' || profile.role === 'admin')
  );
}

/**
 * Guards server components that require admin access.
 * Redirects to '/' if not admin.
 * For use in Server Components / page.tsx only.
 */
export async function requireAdmin(): Promise<void> {
  const admin = await isAdmin();
  if (!admin) {
    redirect('/');
  }
}

/**
 * Guards server components that require authentication.
 * Redirects to '/login' if not authenticated.
 * For use in Server Components / page.tsx only.
 */
export async function requireAuth(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect('/login');
  }

  if (profile.deleted_at && profile.purge_at) {
    const purgeAt = new Date(profile.purge_at);
    if (purgeAt > new Date()) {
      redirect('/recover-account');
    } else {
      redirect('/login');
    }
  }

  if (profile.status !== 'active') {
    redirect('/login');
  }
}
