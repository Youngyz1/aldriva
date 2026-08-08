/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";


export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Privacy Policy — Aldriva",
  description: "Read Aldriva's privacy policy.",
  alternates: {
    canonical: `${getSiteUrl()}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy — Aldriva",
    description: "Read Aldriva's privacy policy.",
    url: `${getSiteUrl()}/privacy`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy — Aldriva",
    description: "Read Aldriva's privacy policy.",
    images: ["/og-image.png"],
  },
};

const sections = [
  "Who We Are",
  "Our Privacy Statement",
  "Personal Data That We Collect",
  "How We Use Your Personal Data",
  "How We Disclose And Transfer Your Personal Data",
  "How We Store Your Personal Data",
  "How You Can Access, Update, Correct or Delete Your Personal Data",
  "How Long We Retain Your Personal Data",
  "Cookies, Pixel Tags, Web Storage And Similar Technologies",
  "Your Choices",
  "Exclusions",
  "Children - Children's Online Privacy Protection Act",
  "International Privacy Laws",
  "Changes To This Privacy Policy",
  "Dispute Resolution",
  "EEA, Switzerland And UK Only",
  "Residents Of Certain States",
  "Brazil Only",
  "Notice For People Who Don't Use Aldriva Services",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function PrivacyPage() {
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
                Aldriva Privacy Policy
              </h1>
              <p className="mt-4 text-base font-semibold text-zinc-500">
                Last Updated: June 3, 2026
              </p>
              <p className="mt-6 text-lg leading-8 text-zinc-700">
                This Privacy Policy explains how Aldriva collects, uses, discloses,
                transfers, stores, and protects personal information when people use our
                event discovery, ticketing, registration, and fundraising services.
              </p>
              <p className="mt-4 text-base leading-7 text-zinc-600">
                Aldriva is based in the United States. We do not have a public
                domain yet. Until a permanent domain and legal mailing address are added,
                you can contact us at{" "}
                <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                  support@aldriva.com
                </a>
                .
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
              <section id="who-we-are">
                <h2 className="text-2xl font-black text-zinc-950">1. Who We Are.</h2>
                <h3 className="mt-5 text-xl font-black text-zinc-950">1.1 Aldriva Services.</h3>
                <p className="mt-3">
                  Aldriva is an event and ticketing platform that helps people create,
                  discover, share, register for, and attend live experiences. Our services may
                  include event pages, organizer tools, ticket purchasing, ticket delivery,
                  fundraising pages, account services, customer support, and related features
                  that we make available through our website, applications, APIs, and other
                  online services.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">1.2 Who's Who.</h3>
                <p className="mt-3">
                  "Organizer" means a person or business that creates, lists, imports, manages,
                  promotes, or hosts events or fundraisers on Aldriva. "Consumer" means a
                  person who browses, registers for, purchases, donates to, or attends events or
                  fundraisers. Organizers, Consumers, visitors, and other users are collectively
                  called "Users," "you," or "your." "Aldriva," "we," "us," and "our" mean
                  Aldriva.
                </p>
              </section>

              <section id="our-privacy-statement">
                <h2 className="text-2xl font-black text-zinc-950">2. Our Privacy Statement.</h2>
                <p className="mt-3">
                  This Privacy Policy applies to personal data that can identify, describe,
                  relate to, or reasonably be linked to a person. It does not apply to
                  information that cannot reasonably identify a person, such as aggregated or
                  anonymized data. We take privacy seriously and use personal data only as
                  described in this policy or as otherwise permitted by law.
                </p>
              </section>

              <section id="personal-data-that-we-collect">
                <h2 className="text-2xl font-black text-zinc-950">3. Personal Data That We Collect.</h2>
                <h3 className="mt-5 text-xl font-black text-zinc-950">3.1 Information Collected From All Users.</h3>
                <p className="mt-3">
                  We may collect information you provide directly, such as your name, email
                  address, password, account details, event interests, messages, survey
                  responses, support requests, ticket details, registration details, donation
                  details, and any other information you choose to provide.
                </p>
                <p className="mt-3">
                  We may also automatically collect technical information such as IP address,
                  browser type, device identifiers, operating system, referring pages, pages
                  viewed, search activity, clicks, approximate location, and similar usage data.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">3.2 Information Collected From Organizers.</h3>
                <p className="mt-3">
                  If you create or manage events, we may collect organizer profile details,
                  event details, payout or tax information, phone numbers, billing details,
                  verification information, and information from payment processors, banks, or
                  fraud prevention partners.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">3.3 Information Collected From Consumers.</h3>
                <p className="mt-3">
                  If you buy or register for a ticket, we may collect attendee names, email
                  addresses, order details, payment status, ticket delivery information, answers
                  to organizer registration questions, and other information needed to complete
                  the transaction.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">3.4 Information From Other Sources.</h3>
                <p className="mt-3">
                  We may receive information from organizers, payment partners, authentication
                  providers, analytics providers, marketing partners, public sources, social
                  platforms, or other services that you connect to Aldriva.
                </p>
              </section>

              <section id="how-we-use-your-personal-data">
                <h2 className="text-2xl font-black text-zinc-950">4. How We Use Your Personal Data.</h2>
                <p className="mt-3">We may use personal data to:</p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>Provide, operate, personalize, and improve Aldriva services.</li>
                  <li>Create accounts, publish events, process registrations, and deliver tickets.</li>
                  <li>Process payments, payouts, refunds, donations, tax records, and fraud checks.</li>
                  <li>Provide customer support and respond to questions or complaints.</li>
                  <li>Send transactional notices, ticket confirmations, security alerts, and policy updates.</li>
                  <li>Send marketing messages where allowed by law and your communication choices.</li>
                  <li>Recommend events, fundraisers, organizers, or content that may interest you.</li>
                  <li>Protect our users, prevent abuse, enforce our terms, and comply with law.</li>
                  <li>Analyze usage, debug errors, and develop new products and features.</li>
                </ul>
                <p className="mt-3">
                  Aldriva does not charge a separate service fee to ticket buyers. Ticket
                  prices shown on the platform are intended to be all-inclusive unless a page
                  clearly says otherwise.
                </p>
              </section>

              <section id="how-we-disclose-and-transfer-your-personal-data">
                <h2 className="text-2xl font-black text-zinc-950">5. How We Disclose And Transfer Your Personal Data.</h2>
                <p className="mt-3">
                  We are not in the business of selling personal data. We may disclose personal
                  data to organizers, payment processors, hosting providers, email providers,
                  analytics providers, fraud prevention vendors, customer support vendors,
                  professional advisers, affiliates, and other service providers that help us
                  operate Aldriva.
                </p>
                <p className="mt-3">
                  When you register for, buy, donate to, or express interest in an event or
                  fundraiser, the organizer may receive the information needed to manage that
                  event or fundraiser. Organizers are responsible for their own use of that
                  information and may have their own privacy practices.
                </p>
                <p className="mt-3">
                  We may also disclose information if required by law, to protect rights and
                  safety, to investigate fraud or security issues, or as part of a merger,
                  financing, acquisition, sale of assets, reorganization, or similar transaction.
                </p>
              </section>

              <section id="how-we-store-your-personal-data">
                <h2 className="text-2xl font-black text-zinc-950">6. How We Store Your Personal Data.</h2>
                <p className="mt-3">
                  We may store personal data directly or through trusted third-party service
                  providers. We use reasonable administrative, technical, and organizational
                  safeguards designed to protect personal data from unauthorized access, loss,
                  misuse, disclosure, alteration, or destruction. No online service is completely
                  secure, so you should use care when sharing information online.
                </p>
              </section>

              <section id="how-you-can-access-update-correct-or-delete-your-personal-data">
                <h2 className="text-2xl font-black text-zinc-950">
                  7. How You Can Access, Update, Correct or Delete Your Personal Data.
                </h2>
                <p className="mt-3">
                  You may be able to access, update, or delete some account information by
                  logging into your Aldriva account. You may also contact us at{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>{" "}
                  to request access, correction, deletion, restriction, portability, or other
                  privacy rights available under applicable law.
                </p>
                <p className="mt-3">
                  If your information has already been shared with an organizer because you
                  registered for or interacted with that organizer's event, you may also need to
                  contact the organizer directly.
                </p>
              </section>

              <section id="how-long-we-retain-your-personal-data">
                <h2 className="text-2xl font-black text-zinc-950">8. How Long We Retain Your Personal Data.</h2>
                <p className="mt-3">
                  We retain personal data for as long as reasonably needed to provide the
                  services, maintain records, resolve disputes, prevent fraud, comply with legal
                  obligations, enforce agreements, and support legitimate business purposes. If
                  you request deletion, some information may remain in backups, legal records,
                  payment records, tax records, security logs, or organizer records as permitted
                  or required by law.
                </p>
                <p className="mt-3">
                  Refund requests may be considered within 10 days of the request, subject to
                  organizer rules, event status, fraud checks, payment processor requirements,
                  and applicable law.
                </p>
              </section>

              <section id="cookies-pixel-tags-web-storage-and-similar-technologies">
                <h2 className="text-2xl font-black text-zinc-950">
                  9. Cookies, Pixel Tags, Web Storage And Similar Technologies.
                </h2>
                <p className="mt-3">
                  We may use cookies, pixels, local storage, web storage, SDKs, and similar
                  technologies to remember preferences, keep users signed in, measure traffic,
                  understand product usage, improve security, and support advertising or
                  analytics. You can usually control cookies through your browser settings, but
                  some features may not work properly if cookies are disabled.
                </p>
              </section>

              <section id="your-choices">
                <h2 className="text-2xl font-black text-zinc-950">10. Your Choices.</h2>
                <h3 className="mt-5 text-xl font-black text-zinc-950">10.1 Limit The Personal Data You Provide.</h3>
                <p className="mt-3">
                  You may browse some parts of Aldriva without creating an account. Certain
                  features, including buying tickets, receiving ticket confirmations, creating
                  events, and receiving payouts, require personal data.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">10.2 Opt Out From Electronic Communications.</h3>
                <p className="mt-3">
                  You may unsubscribe from marketing emails by using the unsubscribe link in the
                  message or contacting us. Transactional messages, including ticket receipts,
                  password resets, refund updates, event notices, and security alerts, may still
                  be sent when needed to provide the services.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">10.3 Do Not Track.</h3>
                <p className="mt-3">
                  We do not currently respond to browser "Do Not Track" signals unless required
                  by applicable law.
                </p>
                <h3 className="mt-5 text-xl font-black text-zinc-950">10.4 Targeted Advertising.</h3>
                <p className="mt-3">
                  Where we use advertising or analytics partners, you may have choices through
                  your browser, device settings, platform settings, or legally required opt-out
                  links that we provide when applicable.
                </p>
              </section>

              <section id="exclusions">
                <h2 className="text-2xl font-black text-zinc-950">11. Exclusions.</h2>
                <p className="mt-3">
                  This Privacy Policy does not apply to websites, services, payment pages,
                  social platforms, or third-party links that Aldriva does not own or
                  control. It also does not cover information you provide directly to organizers
                  outside of Aldriva.
                </p>
              </section>

              <section id="children-children-s-online-privacy-protection-act">
                <h2 className="text-2xl font-black text-zinc-950">
                  12. Children - Children's Online Privacy Protection Act.
                </h2>
                <p className="mt-3">
                  Aldriva is not directed to children under 13, and we do not knowingly
                  collect personal data from children under 13. If you believe a child under 13
                  has provided personal data to us, please contact us so we can take appropriate
                  action.
                </p>
              </section>

              <section id="international-privacy-laws">
                <h2 className="text-2xl font-black text-zinc-950">13. International Privacy Laws.</h2>
                <p className="mt-3">
                  Aldriva is based in the United States. If you use the services from
                  outside the United States, your information may be processed in the United
                  States or other countries where our service providers operate. These countries
                  may have privacy laws that differ from those in your location.
                </p>
              </section>

              <section id="changes-to-this-privacy-policy">
                <h2 className="text-2xl font-black text-zinc-950">14. Changes To This Privacy Policy.</h2>
                <p className="mt-3">
                  We may update this Privacy Policy from time to time. When we do, we will
                  update the "Last Updated" date above. If changes are material, we may provide
                  additional notice, such as through the service or by email where appropriate.
                  Continued use of Aldriva after an update means the updated policy applies.
                </p>
              </section>

              <section id="dispute-resolution">
                <h2 className="text-2xl font-black text-zinc-950">15. Dispute Resolution.</h2>
                <p className="mt-3">
                  If you have a privacy question, concern, or complaint, contact us at{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>
                  . We will review your request and try to respond within a reasonable time.
                </p>
              </section>

              <section id="eea-switzerland-and-uk-only">
                <h2 className="text-2xl font-black text-zinc-950">16. EEA, Switzerland And UK Only.</h2>
                <p className="mt-3">
                  If you are located in the European Economic Area, Switzerland, or the United
                  Kingdom, you may have additional rights under applicable data protection law,
                  including rights to access, correct, delete, restrict, object to processing,
                  request portability, withdraw consent, and lodge a complaint with a data
                  protection authority.
                </p>
                <p className="mt-3">
                  Depending on the context, Aldriva may act as a controller for account,
                  platform, security, analytics, and business operations data, and may act as a
                  processor or service provider when processing attendee data on behalf of an
                  organizer.
                </p>
              </section>

              <section id="residents-of-certain-states">
                <h2 className="text-2xl font-black text-zinc-950">17. Residents Of Certain States.</h2>
                <p className="mt-3">
                  Residents of some U.S. states may have additional privacy rights, including
                  rights to know, access, correct, delete, opt out of certain data uses, limit
                  certain sensitive data uses, or appeal a privacy decision. To submit a request,
                  contact us at support@aldriva.com.
                </p>
              </section>

              <section id="brazil-only">
                <h2 className="text-2xl font-black text-zinc-950">18. Brazil Only.</h2>
                <p className="mt-3">
                  If you are located in Brazil, you may have rights under the Lei Geral de
                  Protecao de Dados, including rights to confirm processing, access data, correct
                  incomplete or outdated data, anonymize or delete certain data, request
                  portability, and receive information about sharing.
                </p>
              </section>

              <section id="notice-for-people-who-don-t-use-Aldriva-services">
                <h2 className="text-2xl font-black text-zinc-950">
                  19. Notice For People Who Don't Use Aldriva Services.
                </h2>
                <p className="mt-3">
                  We may receive personal data about people who do not have Aldriva accounts,
                  such as when an organizer imports a contact list, transfers a ticket, sends an
                  invitation, or enters attendee information. If you believe we hold information
                  about you and you do not use Aldriva, contact us at support@aldriva.com.
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
                href="mailto:support@aldriva.com"
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
