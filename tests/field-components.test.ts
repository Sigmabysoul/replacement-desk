import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input, Textarea } from "@/components/ui/field";
import { OrderBuilder } from "@/components/replacements/order-builder";

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
  });
});
