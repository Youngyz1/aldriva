# Aldriva — Multi-Module Business & Community Platform

> **Everything Your Business Needs. One Platform.**  
> Official Website: [https://aldriva.com](https://aldriva.com)

Aldriva is an all-in-one business, creator, and community platform that enables users to create customizable business websites, publish articles and editorial content, host events with interactive visual seating and offline QR check-in, launch community fundraisers with transparent beneficiary ledgers, and sell digital and physical products with dual credit card and crypto payment rails.

---

## 🛠 Technology Stack

- **Framework**: Next.js 16.3.4 (App Router, Turbopack, React 19.2.4)
- **Database & Auth**: Supabase (PostgreSQL 15+, Auth, Storage, Realtime)
- **Styling**: Tailwind CSS v4, Zinc neutral palette, Orange brand accent (`--brand-700` / `#c2410c`)
- **UI & Components**: Radix UI Primitives, Lucide React icons, Framer Motion v12
- **Editor**: TipTap Rich Text Suite (`@tiptap/react`, `@tiptap/starter-kit`)
- **Payments**: Stripe (Credit/Debit cards) & NOWPayments (Cryptocurrency)
- **Communication**: Resend (Transactional emails)
- **Maps & Location**: Leaflet 1.9 & OpenStreetMap

---

## 🚀 Quick Start & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local` and configure the necessary Supabase and payment credentials:
```bash
cp .env.example .env.local
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

Aldriva maintains a strict 100% test pass rate running via the native Node.js test runner:

```bash
# Run full unit and integration test suite
npm test

# Run TypeScript type checks
npx tsc --noEmit

# Run linting
npm run lint
```

> **Note**: Test files are explicitly registered in `package.json`. When creating new `*.test.cjs` or `*.test.ts` files, remember to append them to the `test` script in `package.json`.

---

## 🤖 AI Agent & Developer Architecture

This repository is designed to be the authoritative source of truth for both human engineers and autonomous AI coding agents (Claude Code, OpenAI Codex, Google Antigravity, OpenCode).

- **Universal Agent Instructions**: [`AGENTS.md`](./AGENTS.md)
- **Current Development Position**: [`docs/CURRENT-STATE.md`](./docs/CURRENT-STATE.md)
- **Platform Master Roadmap**: [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- **System Architecture**: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- **Architectural Decisions**: [`docs/DECISIONS.md`](./docs/DECISIONS.md)
- **Design System Reference**: [`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md) and [`.aldriva/design/`](./.aldriva/design/)
- **AI Agent Engineering Guide**: [`docs/AI-AGENT-GUIDE.md`](./docs/AI-AGENT-GUIDE.md)

---

## 📚 Core Domain Documentation

- [Aldriva Events & Seating Master Index](docs/events/index.md)
- [Aldriva Fundraising & Beneficiaries Master Index](docs/fundraising/index.md)
- [Aldriva Organizations & Profiles Master Index](docs/organizations/index.md)
- [Aldriva Articles & Content Publishing Master Index](docs/articles/index.md)
