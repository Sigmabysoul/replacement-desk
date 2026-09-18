"use client";

import { useMemo, useState } from "react";
import { CirclePlus, LockKeyhole, Package, Rotate3D, Trash2, UserRound, X } from "lucide-react";
import { ProductPhotoPicker } from "@/components/replacements/product-photo-picker";
import { ReasonSelect } from "@/components/replacements/reason-select";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import type { DimensionPreset } from "@/lib/types";

type CustomerDraft = {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
};

type OrderDraft = {
  id: string;
  customerId: string;
  orderNumber: string;
  orderReference: string;
  productName: string;
  quantity: string;
  reason: string;
  notes: string;
  shippingSpeed: "STANDARD" | "EXPRESS";
  presetId: string;
  length: string;
  breadth: string;
  height: string;
};

type ProductCardProps = {
  order: OrderDraft;
  index: number;
  compact: boolean;
  removable: boolean;
  isAdmin: boolean;
  presets: DimensionPreset[];
  updateOrder: (id: string, patch: Partial<OrderDraft>) => void;
  choosePreset: (id: string, presetId: string) => void;
  removeOrder: (order: OrderDraft) => void;
};

/**
 * Products are arranged in stable pairs. A newly added odd product starts on
 * its own full-width row; adding the next product completes that row as a pair.
 */
export function groupProductsIntoRows<T>(products: T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < products.length; index += 2) {
    rows.push(products.slice(index, index + 2));
  }
  return rows;
}

export const PRODUCT_LIST_CLASS = "grid gap-5";

const newCustomer = (id = crypto.randomUUID()): CustomerDraft => ({
  id,
  name: "",
  address: "",
  email: "",
  phone: "",
});

const newOrder = (
  customerId: string,
  orderNumber: number,
  id = crypto.randomUUID(),
): OrderDraft => ({
  id,
  customerId,
  orderNumber: String(orderNumber),
  orderReference: "",
  productName: "",
  quantity: "1",
  reason: "",
  notes: "",
  shippingSpeed: "STANDARD",
  presetId: "",
  length: "",
  breadth: "",
  height: "",
});

function ProductDetailsSection({
  order,
  index,
  compact,
  removable,
  isAdmin,
  updateOrder,
  removeOrder,
}: Omit<ProductCardProps, "presets" | "choosePreset">) {
  return (
    <section className="grid content-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 items-center gap-2 pt-1">
          <Package className="size-5 shrink-0 text-indigo-600" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Product details</p>
            <h3 className="font-black text-foreground">
              Replacement order {index + 1}
            </h3>
          </div>
        </div>
        <div className="ml-auto w-full sm:w-40">
          <Field
            label="Order ID"
            hint={isAdmin ? "Admin can change this ID." : "Only Admin can change this ID."}
          >
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                required
                readOnly={!isAdmin}
                value={order.orderNumber}
                onChange={(event) => isAdmin && updateOrder(order.id, { orderNumber: event.target.value })}
                className={cn("order-id-input pr-10 font-black", !isAdmin && "cursor-not-allowed bg-muted")}
                aria-label={isAdmin ? "Order ID editable by Admin" : "Order ID locked for Customer Support"}
              />
              {!isAdmin ? <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /> : null}
            </div>
          </Field>
        </div>
        {removable ? (
          <button
            type="button"
            onClick={() => removeOrder(order)}
            className="ml-auto grid size-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
            aria-label="Remove this order"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "sm:grid-cols-[1fr_140px]")}>
        <Field label="Product">
          <Input required value={order.productName} onChange={(event) => updateOrder(order.id, { productName: event.target.value })} maxLength={200} placeholder="Product name or description" />
        </Field>
        <Field label="Quantity">
          <Input required type="number" inputMode="numeric" min={1} max={999} value={order.quantity} onChange={(event) => updateOrder(order.id, { quantity: event.target.value })} />
        </Field>
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        <ReasonSelect
          key={order.id}
          name={null}
          defaultValue={order.reason}
          onValueChange={(reason) => updateOrder(order.id, { reason })}
        />
        <Field label="Notes">
          <Textarea value={order.notes} onChange={(event) => updateOrder(order.id, { notes: event.target.value })} maxLength={2000} className="min-h-24" />
        </Field>
      </div>
    </section>
  );
}

