"use client";

import { useEffect } from "react";

export default function WebsiteBuilderError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Website Builder route failed to render", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col justify-center gap-4 px-4 py-12 sm:px-6">
      <div role="alert" className="space-y-2">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          The Website Builder could not be loaded
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Try loading the editor again. The error details have been logged for diagnosis.
        </p>
        {error.digest ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={retry}
        className="min-h-11 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </main>
  );
}
