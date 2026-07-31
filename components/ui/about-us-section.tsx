"use client";

/**
 * components/ui/about-us-section.tsx
 * Animated About Us section using framer-motion.
 * Adapted from 21st.dev — recoloured for Aldriva brand.
 * Platform stats are injected as props from server pages.
 */

import { useState, useEffect, useRef } from "react";
import {
  Ticket, Megaphone, Heart, Users, Award, Calendar,
  TrendingUp, Zap,
} from "lucide-react";
import {
  motion, useScroll, useTransform, useInView, useSpring,
  type Variants,
} from "framer-motion";
import HomepageAccordion from "@/components/HomepageAccordion";
import SmartCTAButton from "@/components/SmartCTAButton";
import CompanyVideoPlayer from "@/components/CompanyVideoPlayer";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AboutStat {
  icon:   React.ReactNode;
  value:  number;
  label:  string;
  suffix: string;
}

export interface AboutService {
  icon:        React.ReactNode;
  secondaryIcon?: React.ReactNode;
  title:       string;
  description: string;
  position:    "left" | "right";
}

// ── Default data (Aldriva-specific) ─────────────────────────────────────

const DEFAULT_SERVICES: AboutService[] = [
  {
    icon: <Ticket className="w-5 h-5" />,
    title: "Ticketing",
    description: "Sell tickets with QR codes, manage capacity, and handle check-ins seamlessly for events of any size.",
    position: "left",
  },
  {
    icon: <Heart className="w-5 h-5" />,
    title: "Fundraising",
    description: "Launch crowdfunding campaigns, tell your story, track donations in real-time, and engage supporters.",
    position: "left",
  },
  {
    icon: <Megaphone className="w-5 h-5" />,
    title: "Promotion",
    description: "Get your events and campaigns discovered by thousands of attendees and donors in your area.",
    position: "left",
  },
  {
    icon: <Award className="w-5 h-5" />,
    title: "Sponsorships",
    description: "Connect organizers with sponsors through our marketplace. Gold and Silver packages, easy to apply.",
    position: "right",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "Community",
    description: "Build a following around your brand. Attendees save, share, and return for every event you host.",
    position: "right",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Analytics",
    description: "Track ticket sales, donation progress, and attendee data through a beautiful organizer dashboard.",
    position: "right",
  },
];

const DEFAULT_STATS: AboutStat[] = [
  { icon: <Award className="w-6 h-6" />,    value: 150,  label: "Events Hosted",    suffix: "+" },
  { icon: <Users className="w-6 h-6" />,    value: 3200, label: "Happy Attendees",  suffix: "+" },
  { icon: <Calendar className="w-6 h-6" />, value: 3,    label: "Years Running",    suffix: "" },
  { icon: <Heart className="w-6 h-6" />,    value: 98,   label: "Satisfaction Rate", suffix: "%" },
];

// ── Main component ────────────────────────────────────────────────────────────

interface AboutUsSectionProps {
  services?: AboutService[];
  stats?:    AboutStat[];
  ctaHref?:  string;
}

