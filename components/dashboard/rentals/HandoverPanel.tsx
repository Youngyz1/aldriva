"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconCamera,
  IconCheck,
  IconClipboardCheck,
  IconLoader2 as Loader,
  IconAlertTriangle,
  IconX,
} from "@tabler/icons-react";
import { formatMoney } from "@/lib/money";
import type { RentalInspectionRow, HandoverPhoto, DepositSettlementAction, LateFeeAction } from "@/lib/actions/rental-handover";

type Props = {
  bookingId: string;
  organizerId: string;
  status: string;
  currency: string;
  endsAt: string;
  depositRequired: number;
  depositCollected: number;
  depositStatus: string;
  existingLateFeeAmount: number;
  existingLateFeeStatus: string;
  inspections: RentalInspectionRow[];
  canManage: boolean;
};

const FUEL_OPTIONS = ["", "Full", "3/4", "1/2", "1/4", "Empty"];

async function uploadPhoto(bookingId: string, organizerId: string, kind: "pickup" | "return", file: File): Promise<HandoverPhoto> {
  const prep = await fetch("/api/rentals/inspections/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, organizerId, kind, contentType: file.type, fileSizeBytes: file.size, fileName: file.name }),
  });
  const j = await prep.json();
  if (!prep.ok) throw new Error(j.error || "Could not prepare upload");
  const put = await fetch(j.signedUrl, { method: "PUT", headers: { "Content-Type": j.contentType }, body: file });
  if (!put.ok) throw new Error("Photo upload failed");
  return { key: j.key, file_name: j.fileName || file.name, content_type: j.contentType };
}

function nowLocalInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string) {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function InspectionSummary({ title, insp }: { title: string; insp: RentalInspectionRow }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2 text-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-700">
        <div><span className="text-zinc-500">Odometer:</span> <span className="font-medium">{insp.odometer ?? "—"}</span></div>
        <div><span className="text-zinc-500">Fuel:</span> <span className="font-medium">{insp.fuel_level || "—"}</span></div>
      </div>
      {insp.damage_notes ? <div><span className="text-zinc-500">Damage/notes:</span> <p className="mt-0.5 whitespace-pre-wrap text-zinc-800">{insp.damage_notes}</p></div> : null}
      <div className="text-xs text-zinc-500">
        Customer confirmed by <span className="font-medium text-zinc-700">{insp.customer_confirmed_name}</span> at {new Date(insp.customer_confirmed_at).toLocaleString()}
      </div>
      {insp.photos?.length ? <div className="text-xs text-zinc-500">Photos: {insp.photos.length}</div> : null}
    </div>
  );
}

