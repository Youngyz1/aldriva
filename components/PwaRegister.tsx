"use client";

import { usePWA } from "@/hooks/use-pwa";

export default function PwaRegister() {
  usePWA();
  return null;
}

export function PwaInstallButton({ className = "" }: { className?: string }) {
  const { isInstallable, promptInstall } = usePWA();

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={`inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors ${className}`}
    >
      <span>Install App</span>
    </button>
  );
}
