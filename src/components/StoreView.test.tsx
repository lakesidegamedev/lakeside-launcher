import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { CATALOG_SNAPSHOT } from "../lib/catalogSnapshot";
import { StoreView } from "./StoreView";

// Free access opens Margin of Victory packs too, although the base product has no entitlement:
// its add-on rows get the same Free treatment as the games.
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
  it("every paid game row says Free with its usual price struck", () => {
    const html = render("Free until Sunday, November 22 at 5:00 PM Eastern", true);
    expect(html).not.toContain("Free right now");
    expect(html).toMatch(/Free <small class="muted"><s>/);
  });

  it("games opened only by free access (merged into entitlements) still show Free with the price struck", () => {
    const html = renderToStaticMarkup(
      <StoreView
        catalog={CATALOG_SNAPSHOT}
        live
        entitlements={{ "corporate-warfare": "owned", "ahd-singleplayer": "owned", "ahd-client": "owned" }}
        freeIds={new Set(["ahd", "corporate-warfare"])}
        freeText="Free until Sunday, November 22 at 5:00 PM Eastern"
        freeWeek="Free until Sunday, November 22 at 5:00 PM Eastern"
        products={products}
        signedIn
        onBuy={noop}
        onSignIn={noop}
        onOpenUrl={noop}
        onOpenGame={noop}
        onRefresh={noop}
      />,
    );
    expect(html).toContain("<s>$14.99</s>");
    expect(html).not.toContain(">Owned<");
  });

  it("Margin of Victory packs show Free with the price struck, no Buy or Choose", () => {
    const mov = CATALOG.filter((product) => product.id === "electioneer");
    const html = renderToStaticMarkup(
      <StoreView
        catalog={CATALOG_SNAPSHOT}
        live
        entitlements={{}}
        freeIds={new Set(["electioneer"])}
        freeText="Free until Sunday, November 22 at 5:00 PM Eastern"
        freeWeek="Free until Sunday, November 22 at 5:00 PM Eastern"
        products={mov}
        signedIn
        onBuy={noop}
        onSignIn={noop}
        onOpenUrl={noop}
        onOpenGame={noop}
        onRefresh={noop}
      />,
    );
    expect(html).toContain("Complete Collection");
    expect(html).toMatch(/Free <small class="muted"><s>/);
    expect(html).not.toMatch(buyButton);
    expect(html).not.toContain(">Choose<");
  });

  it("Margin of Victory packs ask a signed-out player to sign in", () => {
    const mov = CATALOG.filter((product) => product.id === "electioneer");
    const html = renderToStaticMarkup(
      <StoreView catalog={CATALOG_SNAPSHOT} live entitlements={{}} freeWeek="Free for now" products={mov} signedIn={false}
        onBuy={noop} onSignIn={noop} onOpenUrl={noop} onOpenGame={noop} onRefresh={noop} />,
    );
    expect(html).toContain("Sign in to play free");
    expect(html).not.toMatch(buyButton);
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
    const html = render("Free until Sunday, November 22 at 5:00 PM Eastern", false);
    expect(html).not.toMatch(buyButton);
    expect(html).not.toContain(">Choose<");
    expect(html).toContain("Sign in to play free");
    expect(html).toContain("<s>$14.99</s>");
    expect(html).toContain("with a free Lakeside account");
    expect(html).not.toContain("Buy once");
    expect(html).not.toMatch(/[–—]/);
  });

  it("signed in: no Buy buttons or sign-in prompts", () => {
    const html = render("Free until Sunday, November 22 at 5:00 PM Eastern", true);
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