function DimensionSection({
  order,
  compact,
  presets,
  updateOrder,
  choosePreset,
}: Pick<ProductCardProps, "order" | "compact" | "presets" | "updateOrder" | "choosePreset">) {
  return (
    <section className="grid content-start gap-4 rounded-2xl border border-border bg-muted/25 p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Dimensions & fulfilment
        </p>
        <h3 className="font-black text-foreground">
          Package dimensions
        </h3>
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-[1.2fr_2fr]")}>
        <Field label="Dimension preset">
          <Select value={order.presetId} onChange={(event) => choosePreset(order.id, event.target.value)}>
            <option value="">Enter manually</option>
            {presets.filter((preset) => preset.active).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} — {preset.length_cm} × {preset.breadth_cm} × {preset.height_cm} cm
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Field label="Length (cm)">
            <Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.length} onChange={(event) => updateOrder(order.id, { length: event.target.value, presetId: "" })} />
          </Field>
          <Field label="Breadth (cm)">
            <Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.breadth} onChange={(event) => updateOrder(order.id, { breadth: event.target.value, presetId: "" })} />
          </Field>
          <Field label="Height (cm)">
            <Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.height} onChange={(event) => updateOrder(order.id, { height: event.target.value, presetId: "" })} />
          </Field>
        </div>
      </div>

      <Field label="Shipping speed">
        <Select value={order.shippingSpeed} onChange={(event) => updateOrder(order.id, { shippingSpeed: event.target.value as OrderDraft["shippingSpeed"] })}>
          <option value="STANDARD">Standard</option>
          <option value="EXPRESS">Express</option>
        </Select>
      </Field>
      <ProductPhotoPicker name={`product_photos:${order.id}`} />
    </section>
  );
}

function ProductCard(props: ProductCardProps) {
  return (
    <article
      key={props.order.id}
      className="order-card-flip grid h-full grid-rows-[auto_1fr] gap-4"
    >
      <ProductDetailsSection {...props} />
      <DimensionSection {...props} />
    </article>
  );
}

