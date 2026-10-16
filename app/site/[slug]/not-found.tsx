export default function TenantSiteNotFound() {
  return (
    <main className="public-site mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-center text-[var(--ps-text)]">
      <h1 className="font-semibold">Page not found</h1>
      <p className="mt-[var(--ps-space-3)] text-sm text-[var(--ps-muted)]">This page isn’t available on this site.</p>
    </main>
  );
}
