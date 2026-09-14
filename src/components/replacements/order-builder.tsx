"use client";

import { useMemo, useState } from "react";
import { Boxes, CirclePlus, Package, Rotate3D, Trash2, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { DimensionPreset, OrderType } from "@/lib/types";
import { ProductPhotoPicker } from "@/components/replacements/product-photo-picker";

type CustomerDraft = {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  reference: string;
};

type OrderDraft = {
  id: string;
  customerId: string;
  orderType: OrderType;
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

const newCustomer = (id = crypto.randomUUID()): CustomerDraft => ({
  id, name: "", address: "", email: "", phone: "", reference: "",
});

const newOrder = (customerId: string, orderType: OrderType = "REPLACEMENT", id = crypto.randomUUID()): OrderDraft => ({
  id, customerId, orderType, orderReference: "", productName: "", quantity: "1",
  reason: "", notes: "", shippingSpeed: "STANDARD", presetId: "", length: "", breadth: "", height: "",
});

export function OrderBuilder({
  action,
  presets,
}: {
  action: (formData: FormData) => Promise<void>;
  presets: DimensionPreset[];
}) {
  const [initial] = useState(() => {
    const customer = newCustomer("customer-1");
    return { customer, order: newOrder(customer.id, "REPLACEMENT", "order-1") };
  });
  const [customers, setCustomers] = useState<CustomerDraft[]>([initial.customer]);
  const [orders, setOrders] = useState<OrderDraft[]>([initial.order]);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<OrderType | null>(null);

  const manifest = useMemo(() => orders.map((order) => {
    const customer = customers.find((item) => item.id === order.customerId)!;
    return {
      id: order.id,
      order_type: order.orderType,
      order_reference: order.orderReference,
      customer_name: customer.name,
      customer_reference: customer.reference,
      customer_address: customer.address,
      customer_email: customer.email.toLowerCase(),
      customer_phone: customer.phone,
      product_name: order.productName,
      quantity: order.quantity,
      reason: order.reason,
      notes: order.notes,
      shipping_speed: order.shippingSpeed,
      dimension_preset_id: order.orderType === "REPLACEMENT" ? order.presetId : "",
      length_cm: order.orderType === "REPLACEMENT" ? order.length : "",
      breadth_cm: order.orderType === "REPLACEMENT" ? order.breadth : "",
      height_cm: order.orderType === "REPLACEMENT" ? order.height : "",
    };
  }), [customers, orders]);

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
    if (!newType) return;
    let customerId = customers[0].id;
    if (!sameCustomer) {
      const customer = newCustomer();
      customerId = customer.id;
      setCustomers((current) => [...current, customer]);
    }
    setOrders((current) => [...current, newOrder(customerId, newType)]);
    setAdding(false);
    setNewType(null);
  }

  function removeOrder(order: OrderDraft) {
    setOrders((current) => current.filter((item) => item.id !== order.id));
    if (orders.filter((item) => item.customerId === order.customerId).length === 1) {
      setCustomers((current) => current.filter((item) => item.id !== order.customerId));
    }
  }

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="orders_manifest" value={JSON.stringify(manifest)} />

      {customers.map((customer, customerIndex) => {
        const customerOrders = orders.filter((order) => order.customerId === customer.id);
        if (!customerOrders.length) return null;
        return (
          <section key={customer.id} className="grid gap-4">
            <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <div className="sm:col-span-2 flex items-center gap-2">
                <UserRound className="size-5 text-indigo-600" />
                <h2 className="font-black text-foreground">Customer {customerIndex + 1}</h2>
                <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Order ID assigned automatically from 501</span>
              </div>
              <Field label="Customer name">
                <Input value={customer.name} onChange={(event) => updateCustomer(customer.id, { name: event.target.value })} maxLength={120} />
              </Field>
              <Field label="Customer email">
                <Input type="email" inputMode="email" value={customer.email} onChange={(event) => updateCustomer(customer.id, { email: event.target.value.toLowerCase() })} className="lowercase" maxLength={254} />
              </Field>
              <Field label="Phone">
                <Input type="tel" inputMode="tel" value={customer.phone} onChange={(event) => updateCustomer(customer.id, { phone: event.target.value })} maxLength={40} />
              </Field>
              <Field label="Customer reference">
                <Input value={customer.reference} onChange={(event) => updateCustomer(customer.id, { reference: event.target.value })} maxLength={100} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Delivery address">
                  <Textarea value={customer.address} onChange={(event) => updateCustomer(customer.id, { address: event.target.value })} maxLength={1000} className="min-h-24" />
                </Field>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {customerOrders.map((order, orderIndex) => (
                <Card key={`${order.id}-${order.orderType}`} className="order-card-flip grid content-start gap-4 p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    {order.orderType === "REPLACEMENT" ? <Package className="size-5 text-indigo-600" /> : <Boxes className="size-5 text-indigo-600" />}
                    <h3 className="font-black text-foreground">{order.orderType === "REPLACEMENT" ? "Replacement" : "Offline"} order {orderIndex + 1}</h3>
                    {orders.length > 1 ? (
                      <button type="button" onClick={() => removeOrder(order)} className="ml-auto grid size-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label="Remove this order">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 rounded-xl bg-muted p-1" aria-label="Order type">
                    {(["REPLACEMENT", "OFFLINE"] as const).map((type) => (
                      <button key={type} type="button" onClick={() => updateOrder(order.id, {
                        orderType: type,
                        ...(type === "OFFLINE" ? { presetId: "", length: "", breadth: "", height: "" } : {}),
                      })} className={`min-h-10 rounded-lg text-xs font-black transition ${order.orderType === type ? "bg-card text-[var(--brand)] shadow-sm" : "text-muted-foreground"}`}>
                        {type === "REPLACEMENT" ? "REPLACEMENT" : "OFFLINE ORDER"}
                      </button>
                    ))}
                  </div>

                  <Field label="Order reference">
                    <Input required value={order.orderReference} onChange={(event) => updateOrder(order.id, { orderReference: event.target.value })} maxLength={100} placeholder="Marketplace / invoice reference" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
                    <Field label="Product">
                      <Input required value={order.productName} onChange={(event) => updateOrder(order.id, { productName: event.target.value })} maxLength={200} />
                    </Field>
                    <Field label="Quantity">
                      <Input required type="number" inputMode="numeric" min={1} max={999} value={order.quantity} onChange={(event) => updateOrder(order.id, { quantity: event.target.value })} />
                    </Field>
                  </div>
                  <Field label="Reason">
                    <Input value={order.reason} onChange={(event) => updateOrder(order.id, { reason: event.target.value })} maxLength={200} placeholder={order.orderType === "OFFLINE" ? "Offline sale" : "Damaged, wrong product…"} />
                  </Field>
                  <Field label="Notes">
                    <Textarea value={order.notes} onChange={(event) => updateOrder(order.id, { notes: event.target.value })} maxLength={2000} className="min-h-24" />
                  </Field>

                  {order.orderType === "REPLACEMENT" ? (
                    <div className="grid gap-4 rounded-xl border border-border bg-muted/45 p-3">
                      <Field label="Dimension preset">
                        <Select value={order.presetId} onChange={(event) => choosePreset(order.id, event.target.value)}>
                          <option value="">Enter manually</option>
                          {presets.filter((preset) => preset.active).map((preset) => <option key={preset.id} value={preset.id}>{preset.name} — {preset.length_cm} × {preset.breadth_cm} × {preset.height_cm} cm</option>)}
                        </Select>
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="Length (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.length} onChange={(event) => updateOrder(order.id, { length: event.target.value, presetId: "" })} /></Field>
                        <Field label="Breadth (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.breadth} onChange={(event) => updateOrder(order.id, { breadth: event.target.value, presetId: "" })} /></Field>
                        <Field label="Height (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={order.height} onChange={(event) => updateOrder(order.id, { height: event.target.value, presetId: "" })} /></Field>
                      </div>
                    </div>
                  ) : null}

                  <Field label="Shipping speed">
                    <Select value={order.shippingSpeed} onChange={(event) => updateOrder(order.id, { shippingSpeed: event.target.value as OrderDraft["shippingSpeed"] })}>
                      <option value="STANDARD">Standard</option>
                      <option value="EXPRESS">Express</option>
                    </Select>
                  </Field>
                  <ProductPhotoPicker name={`product_photos:${order.id}`} />
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <Card className="border-dashed p-4">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-[var(--brand)] hover:bg-muted">
            <CirclePlus className="size-5" /> ADD ANOTHER ORDER
          </button>
        ) : !newType ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-center text-sm font-bold text-foreground">Which type of order?</p>
            <button type="button" onClick={() => setNewType("REPLACEMENT")} className="min-h-12 rounded-xl bg-[var(--brand)] font-bold text-white">Replacement</button>
            <button type="button" onClick={() => setNewType("OFFLINE")} className="min-h-12 rounded-xl border border-border bg-card font-bold text-foreground">Offline</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-center text-sm font-bold text-foreground">Who is this {newType === "REPLACEMENT" ? "replacement" : "offline order"} for?</p>
            <button type="button" onClick={() => addOrder(true)} className="min-h-12 rounded-xl bg-[var(--brand)] font-bold text-white">Same customer</button>
            <button type="button" onClick={() => addOrder(false)} className="min-h-12 rounded-xl border border-border bg-card font-bold text-foreground">Different customer</button>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Rotate3D className="size-4" /> Switching order type uses a card-flip transition.</div>
      <SubmitButton pendingText="Creating orders and uploading photos…">CREATE {orders.length > 1 ? `${orders.length} ORDERS` : "ORDER"}</SubmitButton>
    </form>
  );
}
