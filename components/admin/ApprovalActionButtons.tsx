"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import RejectionReasonModal from "./RejectionReasonModal";

export default function ApprovalActionButtons({
  disabled,
  onApprove,
  onReject,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showRejectModal, setShowRejectModal] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onApprove}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowRejectModal(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 transition disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>

      {showRejectModal && (
        <RejectionReasonModal
          onCancel={() => setShowRejectModal(false)}
          onConfirm={(reason) => {
            setShowRejectModal(false);
            onReject(reason);
          }}
        />
      )}
    </>
  );
}
