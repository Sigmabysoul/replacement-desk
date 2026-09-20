import type { OfflineOrderItem, ReplacementItem } from "@/lib/types";

type OrderItem = Pick<ReplacementItem | OfflineOrderItem, "product_name" | "quantity" | "position">;

/** Renders every product in an order, while retaining a fallback for pre-migration rows. */
export function OrderItemsSummary({
  items,
  fallbackProduct,
  fallbackQuantity,
  unit,
  className = "",
}: {
  items?: OrderItem[];
  fallbackProduct: string;
  fallbackQuantity: number;
  unit?: string;
  className?: string;
}) {
  const visibleItems = items?.length
    ? [...items].sort((a, b) => a.position - b.position)
    : [{ product_name: fallbackProduct, quantity: fallbackQuantity, position: 1 }];

  return (
    <ul className={`grid min-w-0 gap-1 ${className}`}>
      {visibleItems.map((item) => (
        <li key={`${item.position}-${item.product_name}`} className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-semibold">{item.product_name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            × {item.quantity}{unit ? ` ${unit}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
