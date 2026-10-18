import { Arimo } from "next/font/google";

/** Arimo is only attached to Savannah route/preview roots that need it. */
export const savannahArimoFont = Arimo({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arimo",
  display: "swap",
  preload: false,
});
