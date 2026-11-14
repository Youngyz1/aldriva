export {
  PrintedReceipt,
  formatReceiptAmount,
  shortReference,
} from "./PrintedReceipt";
export type {
  PrintedReceiptProps,
  ReceiptCode,
  ReceiptDetail,
  ReceiptItem,
  ReceiptRow,
  ReceiptStatus,
  ReceiptStatusTone,
} from "./PrintedReceipt";

export { ReceiptReveal } from "./ReceiptReveal";
export { ReceiptBarcode } from "./ReceiptBarcode";
export { ReceiptQr } from "./ReceiptQr";
export { usePrefersReducedMotion } from "./usePrefersReducedMotion";
export { useJustCompletedArrival } from "./useJustCompletedArrival";
export { useReceiptSound, primeReceiptAudio } from "./useReceiptSound";

export { EventTicketReceipt } from "./variants/EventTicketReceipt";
export type { EventTicketReceiptProps } from "./variants/EventTicketReceipt";

export { BusinessOrderReceipt } from "./variants/BusinessOrderReceipt";
export type {
  BusinessOrderReceiptProps,
  BusinessOrderItem,
} from "./variants/BusinessOrderReceipt";

export { DonationReceipt } from "./variants/DonationReceipt";
export type { DonationReceiptProps } from "./variants/DonationReceipt";

export { BookingReceipt } from "./variants/BookingReceipt";
export type { BookingReceiptProps } from "./variants/BookingReceipt";

export { RentalReceipt } from "./variants/RentalReceipt";
export type { RentalReceiptProps } from "./variants/RentalReceipt";

export { HotelReservationReceipt } from "./variants/HotelReservationReceipt";
export type { HotelReservationReceiptProps } from "./variants/HotelReservationReceipt";
