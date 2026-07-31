"use client";

import dynamic from "next/dynamic";

const VenueMap = dynamic(() => import("@/components/VenueMap"), { ssr: false });

type Props = {
  lat: number;
  lng: number;
  title: string;
  venue?: string | null;
  city?: string | null;
};

export default function VenueMapClient(props: Props) {
  return <VenueMap {...props} />;
}
