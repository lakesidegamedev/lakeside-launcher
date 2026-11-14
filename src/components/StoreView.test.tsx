import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { CATALOG_SNAPSHOT } from "../lib/catalogSnapshot";
import { StoreView } from "./StoreView";

// Margin of Victory (electioneer) has no paid entitlement, so free access does not open its
// packs: they stay on sale with their Buy buttons. The paid games are what the switch covers.
const products = CATALOG.filter((product) => !product.companionOf && !product.staffOnly && product.id !== "electioneer");
const noop = (): void => undefined;

function render(freeWeek: string | null, signedIn: boolean): string {
  return renderToStaticMarkup(
    <StoreView
      catalog={CATALOG_SNAPSHOT}
      live
      entitlements={{}}
      freeIds={new Set()}
      freeText={signedIn ? freeWeek : null}
      freeWeek={freeWeek}
      products={products}
      signedIn={signedIn}
      onBuy={noop}
      onSignIn={noop}
      onOpenUrl={noop}
      onOpenGame={noop}
      onRefresh={noop}
    />,
  );
}

const buyButton = />Buy</;

describe("store tab during free access", () => {
  it("every paid game row says Free with its usual price struck", () => {
    const html = render("Free until Sunday 5:00 PM Eastern", true);
    expect(html).not.toContain("Free right now");
    expect(html).toMatch(/Free <small class="muted"><s>/);
  });

  it("a staff-only product is never shown as free", () => {
    const staff = CATALOG.filter((product) => product.staffOnly);
    expect(staff.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      <StoreView
        catalog={CATALOG_SNAPSHOT}
        live
        entitlements={{}}
        freeIds={new Set()}
        freeText="Free for now"
        freeWeek="Free for now"
        products={staff}
        signedIn
        onBuy={noop}
        onSignIn={noop}
        onOpenUrl={noop}
        onOpenGame={noop}
        onRefresh={noop}
      />,
    );
    expect(html).not.toContain("<s>");
    expect(html).not.toContain("Sign in to play free");
  });

  it("signed out: no Buy buttons, prices struck, asks to sign in", () => {
    const html = render("Free until Sunday 5:00 PM Eastern", false);
    expect(html).not.toMatch(buyButton);
    expect(html).not.toContain(">Choose<");
    expect(html).toContain("Sign in to play free");
    expect(html).toContain("<s>$14.99</s>");
    expect(html).toContain("with a free Lakeside account");
    expect(html).not.toContain("Buy once");
    expect(html).not.toMatch(/[–—]/);
  });

  it("signed in: no Buy buttons or sign-in prompts", () => {
    const html = render("Free until Sunday 5:00 PM Eastern", true);
    expect(html).not.toMatch(buyButton);
    expect(html).not.toContain("Sign in to play free");
    expect(html).toContain("Every game is free to play right now.");
  });

  it("off: prices and Buy buttons as usual", () => {
    const html = render(null, false);
    expect(html).toMatch(buyButton);
    expect(html).toContain("Buy once, keep it on your Lakeside account.");
    expect(html).not.toContain("Sign in to play free");
  });
});