export default function AboutUsSection({
  services = DEFAULT_SERVICES,
  stats    = DEFAULT_STATS,
  ctaHref  = "/create-event",
}: AboutUsSectionProps) {
  const sectionRef  = useRef<HTMLDivElement>(null);
  const statsRef    = useRef<HTMLDivElement>(null);
  const isInView    = useInView(sectionRef, { once: false, amount: 0.1 });
  const isStatsInView = useInView(statsRef, { once: false, amount: 0.3 });

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const y1      = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const y2      = useTransform(scrollYProgress, [0, 1], [0,  50]);
  const rotate1 = useTransform(scrollYProgress, [0, 1], [0,  20]);
  const rotate2 = useTransform(scrollYProgress, [0, 1], [0, -20]);

  const container: Variants = {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } },
  };
  const item: Variants = {
    hidden:  { y: 20, opacity: 0 },
    visible: { y: 0,  opacity: 1, transition: { duration: 0.6, ease: "easeOut" as const } },
  };

  const leftServices  = services.filter((s) => s.position === "left");
  const rightServices = services.filter((s) => s.position === "right");

  return (
    <section
      id="about"
      ref={sectionRef}
      className="w-full py-24 px-4 bg-gradient-to-b from-zinc-50 to-white text-zinc-950 overflow-hidden relative"
    >
      {/* Decorative blobs */}
      <motion.div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-orange-400/5 blur-3xl" style={{ y: y1, rotate: rotate1 }} />
      <motion.div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-emerald-400/5 blur-3xl" style={{ y: y2, rotate: rotate2 }} />

      <motion.div
        className="container mx-auto max-w-6xl relative z-10"
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={container}
      >
        {/* Heading */}
        <motion.div className="flex flex-col items-center mb-6" variants={item}>
          <motion.span className="text-orange-600 font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Our Story
          </motion.span>
          <h2 className="text-4xl md:text-5xl font-black mb-4 text-center tracking-tight">About Aldriva</h2>
          <motion.div
            className="w-24 h-1 bg-orange-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: 96 }}
            transition={{ duration: 1, delay: 0.4 }}
          />
        </motion.div>

        <motion.p
  className="text-center max-w-2xl mx-auto mb-16 text-zinc-500 text-lg leading-relaxed"
  variants={item}
>
  Aldriva helps individuals, nonprofits, and event organizers raise funds,
  host events, sell tickets, and connect with sponsors—all in one platform.
  Everything you need to grow your cause, engage supporters, and create
  meaningful impact.
</motion.p>

        {/* Accordion + image layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">

          {/* Left accordion (3 items) */}
          <div className="md:col-span-1">
            <HomepageAccordion services={services.filter((s) => s.position === "left")} />
          </div>

          {/* Centre image — always visible */}
          <div className="flex justify-center items-start order-first md:order-none mb-8 md:mb-0">
            <motion.div className="relative w-full max-w-xs" variants={item}>
              <motion.div
                whileHover={{ scale: 1.03, transition: { duration: 0.3 } }}
              >
                <CompanyVideoPlayer />
              </motion.div>
              {/* Border accent */}
              <motion.div
                className="absolute inset-0 border-4 border-orange-400/30 rounded-2xl -m-3 z-[-1]"
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              />
            </motion.div>
          </div>

          {/* Right accordion (3 items) */}
          <div className="md:col-span-1">
            <HomepageAccordion services={services.filter((s) => s.position === "right")} />
          </div>
        </div>

        {/* Stats */}
        <motion.div
          ref={statsRef}
          className="mt-24 grid grid-cols-2 lg:grid-cols-4 gap-6"
          initial="hidden"
          animate={isStatsInView ? "visible" : "hidden"}
          variants={container}
        >
          {stats.map((stat, i) => (
            <StatCounter key={i} {...stat} delay={i * 0.1} />
          ))}
        </motion.div>

        {/* CTA banner — SmartCTAButton adapts to auth state */}
        <motion.div
          className="mt-20 bg-zinc-950 text-white p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6"
          initial={{ opacity: 0, y: 30 }}
          animate={isStatsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div>
            <h3 className="text-2xl font-black mb-1">Ready to host your next event?</h3>
            <p className="text-zinc-400">Join thousands of organizers already using Aldriva.</p>
          </div>
          <SmartCTAButton className="shrink-0" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ServiceItem({
  icon, secondaryIcon, title, description,
  variants, delay, direction,
}: AboutService & { variants: Variants; delay: number; direction: "left" | "right" }) {
  return (
    <motion.div
      className="flex flex-col group"
      variants={variants}
      transition={{ delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="flex items-center gap-3 mb-3"
        initial={{ x: direction === "left" ? -20 : 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: delay + 0.2 }}
      >
        <motion.div
          className="text-orange-600 bg-orange-50 p-3 rounded-xl relative group-hover:bg-orange-100 transition-colors"
          whileHover={{ rotate: [0, -8, 8, -4, 0], transition: { duration: 0.4 } }}
        >
          {icon}
          {secondaryIcon}
        </motion.div>
        <h3 className="text-base font-black text-zinc-950 group-hover:text-orange-600 transition-colors">{title}</h3>
      </motion.div>
      <p className="text-sm text-zinc-500 leading-relaxed pl-14">{description}</p>
    </motion.div>
  );
}

function StatCounter({ icon, value, label, suffix, delay }: AboutStat & { delay: number }) {
  const ref        = useRef(null);
  const isInView   = useInView(ref, { once: false });
  const [animated, setAnimated] = useState(false);
  const spring     = useSpring(0, { stiffness: 50, damping: 10 });
  const display    = useTransform(spring, (v) => Math.floor(v));

  useEffect(() => {
    if (isInView && !animated) { spring.set(value); setAnimated(true); }
    if (!isInView && animated) { spring.set(0);     setAnimated(false); }
  }, [isInView, value, spring, animated]);

  const countVariants: Variants = {
    hidden:  { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, delay, ease: "easeOut" as const } },
  };

  return (
    <motion.div
      className="bg-zinc-50 hover:bg-white border border-zinc-200 hover:border-orange-200 p-6 rounded-2xl flex flex-col items-center text-center group transition-colors"
      variants={countVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <motion.div
        className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mb-4 text-orange-600 group-hover:bg-orange-100 transition-colors"
        whileHover={{ rotate: 360, transition: { duration: 0.6 } }}
      >
        {icon}
      </motion.div>
      <div ref={ref} className="text-3xl font-black text-zinc-950 flex items-center">
        <motion.span>{display}</motion.span>
        <span>{suffix}</span>
      </div>
      <p className="text-zinc-500 text-sm mt-1">{label}</p>
      <motion.div className="w-8 h-0.5 bg-orange-500 mt-3 group-hover:w-14 transition-all duration-300 rounded-full" />
    </motion.div>
  );
}
