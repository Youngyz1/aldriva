import { Mail } from "lucide-react";
import Link from "next/link";

export default function AccountMessagesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Account Dashboard</p>
        <h1 className="mt-1 text-2xl font-black">Messages</h1>
        <p className="text-sm font-medium text-zinc-500">
          Communicate with your followers, ticket holders, and donors across your organizations.
        </p>
      </header>

      <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
          <Mail className="h-6 w-6 text-orange-600" />
        </div>
        <p className="font-black text-zinc-950">Inbox is empty</p>
        <p className="mt-1 max-w-xs text-sm text-zinc-500">
          Messages from followers and customer support requests will appear here once messaging is live.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600 transition"
        >
          ← Back to Overview
        </Link>
      </div>
    </div>
  );
}
