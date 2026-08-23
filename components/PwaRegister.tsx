"use client";

import { usePWA } from "@/hooks/use-pwa";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Share, SquarePlus, Sparkles } from "lucide-react";

export function IOSInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <DialogHeader className="text-left space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-zinc-950 dark:text-white">
              Add Aldriva to Home Screen
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-600 dark:text-zinc-400">
            Install Aldriva on your iPhone or iPad for quick access and a full-screen experience.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/50 p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              1
            </div>
            <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
              Tap the <span className="font-semibold text-zinc-950 dark:text-white">Share</span> button in your Safari toolbar:
              <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-900 dark:text-zinc-100 font-medium">
                <Share className="h-3.5 w-3.5 text-orange-600" /> Share
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/50 p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              2
            </div>
            <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
              Scroll down and select <span className="font-semibold text-zinc-950 dark:text-white">"Add to Home Screen"</span>:
              <span className="ml-1.5 inline-flex items-center gap-1 rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-900 dark:text-zinc-100 font-medium">
                <SquarePlus className="h-3.5 w-3.5 text-orange-600" /> Add to Home Screen
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/50 p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              3
            </div>
            <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
              Tap <span className="font-semibold text-zinc-950 dark:text-white">"Add"</span> in the top right corner to complete installation.
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            Got it
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PwaRegister() {
  const { showIOSInstructions, setShowIOSInstructions } = usePWA();

  return (
    <IOSInstallDialog
      open={showIOSInstructions}
      onOpenChange={setShowIOSInstructions}
    />
  );
}

export function PwaInstallButton({ className = "" }: { className?: string }) {
  const { isInstallable, isIOS, promptInstall } = usePWA();

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={`inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors ${className}`}
    >
      <span>{isIOS ? "Add to Home Screen" : "Install App"}</span>
    </button>
  );
}
