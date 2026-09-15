import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input, Textarea } from "@/components/ui/field";
import { ProductPhotoPicker } from "@/components/replacements/product-photo-picker";
import { ReasonSelect } from "@/components/replacements/reason-select";
import {
  OrderBuilder,
  PRODUCT_LIST_CLASS,
  groupProductsIntoRows,
} from "@/components/replacements/order-builder";

describe("shared field styling", () => {
  it("preserves base input styling when a caller adds a custom class", () => {
    const markup = renderToStaticMarkup(createElement(Input, { className: "lowercase" }));
    expect(markup).toContain("lowercase");
    expect(markup).toContain("rounded-xl");
    expect(markup).toContain("border-border");
  });

  it("preserves base textarea sizing when a caller overrides minimum height", () => {
    const markup = renderToStaticMarkup(createElement(Textarea, { className: "min-h-24" }));
    expect(markup).toContain("min-h-24");
    expect(markup).toContain("w-full");
    expect(markup).toContain("border-border");
  });
});

describe("new order form structure", () => {
  const action = async () => undefined;

  it("shows the requested customer and full-width order sections without customer reference", () => {
    const markup = renderToStaticMarkup(createElement(OrderBuilder, {
      action,
      presets: [],
      isAdmin: false,
      startingOrderNumber: 501,
    }));
    expect(markup).toContain("Customer address");
    expect(markup).not.toContain("Customer reference");
    expect(markup).toContain("Courier Partner");
    expect(markup).not.toContain("Order reference");
    expect(markup).toContain("Select a reason");
    expect(markup).toContain("Product details");
    expect(markup).toContain("Dimensions &amp; fulfilment");
    expect(markup).toContain("value=\"501\"");
    expect(markup).toContain("readOnly=\"\"");
  });

  it("lets Admin edit the proposed Order ID", () => {
    const markup = renderToStaticMarkup(createElement(OrderBuilder, {
      action,
      presets: [],
      isAdmin: true,
      startingOrderNumber: 501,
    }));
    expect(markup).toContain("Order ID editable by Admin");
    expect(markup).not.toContain("readOnly=\"\"");
    expect(markup).toContain('min="1"');
    expect(markup).toContain("order-id-input");
  });

  it("places the Order ID in the section header before the order-type toggle", () => {
    const markup = renderToStaticMarkup(createElement(OrderBuilder, {
      action,
      presets: [],
      isAdmin: true,
      startingOrderNumber: 501,
    }));
    expect(markup.indexOf("Order ID")).toBeLessThan(markup.indexOf('aria-label="Order type"'));
  });

  it("lays out products as complete pairs with a full-width unpaired card", () => {
    expect(groupProductsIntoRows([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    expect(groupProductsIntoRows([1, 2, 3, 4, 5])).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it("uses normal page scrolling instead of a nested product scrollbar", () => {
    expect(PRODUCT_LIST_CLASS).not.toContain("overflow-y-auto");
    expect(PRODUCT_LIST_CLASS).not.toContain("max-h-");
  });
});

describe("order reasons", () => {
  it("can show Offline order as the selected default", () => {
    const markup = renderToStaticMarkup(createElement(ReasonSelect, {
      defaultValue: "Offline order",
      presets: ["Offline order"],
    }));
    expect(markup).toContain('<option value="Offline order" selected="">Offline order</option>');
  });
});

describe("product photo picker contrast", () => {
  it("uses a theme surface on hover and readable foreground text", () => {
    const markup = renderToStaticMarkup(createElement(ProductPhotoPicker));
    expect(markup).toContain("hover:bg-muted");
    expect(markup).not.toContain("hover:bg-indigo-50");
    expect(markup).toContain("text-foreground");
  });
});
