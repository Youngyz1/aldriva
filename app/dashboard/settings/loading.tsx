// app/dashboard/settings/loading.tsx — Settings skeleton
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header — open skeleton bars mirroring the open settings header. */}
      <div className="space-y-2 pb-1">
        <div className="h-2.5 w-16 rounded bg-zinc-200" />
        <div className="h-7 w-24 rounded bg-zinc-200" />
        <div className="h-2.5 w-64 rounded bg-zinc-200" />
      </div>
      {/* Account Settings section — open skeleton mirroring open SettingsCard. */}
      <div className="border-t border-zinc-200 pt-6">
        <div className="h-4 w-36 rounded bg-zinc-200" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-2.5 w-24 rounded bg-zinc-200" />
              <div className="h-11 w-full rounded-xl bg-zinc-100" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          <div className="h-10 w-28 rounded-xl bg-zinc-200" />
          <div className="h-10 w-48 rounded-xl bg-zinc-100" />
        </div>
      </div>
      {/* Notification Preferences section — open skeleton. */}
      <div className="border-t border-zinc-200 pt-6">
        <div className="h-4 w-48 rounded bg-zinc-200" />
        <div className="mt-5 space-y-0 divide-y divide-zinc-100">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-4">
              <div className="space-y-2">
                <div className="h-3 w-40 rounded bg-zinc-200" />
                <div className="h-2.5 w-64 rounded bg-zinc-100" />
              </div>
              <div className="h-7 w-12 rounded-full bg-zinc-200" />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="h-10 w-36 rounded-xl bg-zinc-200" />
        </div>
      </div>
      {/* Organizer Profile section — open skeleton. */}
      <div className="border-t border-zinc-200 pt-6">
        <div className="h-4 w-36 rounded bg-zinc-200" />
        <div className="mt-3 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-zinc-200" />
            <div className="h-2.5 w-44 rounded bg-zinc-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-xl bg-zinc-100" />
            <div className="h-10 w-28 rounded-xl bg-zinc-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
