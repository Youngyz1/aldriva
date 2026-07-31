"use client";

import { ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import {
  LayoutDashboard,
  Rocket,
  Heart,
} from "lucide-react";

const tabs = [
  {
    icon: LayoutDashboard,
    title: "Dashboard Overview",
    description:
      "A centralized hub to monitor your events, fundraisers, revenue, and ticket sales — all in real-time.",
    isNew: false,
    backgroundPositionX: 0,
    backgroundPositionY: 0,
    backgroundSizeX: 150,
  },
  {
    icon: Rocket,
    title: "Launch Events Fast",
    description:
      "Create, publish, and sell tickets for any event in minutes. Manage capacity, seats, and pricing with ease.",
    isNew: false,
    backgroundPositionX: 80,
    backgroundPositionY: 20,
    backgroundSizeX: 135,
  },
  {
    icon: Heart,
    title: "Fundraise with Impact",
    description:
      "Run powerful donation campaigns with progress tracking, donor lists, and automated receipts — built to convert.",
    isNew: false,
    backgroundPositionX: 50,
    backgroundPositionY: 60,
    backgroundSizeX: 160,
  },
];

/* ─── Animated tab border ─────────────────────────────────────────── */
const FeatureTab = (
  props: (typeof tabs)[number] &
    ComponentPropsWithoutRef<"div"> & { selected: boolean }
) => {
  const tabRef = useRef<HTMLDivElement>(null);
  const xPercent = useMotionValue(100);
  const yPercent = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(100px 50px at ${xPercent}% ${yPercent}%, black, transparent)`;

  useEffect(() => {
    if (!tabRef.current || !props.selected) return;
    xPercent.set(0);
    yPercent.set(0);
    const { height, width } = tabRef.current.getBoundingClientRect();
    const circumference = height * 2 + width * 2;
    const times = [
      0,
      width / circumference,
      (width + height) / circumference,
      (width * 2 + height) / circumference,
      1,
    ];
    animate(xPercent, [0, 100, 100, 0, 0], {
      duration: 4,
      times,
      ease: "linear",
      repeat: Infinity,
      repeatType: "loop",
    });
    animate(yPercent, [0, 0, 100, 100, 0], {
      times,
      duration: 4,
      ease: "linear",
      repeat: Infinity,
      repeatType: "loop",
    });
  }, [props.selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={tabRef}
      onClick={props.onClick}
      className={`relative flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 transition-all duration-200 ${
        props.selected
          ? "border-orange-500/40 bg-orange-500/5"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
      }`}
    >
      {/* Animated border trace */}
      {props.selected && (
        <motion.div
          style={{ maskImage }}
          className="absolute inset-0 -m-px rounded-xl border border-orange-500"
        />
      )}

      {/* Icon */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          props.selected
            ? "bg-orange-500 text-white"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        <props.icon size={16} />
      </div>

      <div className="min-w-0">
        <p
          className={`truncate text-sm font-bold ${
            props.selected ? "text-orange-600 dark:text-orange-400" : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {props.title}
        </p>
        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1">
          {props.description}
        </p>
      </div>

      {props.isNew && (
        <span className="ml-2 shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
          New
        </span>
      )}
    </div>
  );
};

/* ─── Main Section ────────────────────────────────────────────────── */
export default function RuixenFeaturedImageSection() {
  const [selectedTab, setSelectedTab] = useState(0);

  const backgroundPositionX = useMotionValue(tabs[0].backgroundPositionX);
  const backgroundPositionY = useMotionValue(tabs[0].backgroundPositionY);
  const backgroundSizeX = useMotionValue(tabs[0].backgroundSizeX);

  const backgroundPosition = useMotionTemplate`${backgroundPositionX}% ${backgroundPositionY}%`;
  const backgroundSize = useMotionTemplate`${backgroundSizeX}% auto`;

  const handleSelectTab = (index: number) => {
    setSelectedTab(index);
    animate(
      backgroundSizeX,
      [backgroundSizeX.get(), 100, tabs[index].backgroundSizeX],
      { duration: 2, ease: "easeInOut" }
    );
    animate(
      backgroundPositionX,
      [backgroundPositionX.get(), 100, tabs[index].backgroundPositionX],
      { duration: 2, ease: "easeInOut" }
    );
    animate(
      backgroundPositionY,
      [backgroundPositionY.get(), 100, tabs[index].backgroundPositionY],
      { duration: 2, ease: "easeInOut" }
    );
  };

  return (
    <section className="py-20 md:py-28 bg-white dark:bg-zinc-950">
      <div className="container mx-auto max-w-6xl px-6">
        {/* Heading */}
        <div className="text-center">
          <span className="inline-block rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
            Platform Features
          </span>
          <h2 className="mt-5 text-4xl font-black tracking-tight text-zinc-900 dark:text-white md:text-5xl lg:text-6xl">
            Everything you need to{" "}
            <span className="bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
              run great events.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-500 dark:text-zinc-400">
            Aldriva gives organizers a complete toolkit — from live dashboards to fundraiser campaigns — all in one place.
          </p>
        </div>

        {/* Tab selectors */}
        <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {tabs.map((tab, i) => (
            <FeatureTab
              {...tab}
              key={tab.title}
              selected={selectedTab === i}
              onClick={() => handleSelectTab(i)}
            />
          ))}
        </div>

        {/* Description for selected tab */}
        <motion.p
          key={selectedTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto mt-6 max-w-xl text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          {tabs[selectedTab].description}
        </motion.p>

        {/* Animated image panel */}
        <div className="mt-10 rounded-2xl border-2 border-zinc-100 bg-zinc-50 p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <motion.div
            className="aspect-video overflow-hidden rounded-xl bg-cover bg-center shadow-inner"
            style={{
              backgroundPosition,
              backgroundSize,
              backgroundImage: `url(https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&auto=format&fit=crop&q=80)`,
            }}
          >
            {/* Subtle overlay */}
            <div className="h-full w-full bg-gradient-to-t from-black/10 via-transparent to-transparent" />
          </motion.div>
        </div>

        {/* CTA row */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/signup"
            className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
          >
            Start for free →
          </a>
        </div>
      </div>
    </section>
  );
}
