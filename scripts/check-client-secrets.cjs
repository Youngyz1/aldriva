const fs = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");

const projectRoot = path.resolve(__dirname, "..");
const staticRoot = path.join(projectRoot, ".next", "static");

loadEnvConfig(projectRoot);

if (!fs.existsSync(staticRoot)) {
  process.stderr.write("Missing .next/static; run a production build first.\n");
  process.exit(2);
}

const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "BRAVE_TAVILY_API_KEY",
  "TAVILY_API_KEY",
  "CRON_SECRET",
  "EVENTBRITE_PRIVATE_TOKEN",
  "EXEC_WORKER_TOKEN",
  "EXEC_WORKER_TOKEN_PREV",
  "FB_PAGE_ACCESS_TOKEN",
  "GEMINI_API_KEY",
  "INTERNAL_API_SECRET",
  "NEXTAUTH_SECRET",
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_SANDBOX_API_KEY",
  "NOWPAYMENTS_IPN_SECRET",
  "NOWPAYMENTS_SANDBOX_IPN_SECRET",
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "QA_INGEST_TOKEN",
  "QA_INGEST_TOKEN_PREV",
  "SITE_WEBHOOK_SECRET",
  "TICKETMASTER_API_KEY",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "STAGING_DATABASE_URL",
];

const publicValues = new Set(
  Object.entries(process.env)
    .filter(([name]) => name.startsWith("NEXT_PUBLIC_"))
    .map(([, value]) => value)
    .filter((value) => typeof value === "string" && value.length > 0)
);
const secretValues = new Set();
for (const [name, value] of Object.entries(process.env)) {
  if (
    !name.startsWith("NEXT_PUBLIC_") &&
    /(?:SECRET|TOKEN|PASSWORD|ACCESS[_-]?KEY|SERVICE[_-]?ROLE|API_KEY|PRIVATE|DATABASE_URL)/i.test(name) &&
    typeof value === "string" &&
    value.length > 0 &&
    !publicValues.has(value)
  ) {
    secretValues.add(value);
  }
}

const credentialPatterns = [
  /\bsk_(?:live|test|restricted)_[A-Za-z0-9]{12,}\b/g,
  /\bwhsec_[A-Za-z0-9_-]{16,}\b/g,
  /\bre_[A-Za-z0-9_-]{20,}\b/g,
];
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

const findings = new Set();
for (const file of walk(staticRoot)) {
  const contents = fs.readFileSync(file, "utf8");
  let found = false;

  for (const value of secretValues) {
    if (contents.includes(value)) {
      found = true;
      break;
    }
  }

  if (!found) {
    for (const name of secretNames) {
      if (contents.includes(name)) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    for (const pattern of credentialPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(contents)) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    const tokens = contents.match(jwtPattern) || [];
    for (const token of tokens) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64url").toString("utf8")
        );
        if (payload?.role === "service_role") {
          found = true;
          break;
        }
      } catch {
        // A JWT-shaped string is not enough; only flag decoded service-role JWTs.
      }
    }
  }

  if (found) findings.add(path.relative(projectRoot, file).split(path.sep).join("/"));
}

if (findings.size > 0) {
  process.stdout.write(`${[...findings].sort().join("\n")}\n`);
  process.exitCode = 1;
}
