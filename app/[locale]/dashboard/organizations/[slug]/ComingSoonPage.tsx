import Link from "next/link";
import { Construction } from "lucide-react";

export default function ComingSoonPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100">
        <Construction className="h-8 w-8 text-orange-600" />
      </div>
      <h1 className="text-2xl font-black text-zinc-950">{title}</h1>
      <p className="mt-2 max-w-sm text-sm font-medium text-zinc-500">
        {description ?? "This module is being built and will be available soon. Stay tuned!"}
      </p>
      <Link
        href=".."
        className="mt-6 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-600"
      >
        ← Back to Overview
      </Link>
    </div>
  );
}
