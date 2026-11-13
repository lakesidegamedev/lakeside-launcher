import { describe, expect, it } from "vitest";
import { buildSignInUrl } from "./signin";

describe("buildSignInUrl", () => {
  it("targets the account launcher start page with provider, port and state", () => {
    const url = new URL(buildSignInUrl("ahd", 47832, "abc123"));
    expect(url.origin + url.pathname).toBe("https://lakesidegames.net/account/launcher/start");
    expect(url.searchParams.get("provider")).toBe("ahd");
    expect(url.searchParams.get("port")).toBe("47832");
    expect(url.searchParams.get("state")).toBe("abc123");
  });

  it("supports discord", () => {
    expect(buildSignInUrl("discord", 47833, "s")).toContain("provider=discord");
  });
});
