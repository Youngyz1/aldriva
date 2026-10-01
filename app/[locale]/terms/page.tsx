/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import Link from "next/link";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Terms of Service — Aldriva",
  description: "Read Aldriva's Terms of Service.",
  alternates: {
    canonical: `${getSiteUrl()}/terms`,
  },
  openGraph: {
    title: "Terms of Service — Aldriva",
    description: "Read Aldriva's Terms of Service.",
    url: `${getSiteUrl()}/terms`,
    siteName: "Aldriva",
    images: [{ url: "/aldriva-og-image-v2.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service — Aldriva",
    description: "Read Aldriva's Terms of Service.",
    images: ["/aldriva-og-image-v2.png"],
  },
};

const sections = [
  "Who These Terms Apply To",
  "What Aldriva Is",
  "Eligibility and Accounts",
  "Payments — How Money Actually Moves on Aldriva",
  "Payouts to Organizers, Businesses, and Beneficiaries",
  "Refunds",
  "Acceptable Use",
  "User Content",
  "Data and Privacy",
  "Disclaimers",
  "Limitation of Liability",
  "Indemnification",
  "Termination",
  "Changes to These Terms",
  "Governing Law and Dispute Resolution",
  "Contact",
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function TermsPage() {
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
                Terms of Service
              </h1>
              <p className="mt-4 text-base font-semibold text-zinc-500">
                Effective Date: September 9, 2026
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-500">
                Last Updated: September 9, 2026
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
              <section id="who-these-terms-apply-to">
                <h2 className="text-2xl font-black text-zinc-950">1. Who These Terms Apply To.</h2>
                <p className="mt-3">
                  These Terms of Service ("<strong>Terms</strong>") are a binding agreement
                  between you ("<strong>you</strong>" or "<strong>User</strong>") and Aldriva
                  LLC, a Wyoming limited liability company ("<strong>Aldriva</strong>,"{" "}
                  "<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>"),
                  governing your access to and use of the Aldriva website, mobile
                  applications, and related services (collectively, the "<strong>Platform</strong>").
                </p>
                <p className="mt-3">
                  By creating an account, accessing, or using the Platform, you agree to be
                  bound by these Terms and by our <Link className="font-bold text-orange-600" href="/privacy">Privacy Policy</Link> and{" "}
                  <Link className="font-bold text-orange-600" href="/cookies">Cookie Policy</Link>,
                  which are incorporated by reference. If you do not agree, do not use the
                  Platform.
                </p>
              </section>

              <section id="what-aldriva-is">
                <h2 className="text-2xl font-black text-zinc-950">2. What Aldriva Is.</h2>
                <p className="mt-3">Aldriva is a multi-purpose platform that allows users to:</p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>Create and manage <strong>events</strong>, sell tickets, and check in attendees;</li>
                  <li>Create and manage <strong>fundraising campaigns</strong> and receive donations;</li>
                  <li>List and manage <strong>businesses</strong>;</li>
                  <li>Publish <strong>articles</strong> and other content;</li>
                  <li>Sell <strong>digital and physical products</strong>.</li>
                </ul>
                <p className="mt-3">
                  Aldriva provides the technology that connects organizers, businesses,
                  donors, attendees, and buyers. <strong>Aldriva is not a party to, and does
                  not guarantee, any transaction, event, fundraiser, or product listing
                  created by a User.</strong> Except where explicitly stated, Aldriva does
                  not vet, endorse, or verify the legitimacy, safety, or legality of
                  user-created content, fundraisers, events, or listings.
                </p>
              </section>

              <section id="eligibility-and-accounts">
                <h2 className="text-2xl font-black text-zinc-950">3. Eligibility and Accounts.</h2>
                <p className="mt-3">
                  3.1. You must be at least 13 years old to create an account. If you are
                  under 18, you may only use the Platform under the supervision of a parent
                  or legal guardian who agrees to these Terms on your behalf.
                </p>
                <p className="mt-3">
                  3.2. You are responsible for maintaining the confidentiality of your
                  account credentials and for all activity under your account. Notify us
                  immediately at{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>{" "}
                  if you suspect unauthorized use.
                </p>
                <p className="mt-3">
                  3.3. You must provide accurate, current information when creating an
                  account or an organizer, business, or beneficiary profile. Providing false
                  identity, tax, or registration information (including EIN/nonprofit
                  registration numbers) is a violation of these Terms and may be reported
                  to relevant authorities.
                </p>
              </section>

              <section id="payments-how-money-actually-moves-on-aldriva">
                <h2 className="text-2xl font-black text-zinc-950">4. Payments — How Money Actually Moves on Aldriva.</h2>
                <p className="mt-3">
                  This section describes how payments are actually processed today. It is
                  important that you read it, because it affects who is legally receiving
                  your money and what protections apply.
                </p>
                <p className="mt-3">
                  4.1. <strong>Aldriva is the merchant of record.</strong> Card payments
                  (donations, ticket purchases, business listing fees, product orders) are
                  processed through Stripe, with Aldriva — not the individual organizer,
                  business, or beneficiary — as the merchant of record. Funds are received
                  by Aldriva and subsequently made available to the relevant organizer,
                  business, or beneficiary through Aldriva's internal payout process,
                  subject to Section 6 below.
                </p>
                <p className="mt-3">
                  4.2. <strong>Cryptocurrency payments are irreversible.</strong> Where
                  offered, cryptocurrency payments are processed via a third-party payment
                  processor. <strong>Cryptocurrency transactions cannot be reversed,
                  refunded, or charged back once confirmed on the blockchain.</strong> By
                  choosing to pay or donate using cryptocurrency, you acknowledge and accept
                  this risk. Aldriva has no ability to recover, reverse, or refund a
                  completed cryptocurrency transaction under any circumstances.
                </p>
                <p className="mt-3">
                  4.3. Donations made through the Platform are voluntary contributions to
                  the fundraiser or organizer selected by the donor. Donations are generally{" "}
                  <strong>non-refundable</strong>, except as described in Section 6.
                </p>
                <p className="mt-3">
                  4.4. Aldriva does not guarantee that any fundraiser will reach its goal,
                  that funds will be used as represented by the organizer, or that any
                  beneficiary will actually receive funds raised on their behalf. Users are
                  solely responsible for verifying the legitimacy of any fundraiser, event,
                  or business before making a payment.
                </p>
                <p className="mt-3">
                  4.5. <strong>Aldriva may in the future offer a direct-payment model</strong>{" "}
                  in which an organizer, business, or beneficiary receives funds directly
                  from a payment processor rather than through Aldriva as merchant of
                  record. Where this option is offered and a User elects to use it, the
                  terms of that specific payment processor (e.g., a Stripe Connect account
                  agreement) will govern that User's receipt of funds, and Aldriva's role
                  with respect to those specific transactions will be limited to providing
                  the underlying technology connecting the User to the payment processor.
                  Aldriva will update this Section 4 to reflect the applicable model at the
                  time any such feature is made available. [NOTE: This subsection describes
                  only a future possibility and creates no current obligation. Update to
                  describe the actual mechanism once built — see also Section 5, which will
                  need corresponding updates once direct payouts exist.]
                </p>
              </section>

              <section id="payouts-to-organizers-businesses-and-beneficiaries">
                <h2 className="text-2xl font-black text-zinc-950">5. Payouts to Organizers, Businesses, and Beneficiaries.</h2>
                <p className="mt-3">
                  5.1. Funds raised or collected through the Platform are held by Aldriva
                  and disbursed to the applicable organizer, business, or beneficiary
                  account according to Aldriva's payout process, which may include identity
                  or bank/payment-destination verification before a payout is released.
                </p>
                <p className="mt-3">
                  5.2. Aldriva reserves the right to delay, withhold, or reverse a payout
                  where fraud, a chargeback, a legal dispute, or a violation of these Terms
                  is suspected.
                </p>
                <p className="mt-3">
                  5.3. Aldriva is not responsible for how an organizer, business, or
                  beneficiary subsequently uses funds received through a payout.
                </p>
              </section>

              <section id="refunds">
                <h2 className="text-2xl font-black text-zinc-950">6. Refunds.</h2>
                <p className="mt-3">
                  <strong>Refunds on Aldriva are handled manually, on a case-by-case basis,
                  through our support team — they are not automatic.</strong> This section
                  reflects how refunds actually work today:
                </p>
                <p className="mt-3">
                  6.1. <strong>Event tickets:</strong> Tickets are refundable only if the
                  event itself is cancelled, unless the organizer has published a different
                  refund policy for their specific event. Requests should be sent to{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>.
                </p>
                <p className="mt-3">
                  6.2. <strong>Donations:</strong> Donations are generally non-refundable.
                  In limited circumstances (e.g., a demonstrable error, fraud, or a
                  cancelled fundraiser), Aldriva may, at its sole discretion, process a
                  refund upon request made within [10] days of the donation.
                </p>
                <p className="mt-3">
                  6.3. <strong>Business listing fees and product orders:</strong> Refund
                  requests are reviewed individually by Aldriva support. There is no
                  automated or guaranteed refund process for these categories.
                </p>
                <p className="mt-3">
                  6.4. <strong>Cryptocurrency payments cannot be refunded under any
                  circumstances</strong>, regardless of the reason for the request, due to
                  the irreversible nature of blockchain transactions described in Section 4.2.
                </p>
                <p className="mt-3">
                  6.5. Aldriva reserves the right to change this refund process, including
                  introducing automated refunds, at any time. Any specific refund guarantee
                  communicated on a particular page or campaign applies only to that context
                  and does not override this Section unless explicitly stated.
                </p>
              </section>

              <section id="acceptable-use">
                <h2 className="text-2xl font-black text-zinc-950">7. Acceptable Use.</h2>
                <p className="mt-3">You agree not to use the Platform to:</p>
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  <li>Create a fraudulent fundraiser, event, business listing, or product;</li>
                  <li>Misrepresent your identity, affiliation, or the purpose of funds raised;</li>
                  <li>Upload content that is unlawful, defamatory, harassing, hateful, or infringes another's intellectual property or privacy rights;</li>
                  <li>Attempt to circumvent Aldriva's payment system to avoid fees or oversight;</li>
                  <li>Interfere with the security or normal operation of the Platform;</li>
                  <li>Use the Platform to violate any applicable law, including anti-fraud, anti-money-laundering, or sanctions laws.</li>
                </ul>
                <p className="mt-3">
                  Aldriva may suspend or terminate accounts, remove content, freeze payouts,
                  or report conduct to law enforcement or payment processors where it
                  reasonably believes a violation of this Section has occurred.
                </p>
              </section>

              <section id="user-content">
                <h2 className="text-2xl font-black text-zinc-950">8. User Content.</h2>
                <p className="mt-3">
                  8.1. You retain ownership of content you submit to the Platform (event
                  descriptions, fundraiser pages, articles, reviews, images, etc.), but you
                  grant Aldriva a worldwide, non-exclusive, royalty-free license to host,
                  display, reproduce, and distribute that content as necessary to operate and
                  promote the Platform (including, where applicable, automated promotional
                  posts to third-party platforms such as Facebook).
                </p>
                <p className="mt-3">
                  8.2. You are solely responsible for content you submit and represent that
                  you have the rights necessary to post it.
                </p>
                <p className="mt-3">
                  8.3. Reviews submitted on the Platform must reflect a genuine experience
                  and are tied to your account; Aldriva may remove reviews that violate this
                  requirement or these Terms.
                </p>
              </section>

              <section id="data-and-privacy">
                <h2 className="text-2xl font-black text-zinc-950">9. Data and Privacy.</h2>
                <p className="mt-3">
                  Our collection and use of your information is described in our{" "}
                  <Link className="font-bold text-orange-600" href="/privacy">Privacy Policy</Link>.
                  By using the Platform, you consent to that processing.
                </p>
                <p className="mt-3">
                  Where Aldriva processes personal data on behalf of an organizer, business,
                  or beneficiary (for example, donor or attendee information visible to an
                  organizer through their dashboard), Aldriva acts as a data processor with
                  respect to that data, and additional terms may apply as described in our
                  Privacy Policy and any applicable Data Processing Agreement.
                </p>
              </section>

              <section id="disclaimers">
                <h2 className="text-2xl font-black text-zinc-950">10. Disclaimers.</h2>
                <p className="mt-3">
                  THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF
                  ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
                  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                  ALDRIVA DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE,
                  OR ERROR-FREE, OR THAT ANY EVENT, FUNDRAISER, BUSINESS, OR PRODUCT LISTED
                  ON THE PLATFORM IS LEGITIMATE, SAFE, OR ACCURATELY DESCRIBED.
                </p>
              </section>

              <section id="limitation-of-liability">
                <h2 className="text-2xl font-black text-zinc-950">11. Limitation of Liability.</h2>
                <p className="mt-3">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, ALDRIVA AND ITS OFFICERS,
                  EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                  SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
                  GOODWILL, OR DATA, ARISING FROM YOUR USE OF THE PLATFORM, ANY TRANSACTION
                  MADE THROUGH IT, OR THE CONDUCT OF ANY OTHER USER, ORGANIZER, OR BUSINESS.
                </p>
                <p className="mt-3">
                  Except for Aldriva's obligation to disburse payouts actually owed to
                  organizers, businesses, and beneficiaries under Section 5 (which is not
                  subject to this cap), Aldriva's total aggregate liability to you for any
                  claim arising from these Terms or your use of the Platform shall not exceed:
                </p>
                <p className="mt-3">
                  (a) for organizers, businesses, and beneficiaries: the platform fees you
                  paid to Aldriva in the twelve (12) months immediately preceding the
                  circumstances giving rise to the claim; or
                </p>
                <p className="mt-3">
                  (b) for all other Users: the total amount you paid to Aldriva in the twelve
                  (12) months immediately preceding the circumstances giving rise to the
                  claim, or, if you paid nothing, one hundred U.S. dollars ($100 USD).
                </p>
              </section>

              <section id="indemnification">
                <h2 className="text-2xl font-black text-zinc-950">12. Indemnification.</h2>
                <p className="mt-3">
                  You agree to indemnify and hold harmless Aldriva from any claim, loss, or
                  expense (including reasonable attorneys' fees) arising from your use of the
                  Platform, your content, your violation of these Terms, or your violation of
                  any law or third-party right.
                </p>
              </section>

              <section id="termination">
                <h2 className="text-2xl font-black text-zinc-950">13. Termination.</h2>
                <p className="mt-3">
                  Aldriva may suspend or terminate your account at any time, with or without
                  notice, for violation of these Terms or for any other reason at our
                  discretion. You may close your account at any time through your account
                  settings, subject to the account deletion process described in our Privacy
                  Policy.
                </p>
              </section>

              <section id="changes-to-these-terms">
                <h2 className="text-2xl font-black text-zinc-950">14. Changes to These Terms.</h2>
                <p className="mt-3">
                  We may update these Terms from time to time. Material changes will be
                  communicated by posting an updated version with a new "Last Updated" date,
                  and, where required by law, by additional notice. Continued use of the
                  Platform after changes take effect constitutes acceptance.
                </p>
              </section>

              <section id="governing-law-and-dispute-resolution">
                <h2 className="text-2xl font-black text-zinc-950">15. Governing Law and Dispute Resolution.</h2>
                <p className="mt-3">
                  15.1. <strong>Governing Law.</strong> These Terms are governed by the laws
                  of the State of Wyoming, without regard to conflict-of-law principles.
                </p>
                <p className="mt-3">
                  15.2. <strong>Informal Resolution First.</strong> If you have a dispute
                  with Aldriva, you agree to first contact us at{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>{" "}
                  and give us a reasonable opportunity (at least 30 days) to resolve the
                  issue before pursuing arbitration or a legal claim.
                </p>
                <p className="mt-3">
                  15.3. <strong>Binding Arbitration.</strong> If a dispute cannot be resolved
                  informally, you and Aldriva agree that it will be resolved by binding,
                  individual arbitration rather than in court, except that either party may
                  bring a qualifying claim in small claims court instead. Arbitration will be
                  conducted under the rules of the American Arbitration Association (AAA), by
                  a single arbitrator, and will take place in Sheridan County, Wyoming, or
                  remotely by video or phone at your option.
                </p>
                <p className="mt-3">
                  15.4. <strong>No Class Actions.</strong> You and Aldriva agree that any
                  dispute will be brought only on an individual basis, and not as a plaintiff
                  or class member in any purported class, consolidated, or representative
                  proceeding.
                </p>
                <p className="mt-3">
                  15.5. <strong>Opt-Out Right.</strong> You may opt out of Sections 15.3 and
                  15.4 by emailing{" "}
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>{" "}
                  with the subject line "ARBITRATION OPT-OUT" within 30 days of first agreeing
                  to these Terms. If you opt out, disputes will instead be resolved in the
                  state or federal courts located in Sheridan County, Wyoming, and you and
                  Aldriva each consent to that venue and jurisdiction.
                </p>
              </section>

              <section id="contact">
                <h2 className="text-2xl font-black text-zinc-950">16. Contact.</h2>
                <p className="mt-3">Questions about these Terms can be directed to:</p>
                <p className="mt-3">
                  Aldriva LLC
                  <br />
                  Sheridan County, WY
                  <br />
                  <a className="font-bold text-orange-600" href="mailto:support@aldriva.com">
                    support@aldriva.com
                  </a>
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
