/**
 * lib/staff/guest-access-ended-message.ts
 *
 * Pure message builder for a guest (account-less) scanner session whose
 * access has ended (live-scan 401, sync 401, or manual dataset-download
 * 401). The offline ticket dataset is cleared on this path (it can no
 * longer be trusted once a session is revoked), but any scans already
 * queued locally are never deleted — they stay on the device until a
 * re-invited session can sync them. Zero I/O: safe to unit-test directly.
 */

export const GUEST_ACCESS_ENDED_BASE_MESSAGE =
  "Your access has ended. Ask the organizer for a new invitation.";

/**
 * Appends a note about unsynced scans kept on the device, pluralized
 * correctly, or returns the base message unchanged when nothing is kept.
 */
export function buildGuestAccessEndedMessage(unsyncedScanCount: number): string {
  if (!Number.isFinite(unsyncedScanCount) || unsyncedScanCount <= 0) {
    return GUEST_ACCESS_ENDED_BASE_MESSAGE;
  }
  const noun = unsyncedScanCount === 1 ? "scan is" : "scans are";
  return `${GUEST_ACCESS_ENDED_BASE_MESSAGE} ${unsyncedScanCount} ${noun} kept on this device. Ask the organizer to re-invite you to send them.`;
}
