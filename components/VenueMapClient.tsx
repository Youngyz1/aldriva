"use client";

import dynamic from "next/dynamic";

const VenueMap = dynamic(() => import("@/components/VenueMap"), { ssr: false });

type Props = {
  lat?: number | null;
  lng?: number | null;
  title?: string | null;
  venue?: string | null;
  city?: string | null;
  address?: string | null;
};

export default function VenueMapClient(props: Props) {
  return <VenueMap {...props} />;
}
