import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter." }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from("product_orders")
      .select("id, status, product_name, quantity, total_amount, currency, product:products(slug)")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({
      status: order.status,
      productName: order.product_name,
      productSlug: (order.product as any)?.slug || null,
      quantity: order.quantity,
      totalAmount: order.total_amount,
      currency: order.currency,
    });
  } catch (err: unknown) {
    console.error("products/order-lookup route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
