import type { Metadata } from "next";
import PageNotFoundContent from "@/components/PageNotFoundContent";

export const metadata: Metadata = {
  title: "Page Not Found — Aldriva",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return <PageNotFoundContent />;
}
