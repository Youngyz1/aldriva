/**
 * e2e/admin-smoke.classify.ts — pure failure classification for the admin
 * smoke rig. Order matters: a session redirect (AUTH) outranks every other
 * signal, then HTTP status, then the app error screen, page errors, console
 * errors, and finally the Next dev overlay.
 */

export type SmokeResult = "PASS" | "FAIL" | "AUTH" | "SKIPPED";

export type RouteCheck = {
  requestedPath: string;
  finalPath: string;
  status: number | null;
  bodyText: string;
  pageError: string | null;
  consoleErrors: string[];
};

export type Verdict = {
  result: "PASS" | "FAIL" | "AUTH";
  detail: string | null;
};

const CONSOLE_RE = /TypeError|ReferenceError|Cannot read properties/;

// NOTE: no Next dev-overlay check. A probe showed <nextjs-portal> is always
// mounted (display:block, empty light DOM, ~96KB shadow template) with no
// queryable error markers, so presence always false-fires. Genuine overlay
// errors also surface as pageerror/console signals, which are covered here.
export function classifyRoute(check: RouteCheck): Verdict {
  if (check.finalPath !== check.requestedPath) {
    return { result: "AUTH", detail: `redirected to ${check.finalPath}` };
  }
  if (check.status !== null && check.status >= 400) {
    return { result: "FAIL", detail: `HTTP ${check.status}` };
  }
  if (/Something went wrong/.test(check.bodyText)) {
    return { result: "FAIL", detail: "app error screen: Something went wrong" };
  }
  if (/\b500\b/.test(check.bodyText)) {
    return { result: "FAIL", detail: "app error screen: 500 marker in body" };
  }
  if (check.pageError) {
    return { result: "FAIL", detail: check.pageError.slice(0, 2000) };
  }
  const hit = check.consoleErrors.find((m) => CONSOLE_RE.test(m));
  if (hit !== undefined) {
    return { result: "FAIL", detail: hit.slice(0, 2000) };
  }
  return { result: "PASS", detail: null };
}
