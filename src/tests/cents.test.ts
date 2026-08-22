import { describe, expect, it } from "vitest";

import {
  formatCentsToDisplay,
  parseInputAsCents,
} from "@/app/tracker/lib/cents";

describe("parseInputAsCents", () => {
  it("keeps only the digits of a formatted amount", () => {
    expect(parseInputAsCents("$1,200.00")).toBe("120000");
    expect(parseInputAsCents("abc")).toBe("");
  });

  it("drops leading zeros so padding cannot eat the digit cap", () => {
    expect(parseInputAsCents("$0.09")).toBe("9");
  });

  it("empties the field on the last backspace", () => {
    expect(parseInputAsCents("$0.0")).toBe("");
    expect(parseInputAsCents("")).toBe("");
  });

  it("refuses keystrokes past the last cent a double holds exactly", () => {
    expect(parseInputAsCents("9".repeat(20))).toBe("9".repeat(15));
  });
});

describe("formatCentsToDisplay", () => {
  it("renders cents as the same currency string as a balance", () => {
    expect(formatCentsToDisplay(120000)).toBe("$1,200.00");
    expect(formatCentsToDisplay("1")).toBe("$0.01");
  });

  it("renders an empty or unparseable value as an empty field", () => {
    expect(formatCentsToDisplay("")).toBe("");
    expect(formatCentsToDisplay("   ")).toBe("");
    expect(formatCentsToDisplay("abc")).toBe("");
  });

  it("shows no sign, since the field itself has no direction", () => {
    expect(formatCentsToDisplay(-120000)).toBe("$1,200.00");
  });
});
