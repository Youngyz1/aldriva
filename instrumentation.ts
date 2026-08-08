/**
 * instrumentation.ts – Next.js Instrumentation Hook
 *
 * WHY THIS FILE EXISTS
 * ─────────────────────
 * On some Windows setups the OS/router DNS resolver returns NAT64-synthesised
 * IPv6 addresses (64:ff9b::/96 or 64:ff9c::/96 prefix) for external hostnames
 * alongside – or instead of – their real public IPv4 addresses. Next.js's
 * built-in image optimiser treats any IP in a private/link-local/special
 * range as a potential SSRF vector and refuses to proxy the image, logging:
 *
 *   ⨯ upstream image https://[host] resolved to private ip ["64:ff9b::…"]
 *
 * HOW THIS FIXES IT
 * ──────────────────
 * The actual DNS-override logic lives in ./instrumentation-node.ts, a
 * separate local module. We only ever reference that file via a dynamic
 * import, and only inside the Node.js runtime branch. Because it's a local
 * file (not a Node built-in like "node:dns"), Turbopack treats it as its
 * own chunk and never needs to statically resolve node:dns when building
 * the Edge runtime bundle — which is what eliminates the
 * "Node.js module loaded... not supported in Edge Runtime" warning.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}