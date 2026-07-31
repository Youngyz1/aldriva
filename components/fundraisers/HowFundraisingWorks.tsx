import Image from "next/image";
import { FaFacebookF, FaWhatsapp, FaXTwitter, FaLinkedinIn, FaLink } from "react-icons/fa6";
import HowItWorks, { type HowItWorksStep } from "@/components/marketing/HowItWorks";

/**
 * Fundraiser-specific "how it works" content: three real-flow steps.
 * Steps 1 & 3 use static SVG preview images.
 * Step 2 uses a JSX component so a real photo and brand icons can render
 * (static SVGs loaded as <img> are browser-sandboxed and cannot load
 * external resources like photos or icon fonts).
 */

// ── Step 2 card mockup ───────────────────────────────────────────────────────
// Mirrors the visual design of the step-2.svg but with a real cover photo
// and actual social-media brand icons from react-icons/fa6.

const SHARE_ICONS = [
  { Icon: FaLink,       bg: "#059669", label: "Copy link"  },
  { Icon: FaWhatsapp,   bg: "#25D366", label: "WhatsApp"   },
  { Icon: FaFacebookF,  bg: "#1877F2", label: "Facebook"   },
  { Icon: FaXTwitter,   bg: "#0F0F0F", label: "X"          },
  { Icon: FaLinkedinIn, bg: "#0077B5", label: "LinkedIn"   },
];

function Step2CardMockup() {
  return (
    <div className="w-full max-w-[300px] mx-auto rounded-[20px] bg-white border border-zinc-200 shadow-xl overflow-hidden">
      {/* ── Cover photo ── */}
      <div className="relative h-[170px] w-full">
        <Image
          src="/images/how-it-works/step-2-cover.png"
          alt="Fundraiser cover photo"
          fill
          className="object-cover"
          sizes="300px"
        />
        {/* Progress ring overlay */}
        <div className="absolute bottom-3 right-3 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-white shadow-md">
          <svg viewBox="0 0 52 52" className="h-10 w-10 -rotate-90" aria-hidden>
            <circle cx="26" cy="26" r="20" fill="none" stroke="#D1FAE5" strokeWidth="5" />
            <circle
              cx="26" cy="26" r="20"
              fill="none" stroke="#059669" strokeWidth="5"
              strokeDasharray="125.6" strokeDashoffset="72"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 space-y-2.5">
        {/* Raised badge */}
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-bold text-emerald-800">
          $2,580 raised
        </span>

        {/* Title */}
        <p className="text-[17px] font-black leading-snug text-zinc-900">
          Your fundraiser title
        </p>

        {/* Organizer */}
        <p className="text-[13px] text-zinc-500">
          Organized by{" "}
          <span className="font-bold text-zinc-800">Your Name</span>
        </p>

        {/* Divider */}
        <div className="border-t border-zinc-100 pt-3 flex items-center gap-2.5">
          {SHARE_ICONS.map(({ Icon, bg, label }) => (
            <div
              key={label}
              aria-label={label}
              style={{ backgroundColor: bg }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            >
              <Icon className="h-[15px] w-[15px] text-white" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Steps array ──────────────────────────────────────────────────────────────

const FUNDRAISER_STEPS: HowItWorksStep[] = [
  {
    title: "Tell your story and set your goal",
    description:
      "Add a title, write what you're raising for, and set a funding goal. A cover photo and short summary help supporters connect with your cause right away.",
    media: (
      <Image
        src="/images/how-it-works/how-it-works-step-1.svg"
        alt="Create campaign form mockup"
        width={600}
        height={720}
        className="w-full h-auto rounded-2xl"
        priority
      />
    ),
    bgGradientClass: "from-amber-50 to-white",
  },
  {
    title: "Share it with your community",
    description:
      "Publish your page and send the link to friends, family, and social networks. Every share puts your campaign in front of people ready to give.",
    media: <Step2CardMockup />,
    bgGradientClass: "from-emerald-50 to-white",
  },
  {
    title: "Receive funds securely",
    description:
      "Donations run through encrypted, Stripe-backed checkout and pay out to your bank account, so you can put support to work without the worry.",
    media: (
      <Image
        src="/images/how-it-works/how-it-works-step-3.svg"
        alt="Payout settings mockup"
        width={600}
        height={720}
        className="w-full h-auto rounded-2xl"
      />
    ),
    bgGradientClass: "from-blue-50 to-white",
  },
];

export default function HowFundraisingWorks() {
  return (
    <HowItWorks
      eyebrow="How it works"
      heading="Start strong in three simple steps"
      subheading="From your first draft to funds in your account — Aldriva keeps every step clear and secure."
      steps={FUNDRAISER_STEPS}
    />
  );
}
