import type { Metadata } from "next";

// The invite token arrives in the URL fragment. no-referrer keeps this page
// from leaking its URL to anything it links to; noindex keeps it out of search.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function StaffAcceptLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
