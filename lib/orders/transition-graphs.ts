import type { OrderStatus } from "@/lib/orders/transition-core";

export const PICKUP_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  picked_up: [],
  out_for_delivery: [],
  delivered: [],
  completed: [],
  cancelled: [],
};

export const DELIVERY_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  picked_up: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  completed: [],
  cancelled: [],
};

export const DINE_IN_TRANSITION_GRAPH: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  picked_up: [],
  out_for_delivery: [],
  delivered: [],
  completed: [],
  cancelled: [],
};

export const TRANSITION_GRAPHS = {
  pickup: PICKUP_TRANSITION_GRAPH,
  delivery: DELIVERY_TRANSITION_GRAPH,
  dine_in: DINE_IN_TRANSITION_GRAPH,
};
