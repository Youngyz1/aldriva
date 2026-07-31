/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.fund4agoodcause.com"),
  title: "Cookie Policy — Aldriva",
  description: "Read Aldriva's cookie policy.",
  openGraph: {
    title: "Cookie Policy — Aldriva",
    description: "Read Aldriva's cookie policy.",
    url: "https://www.fund4agoodcause.com/cookies",
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const sections = [
  "What Are Cookies",
  "How We Use Cookies",
  "Types of Cookies We Use",
  "Your Choices Regarding Cookies",
  "Changes to This Cookie Policy",
  "Contact Us",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="border-b border-zinc-200 bg-zinc-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold text-zinc-500">Help Center</p>
          <div className="mt-5 max-w-2xl rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-500 shadow-sm">
            Search help articles
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-black text-zinc-500">Help Center</p>
            <p className="mt-2 text-sm font-black uppercase tracking-wide text-orange-600">
              Terms and policies
            </p>
            <nav className="mt-6 max-h-[calc(100vh-180px)] space-y-2 overflow-auto pr-2 text-sm">
              {sections.map((section, index) => (
                <a
                  key={section}
                  href={`#${slugify(section)}`}
                  className="block rounded-lg px-3 py-2 font-semibold text-zinc-600 transition hover:bg-orange-50 hover:text-orange-700"
                >
                  {index + 1}. {section}
                </a>
              ))}
            </nav>
          </aside>

          <article className="max-w-4xl">
            <div className="border-b border-zinc-200 pb-8">
              <p className="text-sm font-black uppercase tracking-wide text-orange-600">
                Terms and policies
              </p>
              <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
                Aldriva Cookie Policy
              </h1>
              <p className="mt-4 text-base font-semibold text-zinc-500">
                Last Updated: June 16, 2026
              </p>
              <p className="mt-6 text-lg leading-8 text-zinc-700">
                This Cookie Policy explains how Aldriva uses cookies and similar tracking
                technologies when you visit our event platform, buy tickets, run events, or support fundraisers.
              </p>
            </div>

            <div className="mt-8 rounded-lg border border-orange-200 bg-orange-50 p-5">
              <h2 className="text-lg font-black">In this article</h2>
              <ol className="mt-4 grid gap-2 text-sm font-semibold text-zinc-700 sm:grid-cols-2">
                {sections.map((section, index) => (
                  <li key={section}>
                    <a className="hover:text-orange-700" href={`#${slugify(section)}`}>
                      {index + 1}. {section}.
                    </a>
                  </li>
                ))}
              </ol>
            </div>

            <div className="policy-content mt-10 space-y-10 text-base leading-8 text-zinc-700">
              <section id="what-are-cookies">
                <h2 className="text-2xl font-black text-zinc-950">1. What Are Cookies.</h2>
                <p className="mt-3">
                  Cookies are small text files stored on your browser or device when you visit websites. 
                  They allow websites to recognize your device, store preferences, gather usage analytics, 
                  and secure user sessions. We also use pixel tags, local storage, and similar technologies 
                  to achieve these goals.
                </p>
              </section>

              <section id="how-we-use-cookies">
                <h2 className="text-2xl font-black text-zinc-950">2. How We Use Cookies.</h2>
                <p className="mt-3">
                  We use cookies and similar technologies to:
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>Keep you signed into your Aldriva account.</li>
                  <li>Remember your settings, preferences, and details you enter during checkout.</li>
                  <li>Verify transactions, ticket bookings, and fundraiser donations safely.</li>
                  <li>Understand how visitors interact with the site, analyze page performance, and diagnose technical issues.</li>
                  <li>Protect our users and platform against fraud, security threats, and spam.</li>
                </ul>
              </section>

              <section id="types-of-cookies-we-use">
                <h2 className="text-2xl font-black text-zinc-950">3. Types of Cookies We Use.</h2>
                <p className="mt-3">
                  We categorize the cookies we use into the following types:
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <h3 className="font-bold text-zinc-950">3.1 Essential Cookies.</h3>
                    <p className="mt-1">
                      These are cookies necessary for basic website operations, including authentication, 
                      session management, security, and completing payments. Without these cookies, features 
                      like ticketing, donations, and sign-ins cannot function.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-950">3.2 Performance and Analytical Cookies.</h3>
                    <p className="mt-1">
                      These cookies collect information about how users navigate our site, such as pages visited, 
                      error rates, and navigation speed. This helps us optimize performance and usability.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-950">3.3 Preference and Functional Cookies.</h3>
                    <p className="mt-1">
                      These cookies remember your preferences and customizable settings, such as your selected 
                      appearance theme (light/dark mode) and input fields.
                    </p>
                  </div>
                </div>
              </section>

              <section id="your-choices-regarding-cookies">
                <h2 className="text-2xl font-black text-zinc-950">4. Your Choices Regarding Cookies.</h2>
                <p className="mt-3">
                  You have control over how cookies are stored on your device:
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>
                    <span className="font-bold">Browser Settings:</span> You can configure your browser to 
                    refuse all cookies, block third-party cookies, or alert you when a cookie is set. Please 
                    note that disabling essential cookies will prevent you from signing in or checking out.
                  </li>
                  <li>
                    <span className="font-bold">Consent Banner:</span> You can opt-in to accept our cookie usage 
                    via our global consent banner when you first visit the site.
                  </li>
                </ul>
              </section>

              <section id="changes-to-this-cookie-policy">
                <h2 className="text-2xl font-black text-zinc-950">5. Changes to This Cookie Policy.</h2>
                <p className="mt-3">
                  We may update this Cookie Policy from time to time. When we do, we will update the "Last Updated" 
                  date at the top of this page. We encourage you to check back periodically for any changes.
                </p>
              </section>

              <section id="contact-us">
                <h2 className="text-2xl font-black text-zinc-950">6. Contact Us.</h2>
                <p className="mt-3">
                  If you have any questions about our use of cookies or this Cookie Policy, you can email us at{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@fund4agoodcause.com">
                    support@fund4agoodcause.com
                  </a>.
                </p>
              </section>
            </div>

            <div className="mt-12 rounded-lg border border-zinc-200 bg-zinc-50 p-6">
              <h2 className="text-xl font-black">Still have questions?</h2>
              <p className="mt-3 text-base leading-7 text-zinc-700">
                Contact Aldriva support for privacy requests, account questions, and policy
                questions.
              </p>
              <a
                href="mailto:support@fund4agoodcause.com"
                className="mt-5 inline-flex rounded-full bg-orange-600 px-6 py-3 font-black text-white transition hover:bg-orange-700"
              >
                Contact us
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-3 border-t border-zinc-200 pt-6 text-sm font-bold text-zinc-500">
              <Link href="/about" className="hover:text-orange-600">About</Link>
              <Link href="/events" className="hover:text-orange-600">Events</Link>
              <Link href="/organizers" className="hover:text-orange-600">Organizations</Link>
              <Link href="/create-event" className="hover:text-orange-600">Create events</Link>
              <Link href="/signup" className="hover:text-orange-600">Create account</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
