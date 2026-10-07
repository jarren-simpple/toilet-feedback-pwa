import { describe, expect, it } from "vitest";
import { nextScreenAfterRating } from "./features/feedback/model/flow";

describe("nextScreenAfterRating", () => {
  it("sends Excellent and Good straight to thank you (Tier 3)", () => {
    expect(nextScreenAfterRating("excellent")).toBe("tier3");
    expect(nextScreenAfterRating("good")).toBe("tier3");
  });

  it("sends Neutral and Poor to feedback icons (Tier 2)", () => {
    expect(nextScreenAfterRating("neutral")).toBe("tier2");
    expect(nextScreenAfterRating("poor")).toBe("tier2");
  });
});
