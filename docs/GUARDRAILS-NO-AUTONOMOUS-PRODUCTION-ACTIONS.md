# Aldriva — Guardrails: No Autonomous Production Actions (Stage 18)

Agents stay L0. The following are prohibited and enforced as stated. Each row
names the mechanism and the test pinning it.

| # | Prohibition | Enforcement mechanism | Test |
|---|---|---|---|
| 1 | Autonomous production deployment | No Vercel/GitHub deploy API in agent paths; `qa-sweep.yml` has no deploy step, target only from `QA_STAGING_URL` with fail-closed empty check (`qa-sweep.yml:102`) | `no-autonomous-production-actions.test.cjs` (forbidden-API scan) |
| 2 | Autonomous DB migration | No DDL strings in runtime code; migrations are versioned SQL only | same scan (runtime-ddl pattern) |
| 3 | Arbitrary shell execution | No `child_process`/spawn/eval in agent paths | same scan |
| 4 | Arbitrary filesystem access | No fs-write APIs in agent paths | same scan |
| 5 | Autonomous financial transactions | Payment tools read-only by construction (`tenant-payments.ts:1-11`); financial tables never written from agent paths; credit RPCs live only in out-of-scope webhook handlers | same scan (payment + financial-write patterns) |
| 6 | Unrestricted infrastructure control | No infra tokens/env reads in agent paths (16 reviewed vars, allowlisted in-test) | env-allowlist test |
| 7 | Agent self-escalation | All agents L0 (140 seeds); no agents-table writes in code; no L1-L4 literals; L0 gate blocks approval-required/high tools (`approvals.ts:43-65`); fallback allowlist has no writers | registry + autonomy tests |
| 8 | Unapproved writes | Writes limited to reviewed tables; `execSmokeNotify`/`request_qa_run`/`memory_propose` approval-gated; risky tools ungranted | write-scope + grant-confinement tests |
| 9 | Workflow/deployment triggering | No GitHub API in scope; `github-actions-provider` never triggers (header); `request_qa_run` returns a receipt, human approves, worker polls | dangerous-API scan + qa-sweep review (Phase A) |

## Known gap (not fixed — decision needed)

**S18-1**: `createNotification` + `notifyOwner` are medium-risk, write-capable,
`approval_required=false` (`migration_139:87-88`), and medium is outside the
L0-blocking set (`approvals.ts:29`). An L0 agent granted these tools would
execute them approval-free. Currently ungranted to all agents (ACL-only
defense). Pinned by `approval-flag-gap.test.cjs` (intentionally failing, NOT
in `package.json`). Fix options: set `approval_required=true` (migration) or
block medium for L0 (runtime). Needs a product decision.

## Relaxation preconditions

Before any prohibition is relaxed: (a) written product decision naming the new
boundary; (b) the corresponding test updated to pin the NEW boundary (never
deleted); (c) human approval path exists for any new write capability;
(d) staging verification of the changed surface.
