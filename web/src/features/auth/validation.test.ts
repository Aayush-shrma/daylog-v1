import { describe, expect, it } from "vitest";

import {
  FIRST_NAME_MAX,
  PASSWORD_MIN,
  validateConfirmPassword,
  validateEmail,
  validateFirstName,
  validatePassword,
} from "./validation";

describe("validateFirstName", () => {
  it("requires a value and trims whitespace", () => {
    expect(validateFirstName("")).toBeTruthy();
    expect(validateFirstName("   ")).toBeTruthy();
    expect(validateFirstName("  Ada  ")).toBeUndefined();
  });

  it("caps the length", () => {
    expect(validateFirstName("a".repeat(FIRST_NAME_MAX))).toBeUndefined();
    expect(validateFirstName("a".repeat(FIRST_NAME_MAX + 1))).toBeTruthy();
  });
});

describe("validateEmail", () => {
  it("rejects empty and malformed addresses", () => {
    expect(validateEmail("")).toBeTruthy();
    expect(validateEmail("nope")).toBeTruthy();
    expect(validateEmail("a@b")).toBeTruthy();
  });

  it("accepts a normal address", () => {
    expect(validateEmail("  user@example.com ")).toBeUndefined();
  });
});

describe("validatePassword", () => {
  it("enforces the minimum length", () => {
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("a".repeat(PASSWORD_MIN))).toBeUndefined();
  });

  it("can be optional (login context)", () => {
    expect(validatePassword("", { required: false })).toBeUndefined();
    expect(validatePassword("", { required: true })).toBeTruthy();
  });
});

describe("validateConfirmPassword", () => {
  it("requires a match", () => {
    expect(validateConfirmPassword("secret-123", "")).toBeTruthy();
    expect(validateConfirmPassword("secret-123", "secret-124")).toBeTruthy();
    expect(validateConfirmPassword("secret-123", "secret-123")).toBeUndefined();
  });
});
