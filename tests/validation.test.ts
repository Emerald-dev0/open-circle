import { describe, expect, it } from "vitest";
import { parseWhatsappNumber } from "../shared/validation";

describe("WhatsApp number country codes", () => {
  it.each([
    "0803 123 4567",
    "8031234567",
    "2348031234567",
    "002348031234567",
    "447700900123",
    "+2",
    "+0123456789",
    "+1234567890123456",
    "+234803123456x",
  ])("requires an explicit + country code and a valid number: %s", (input) => {
    expect(parseWhatsappNumber(input)).toEqual({
      ok: false,
      error: "Use your WhatsApp number with its country code, like +234 803 123 4567.",
    });
  });

  it.each([
    ["+234 803 123 4567", "+2348031234567"],
    ["  +234 (803) 123-4567  ", "+2348031234567"],
    ["+44 7700 900123", "+447700900123"],
    ["+1 (202) 555-0123", "+12025550123"],
  ])("normalizes international numbers: %s", (input, value) => {
    expect(parseWhatsappNumber(input)).toEqual({ ok: true, value });
  });

  it("asks for a number when the field is empty", () => {
    expect(parseWhatsappNumber("  ")).toEqual({ ok: false, error: "Add the WhatsApp number you use in the group." });
  });

  it("keeps Nigerian mobile validation and shows an international example", () => {
    expect(parseWhatsappNumber("+234 123 456 7890")).toEqual({
      ok: false,
      error: "That doesn't look like a Nigerian mobile number. Try +234 803 123 4567.",
    });
  });
});
