"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-fetches the server page every 3 s (10 times at most) while a payment confirmation is pending.
export default function RentalAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 10) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
