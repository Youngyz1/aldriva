/**
 * instrumentation-node.ts – Node.js-only DNS override logic
 *
 * This file is ONLY ever reached via a dynamic import from instrumentation.ts,
 * and only when NEXT_RUNTIME === "nodejs". It is never statically bundled
 * into the Edge runtime, so importing "node:dns" here is safe.
 *
 * dns.setServers() replaces the list of resolvers Node's DNS module queries.
 * Pointing at Google Public DNS (8.8.8.8 / 8.8.4.4) and Cloudflare
 * (1.1.1.1 / 1.0.0.1) bypasses the local ISP/router resolver that was
 * synthesising NAT64 addresses, so external hostnames resolve to their
 * genuine public IPv4 addresses and the image optimiser's SSRF check passes.
 */

import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1"]);

if (process.env.NODE_ENV === "development") {
  console.log(
    "[instrumentation] DNS resolvers overridden →",
    dns.getServers().join(", ")
  );
}