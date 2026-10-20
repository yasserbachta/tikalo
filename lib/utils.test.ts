import { describe, it, expect } from "vitest";

import { cn } from "@/lib/utils";

// `cn` merges class lists with tailwind-merge semantics — later utility classes
// win over earlier conflicting ones, and falsy entries are dropped.

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, null, undefined, "py-1")).toBe("px-2 py-1");
  });

  it("lets a later conflicting tailwind class override an earlier one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });
});
