/**
 * Server-safe constant for the admin sidebar collapse cookie.
 * Kept in its own module (no "use client") so both the server layout
 * (which reads it) and the client sidebar (which writes it) import the
 * same value. Importing values from a "use client" module into a server
 * component does not reliably resolve — hence this file.
 */
export const ADMIN_SIDEBAR_COOKIE = "admin_sidebar";
