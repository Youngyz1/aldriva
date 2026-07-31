"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";

const HIDDEN_ON: string[] = [];

export default function NavbarWrapper() {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((path) => pathname.startsWith(path));
  if (hidden) return null;
  return <Navbar />;
}
