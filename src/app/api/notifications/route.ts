import { sql } from "@/lib/db";
import { getSessionProfile } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const replacements = await sql`
      SELECT id, replacement_number, order_reference, product_name, status, updated_at,
        (SELECT COALESCE(json_agg(json_build_object('product_name', ri.product_name, 'quantity', ri.quantity, 'position', ri.position) ORDER BY ri.position), '[]'::json)
         FROM public.replacement_items ri WHERE ri.replacement_id = replacements.id) AS items
      FROM public.replacements
      ORDER BY updated_at DESC
      LIMIT 8
    `;

    const offlineOrders = await sql`
      SELECT id, so_number, product_name, status, updated_at, carton_count, logistics_partner,
        (SELECT COALESCE(json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'position', oi.position) ORDER BY oi.position), '[]'::json)
         FROM public.offline_order_items oi WHERE oi.offline_order_id = offline_orders.id) AS items
      FROM public.offline_orders
      ORDER BY updated_at DESC
      LIMIT 8
    `;

    return NextResponse.json({ replacements, offlineOrders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

