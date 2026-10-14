/**
 * lib/courier/types.ts
 *
 * Courier integration abstraction seam (Phase 7 preparatory).
 * Defines a minimal provider interface and built-in delivery descriptors.
 *
 * NO network code, NO third-party vendor names, NO env vars.
 * When real courier API access is provisioned, concrete provider adapters
 * plug into this interface.
 */

export type CourierDeliveryType = "owner_rider" | "manual_whatsapp" | "provider_api";

export interface CourierProviderDescriptor {
  id: CourierDeliveryType;
  name: string;
  description: string;
  isAutomated: boolean;
}

export const BUILTIN_COURIER_PROVIDERS: readonly CourierProviderDescriptor[] = [
  {
    id: "owner_rider",
    name: "Owner Fleet / Staff Rider",
    description: "In-house delivery by restaurant staff with direct rider phone contact.",
    isAutomated: false,
  },
  {
    id: "manual_whatsapp",
    name: "Manual Courier via WhatsApp",
    description: "Dispatch a courier pickup request via a direct WhatsApp message link.",
    isAutomated: false,
  },
] as const;

export interface CourierPickupRequest {
  orderId: string;
  orderNumber: string;
  pickupAddress: string;
  dropoffAddress: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  currency: string;
  isPaid: boolean;
  notes?: string | null;
}

export interface CourierPickupResult {
  success: boolean;
  trackingReference?: string;
  estimatedPickupTime?: string;
  error?: string;
}

/**
 * Minimal interface that any automated courier provider adapter must implement.
 */
export interface CourierProvider {
  id: string;
  name: string;
  requestPickup(request: CourierPickupRequest): Promise<CourierPickupResult>;
  cancelPickup?(trackingReference: string): Promise<{ success: boolean; error?: string }>;
}
