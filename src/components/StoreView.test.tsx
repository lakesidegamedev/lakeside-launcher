import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { CATALOG_SNAPSHOT } from "../lib/catalogSnapshot";
import { StoreView } from "./StoreView";

const products = CATALOG.filter((product) => !product.companionOf && !product.staffOnly);
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
  it("signed out: no Buy buttons, prices struck, asks to sign in", () => {
    const html = render("Free until Sunday 5:00 PM Eastern", false);
    expect(html).not.toMatch(buyButton);
    expect(html).not.toContain(">Choose<");
    expect(html).toContain("Sign in to play free");
    expect(html).toContain("<s>$3.99</s>");
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
