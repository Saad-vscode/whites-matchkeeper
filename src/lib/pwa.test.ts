import { describe, expect, it } from "vitest";
import { refuseOfflineWorker } from "./pwa";

describe("offline worker safety", () => {
  for (const host of ["id-preview--test.lovable.app", "preview-v2--test.gpt-eng.com", "project--test-dev.lovable.app", "beta.lovable.dev", "app.lovableproject.com"]) {
    it(`refuses preview host ${host}`, () => expect(refuseOfflineWorker(host, true, false, false)).toBe(true));
  }
  it("allows a published custom domain", () => expect(refuseOfflineWorker("preview-v2--shop.example.com", true, false, false)).toBe(false));
  it("refuses development", () => expect(refuseOfflineWorker("shop.example.com", false, false, false)).toBe(true));
  it("refuses embedded previews", () => expect(refuseOfflineWorker("shop.example.com", true, true, false)).toBe(true));
  it("honors the kill switch", () => expect(refuseOfflineWorker("shop.example.com", true, false, true)).toBe(true));
});