export function OrderBuilder({
  action,
  presets,
  isAdmin,
  startingOrderNumber,
}: {
  action: (formData: FormData) => Promise<void>;
  presets: DimensionPreset[];
  isAdmin: boolean;
  startingOrderNumber: number;
}) {
  const [initial] = useState(() => {
    const customer = newCustomer("customer-1");
    return { customer, order: newOrder(customer.id, startingOrderNumber, "order-1") };
  });
  const [customers, setCustomers] = useState<CustomerDraft[]>([initial.customer]);
  const [orders, setOrders] = useState<OrderDraft[]>([initial.order]);
  const [adding, setAdding] = useState(false);

  const manifest = useMemo(() => orders.map((order) => {
    const customer = customers.find((item) => item.id === order.customerId)!;
    return {
      id: order.id,
      requested_order_number: isAdmin ? order.orderNumber : null,
      order_type: "REPLACEMENT" as const,
      order_reference: order.orderReference || `REF-${order.orderNumber}`,
      customer_name: customer.name,
      customer_reference: null,
      customer_address: customer.address,
      customer_email: customer.email.toLowerCase(),
      customer_phone: customer.phone,
      product_name: order.productName,
      quantity: order.quantity,
      reason: order.reason,
      notes: order.notes,
      shipping_speed: order.shippingSpeed,
      dimension_preset_id: order.presetId,
      length_cm: order.length,
      breadth_cm: order.breadth,
      height_cm: order.height,
    };
  }), [customers, isAdmin, orders]);

  function updateCustomer(id: string, patch: Partial<CustomerDraft>) {
    setCustomers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updateOrder(id: string, patch: Partial<OrderDraft>) {
    setOrders((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function choosePreset(orderId: string, presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    updateOrder(orderId, preset ? {
      presetId,
      length: String(preset.length_cm),
      breadth: String(preset.breadth_cm),
      height: String(preset.height_cm),
    } : { presetId: "", length: "", breadth: "", height: "" });
  }

  function addOrder(sameCustomer: boolean) {
    let customerId = customers.at(-1)!.id;
    if (!sameCustomer) {
      const customer = newCustomer();
      customerId = customer.id;
      setCustomers((current) => [...current, customer]);
    }
    setOrders((current) => [
      ...current,
      newOrder(customerId, startingOrderNumber + current.length),
    ]);
    setAdding(false);
  }

  function removeOrder(order: OrderDraft) {
    setOrders((current) => current.filter((item) => item.id !== order.id));
    if (orders.filter((item) => item.customerId === order.customerId).length === 1) {
      setCustomers((current) => current.filter((item) => item.id !== order.customerId));
    }
  }

  return (
    <form action={action} className="grid gap-7">
      <input type="hidden" name="orders_manifest" value={JSON.stringify(manifest)} />

      {customers.map((customer, customerIndex) => {
        const customerOrders = orders.filter((order) => order.customerId === customer.id);
        const productRows = groupProductsIntoRows(customerOrders);
        if (!customerOrders.length) return null;
        return (
          <section key={customer.id} className="customer-order-branch grid gap-4">
            <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <div className="flex items-center gap-2 sm:col-span-2">
                <UserRound className="size-5 text-indigo-600" />
                <h2 className="font-black text-foreground">Customer {customerIndex + 1}</h2>
                <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                  {customerOrders.length} product{customerOrders.length === 1 ? "" : "s"}
                </span>
              </div>
              <Field label="Customer name">
                <Input value={customer.name} onChange={(event) => updateCustomer(customer.id, { name: event.target.value })} maxLength={120} />
              </Field>
              <Field label="Customer email">
                <Input
                  type="email"
                  inputMode="email"
                  value={customer.email}
                  onChange={(event) => updateCustomer(customer.id, { email: event.target.value.toLowerCase() })}
                  className="lowercase"
                  maxLength={254}
                />
              </Field>
              <Field label="Phone">
                <Input type="tel" inputMode="tel" value={customer.phone} onChange={(event) => updateCustomer(customer.id, { phone: event.target.value })} maxLength={40} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Customer address">
                  <Textarea value={customer.address} onChange={(event) => updateCustomer(customer.id, { address: event.target.value })} maxLength={1000} className="min-h-24" />
                </Field>
              </div>
            </Card>

            <div className={PRODUCT_LIST_CLASS} aria-label={`Products for customer ${customerIndex + 1}`}>
              {productRows.map((row, rowIndex) => {
                const compact = row.length === 2;
                return (
                  <div
                    key={row.map((order) => order.id).join(":")}
                    className={cn(
                      "order-layout-transition grid items-stretch gap-5",
                      compact && "md:grid-cols-2",
                    )}
                    data-products-per-row={row.length}
                  >
                    {row.map((order, columnIndex) => (
                      <ProductCard
                        key={order.id}
                        order={order}
                        index={(rowIndex * 2) + columnIndex}
                        compact={compact}
                        removable={orders.length > 1}
                        isAdmin={isAdmin}
                        presets={presets}
                        updateOrder={updateOrder}
                        choosePreset={choosePreset}
                        removeOrder={removeOrder}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Card className="border-dashed p-4">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-[var(--brand)] hover:bg-muted transition"
          >
            <CirclePlus className="size-5" /> ADD ANOTHER REPLACEMENT ORDER
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <p className="text-sm font-bold text-foreground">
                Who is this replacement order for?
              </p>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cancel"
              >
                <X className="size-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => addOrder(true)}
              className="min-h-12 rounded-xl bg-[var(--brand)] font-bold text-white transition hover:opacity-95"
            >
              Same customer
            </button>
            <button
              type="button"
              onClick={() => addOrder(false)}
              className="min-h-12 rounded-xl border border-border bg-card font-bold text-foreground transition hover:bg-muted"
            >
              Different customer
            </button>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Rotate3D className="size-4" /> Product cards smoothly resize as orders are configured.
      </div>
      <SubmitButton pendingText="Creating replacement orders and uploading photos…">
        CREATE {orders.length > 1 ? `${orders.length} REPLACEMENTS` : "REPLACEMENT ORDER"}
      </SubmitButton>
    </form>
  );
}