export function HandoverPanel(props: Props) {
  const { bookingId, organizerId, status, currency, endsAt, depositRequired, depositCollected, depositStatus, existingLateFeeAmount, existingLateFeeStatus, inspections, canManage } = props;
  const router = useRouter();
  const pickupInsp = inspections.find((i) => i.kind === "pickup") || null;
  const returnInsp = inspections.find((i) => i.kind === "return") || null;

  const [pickupOpen, setPickupOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // pickup fields
  const [pOdo, setPOdo] = useState("");
  const [pFuel, setPFuel] = useState("");
  const [pDamage, setPDamage] = useState("");
  const [pConfirmName, setPConfirmName] = useState("");
  const [pConfirmAt, setPConfirmAt] = useState(nowLocalInput());
  const [pPhotos, setPPhotos] = useState<HandoverPhoto[]>([]);
  const [pUploading, setPUploading] = useState(false);

  // return fields
  const [rOdo, setROdo] = useState("");
  const [rFuel, setRFuel] = useState("");
  const [rDamage, setRDamage] = useState("");
  const [rConfirmName, setRConfirmName] = useState("");
  const [rConfirmAt, setRConfirmAt] = useState(nowLocalInput());
  const [rPhotos, setRPhotos] = useState<HandoverPhoto[]>([]);
  const [rUploading, setRUploading] = useState(false);
  const [actualReturn, setActualReturn] = useState(nowLocalInput());

  // deposit settlement (Part B)
  const depositSettled = depositStatus === "returned_full" || depositStatus === "partially_retained" || depositStatus === "retained_full";
  const canSettleDeposit = !depositSettled && depositStatus === "collected_offline";
  const [depAction, setDepAction] = useState<DepositSettlementAction>(canSettleDeposit ? "return_full" : "none");
  const [depRetain, setDepRetain] = useState("0");
  const [depReason, setDepReason] = useState("");

  // late fee (Part C)
  const [lfQuote, setLfQuote] = useState<{ amount: number; minutes: number; days: number } | null>(null);
  const [lfAction, setLfAction] = useState<LateFeeAction>("none");
  const [lfAmount, setLfAmount] = useState("");
  const [lfReason, setLfReason] = useState("");
  const [lfLoading, setLfLoading] = useState(false);

  useEffect(() => {
    if (!returnOpen) return;
    let cancelled = false;
    async function load() {
      setLfLoading(true);
      try {
        const { calculateLateFeeQuote } = await import("@/lib/actions/rental-handover");
        const res = await calculateLateFeeQuote(bookingId, organizerId, toIso(actualReturn));
        if (!cancelled && res.success) {
          setLfQuote({ amount: Number(res.calculatedFee ?? 0), minutes: Number(res.overdueMinutes ?? 0), days: Number(res.overdueDays ?? 0) });
          setLfAmount(String(Number(res.calculatedFee ?? 0)));
          if (Number(res.calculatedFee ?? 0) > 0) setLfAction("apply");
        }
      } catch {}
      if (!cancelled) setLfLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [returnOpen, actualReturn, bookingId, organizerId]);

  if (!canManage) return null;

  const showPickup = status === "confirmed" && !pickupInsp;
  const showReturn = status === "active" && !returnInsp;

  async function onAddPhotos(kind: "pickup" | "return", files: FileList | null) {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, 5);
    try {
      if (kind === "pickup") setPUploading(true); else setRUploading(true);
      const uploaded: HandoverPhoto[] = [];
      for (const f of list) uploaded.push(await uploadPhoto(bookingId, organizerId, kind, f));
      if (kind === "pickup") setPPhotos((p) => [...p, ...uploaded].slice(0, 5));
      else setRPhotos((p) => [...p, ...uploaded].slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      if (kind === "pickup") setPUploading(false); else setRUploading(false);
    }
  }

  function submitPickup() {
    setError(null);
    if (!pConfirmName.trim()) { setError("Customer confirmation name is required."); return; }
    startTransition(async () => {
      try {
        const { recordPickupHandover } = await import("@/lib/actions/rental-handover");
        const res = await recordPickupHandover(bookingId, organizerId, {
          odometer: pOdo ? Number(pOdo) : null,
          fuelLevel: pFuel || null,
          photos: pPhotos,
          damageNotes: pDamage || null,
          customerConfirmedName: pConfirmName.trim(),
          customerConfirmedAt: toIso(pConfirmAt),
        });
        if (!res.success) { setError(res.error || "Pickup handover failed"); return; }
        setPickupOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Pickup handover failed"); }
    });
  }

  function submitReturn() {
    setError(null);
    if (!rConfirmName.trim()) { setError("Customer confirmation name is required."); return; }
    const effectiveDepositAction = canSettleDeposit ? depAction : "none";
    if ((effectiveDepositAction === "retain_partial" || effectiveDepositAction === "retain_full") && !depReason.trim()) {
      setError("A reason is required to retain a deposit."); return;
    }
    if (lfAction === "waive" && (lfQuote?.amount ?? 0) > 0 && !lfReason.trim()) {
      // allow but encouraged; not strictly required by UI spec except "waive it with a reason"
      setError("Provide a reason to waive the late fee."); return;
    }
    startTransition(async () => {
      try {
        const { recordReturnHandover } = await import("@/lib/actions/rental-handover");
        const res = await recordReturnHandover(bookingId, organizerId, {
          odometer: rOdo ? Number(rOdo) : null,
          fuelLevel: rFuel || null,
          photos: rPhotos,
          damageNotes: rDamage || null,
          customerConfirmedName: rConfirmName.trim(),
          customerConfirmedAt: toIso(rConfirmAt),
          depositAction: effectiveDepositAction,
          depositRetainedAmount: effectiveDepositAction === "retain_partial" ? Number(depRetain || 0) : undefined,
          depositReason: depReason || null,
          lateFeeAction: lfAction,
          lateFeeAmount: lfAction === "none" ? null : Number(lfAmount || 0),
          lateFeeReason: lfReason || null,
          actualReturnAt: toIso(actualReturn),
        });
        if (!res.success) { setError(res.error || "Return handover failed"); return; }
        setReturnOpen(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Return handover failed"); }
    });
  }

  if (!showPickup && !showReturn && !pickupInsp && !returnInsp) return null;

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5"><IconClipboardCheck className="h-3.5 w-3.5" /> Handover</h2>
      {error ? <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700"><IconAlertTriangle className="h-4 w-4 mt-0.5" /><div>{error}</div></div> : null}

      {pickupInsp ? <InspectionSummary title="Pickup inspection" insp={pickupInsp} /> : null}
      {returnInsp ? <InspectionSummary title="Return inspection" insp={returnInsp} /> : null}

      {showPickup && !pickupOpen && (
        <button type="button" onClick={() => { setError(null); setPickupOpen(true); }} className="w-full min-h-11 rounded-xl bg-brand-700 text-white text-sm font-bold">Start pickup handover</button>
      )}

      {showPickup && pickupOpen && (
        <div className="space-y-3 border-t border-zinc-100 pt-3">
          <p className="text-sm font-semibold text-zinc-900">Pickup inspection</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-zinc-700">Odometer<input inputMode="numeric" type="number" min="0" value={pOdo} onChange={(e)=>setPOdo(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
            <label className="text-sm text-zinc-700">Fuel level<select value={pFuel} onChange={(e)=>setPFuel(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3 bg-white">{FUEL_OPTIONS.map(o=> <option key={o} value={o}>{o || "Select"}</option>)}</select></label>
          </div>
          <label className="block text-sm text-zinc-700">Damage notes<textarea value={pDamage} onChange={(e)=>setPDamage(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2" /></label>
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">Photos (up to 5)</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e)=>onAddPhotos("pickup", e.target.files)} className="block w-full text-sm" />
            {pUploading ? <p className="text-xs text-zinc-500">Uploading...</p> : null}
            {pPhotos.length ? <p className="text-xs text-zinc-600">{pPhotos.length} photo(s) attached</p> : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-zinc-700">Customer confirmed by (name)<input value={pConfirmName} onChange={(e)=>setPConfirmName(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" required /></label>
            <label className="text-sm text-zinc-700">Confirmation time<input type="datetime-local" value={pConfirmAt} onChange={(e)=>setPConfirmAt(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
          </div>
          <p className="text-xs text-zinc-500">Staff confirms the customer reviewed the vehicle condition. Inspection and status change are saved together.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending || pUploading} onClick={submitPickup} className="min-h-11 px-4 rounded-xl bg-brand-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">{isPending ? <Loader className="h-4 w-4 animate-spin"/> : <IconCheck className="h-4 w-4"/>} Save inspection & start rental</button>
            <button type="button" onClick={()=>setPickupOpen(false)} className="min-h-11 px-4 rounded-xl border border-zinc-300 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}

      {showReturn && !returnOpen && (
        <button type="button" onClick={() => { setError(null); setReturnOpen(true); }} className="w-full min-h-11 rounded-xl bg-brand-700 text-white text-sm font-bold">Start return handover</button>
      )}

      {showReturn && returnOpen && (
        <div className="space-y-4 border-t border-zinc-100 pt-3">
          <p className="text-sm font-semibold text-zinc-900">Return inspection</p>
          {pickupInsp ? <div><p className="text-xs font-semibold text-zinc-500 mb-1">Pickup record (for comparison)</p><InspectionSummary title="Pickup" insp={pickupInsp} /></div> : <p className="text-xs text-amber-700">No pickup inspection recorded.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-zinc-700">Odometer<input inputMode="numeric" type="number" min="0" value={rOdo} onChange={(e)=>setROdo(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
            <label className="text-sm text-zinc-700">Fuel level<select value={rFuel} onChange={(e)=>setRFuel(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3 bg-white">{FUEL_OPTIONS.map(o=> <option key={o} value={o}>{o || "Select"}</option>)}</select></label>
          </div>
          <label className="block text-sm text-zinc-700">Damage notes<textarea value={rDamage} onChange={(e)=>setRDamage(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2" placeholder="Note any new damage or differences from pickup" /></label>
          <div className="space-y-2">
            <p className="text-sm text-zinc-700">Photos (up to 5)</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e)=>onAddPhotos("return", e.target.files)} className="block w-full text-sm" />
            {rUploading ? <p className="text-xs text-zinc-500">Uploading...</p> : null}
            {rPhotos.length ? <p className="text-xs text-zinc-600">{rPhotos.length} photo(s) attached</p> : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-zinc-700">Customer confirmed by (name)<input value={rConfirmName} onChange={(e)=>setRConfirmName(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" required /></label>
            <label className="text-sm text-zinc-700">Confirmation time<input type="datetime-local" value={rConfirmAt} onChange={(e)=>setRConfirmAt(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
          </div>
          <label className="block text-sm text-zinc-700">Actual return time<input type="datetime-local" value={actualReturn} onChange={(e)=>setActualReturn(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>

          {/* Deposit settlement (Part B) */}
          <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Deposit settlement (offline record)</p>
            {depositSettled ? (
              <p className="text-sm text-zinc-600">Deposit already settled: <span className="font-medium">{depositStatus.replace(/_/g, " ")}</span>.</p>
            ) : canSettleDeposit ? (
              <>
                <p className="text-xs text-zinc-500">Collected: {formatMoney(depositCollected, currency)} (required {formatMoney(depositRequired, currency)}). Money is not moved through Stripe.</p>
                <select value={depAction} onChange={(e)=>setDepAction(e.target.value as DepositSettlementAction)} className="w-full h-11 rounded-xl border border-zinc-300 px-3 bg-white text-sm">
                  <option value="return_full">Return full deposit</option>
                  <option value="retain_partial">Retain part of deposit</option>
                  <option value="retain_full">Retain full deposit</option>
                </select>
                {depAction === "retain_partial" && (
                  <label className="block text-sm text-zinc-700">Amount to retain<input type="number" min="0" step="0.01" value={depRetain} onChange={(e)=>setDepRetain(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
                )}
                {(depAction === "retain_partial" || depAction === "retain_full") && (
                  <label className="block text-sm text-zinc-700">Reason for retention<textarea value={depReason} onChange={(e)=>setDepReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2" /></label>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-600">No deposit was recorded as collected. Record it in the Deposit panel first, or complete the return without settling.</p>
            )}
          </div>

          {/* Late fee (Part C) */}
          <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Late fee</p>
            {lfLoading ? <p className="text-xs text-zinc-500">Calculating...</p> : null}
            {lfQuote ? (
              <p className="text-sm text-zinc-700">Calculated: <span className="font-semibold">{formatMoney(lfQuote.amount, currency)}</span> ({lfQuote.minutes} min overdue after grace).</p>
            ) : null}
            {existingLateFeeStatus && existingLateFeeStatus !== "none" ? <p className="text-xs text-zinc-500">Current: {existingLateFeeStatus} {formatMoney(existingLateFeeAmount, currency)}</p> : null}
            <select value={lfAction} onChange={(e)=>setLfAction(e.target.value as LateFeeAction)} className="w-full h-11 rounded-xl border border-zinc-300 px-3 bg-white text-sm">
              {!(lfQuote && lfQuote.amount > 0) && <option value="none">No late fee change</option>}
              <option value="apply">Apply late fee</option>
              <option value="waive">Waive late fee</option>
            </select>
            {lfAction !== "none" && (
              <>
                <label className="block text-sm text-zinc-700">Late fee amount<input type="number" min="0" step="0.01" value={lfAmount} onChange={(e)=>setLfAmount(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-zinc-300 px-3" /></label>
                <label className="block text-sm text-zinc-700">Reason / note<textarea value={lfReason} onChange={(e)=>setLfReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2" placeholder={lfAction === "waive" ? "Reason for waiving" : "Optional note"} /></label>
              </>
            )}
          </div>

          <p className="text-xs text-zinc-500">Inspection, return, deposit settlement and late fee are saved together and cannot double-submit.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isPending || rUploading} onClick={submitReturn} className="min-h-11 px-4 rounded-xl bg-brand-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">{isPending ? <Loader className="h-4 w-4 animate-spin"/> : <IconCheck className="h-4 w-4"/>} Save inspection & complete return</button>
            <button type="button" onClick={()=>setReturnOpen(false)} className="min-h-11 px-4 rounded-xl border border-zinc-300 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
