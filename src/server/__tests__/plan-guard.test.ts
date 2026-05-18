/**
 * Tests for plan-guard.ts — confirms the internal platform has no restrictions.
 */

import { requireTrafficAccess, assertCompanyLimit } from "../lib/plan-guard";

describe("requireTrafficAccess", () => {
  it("resolves without throwing for any userId", async () => {
    await expect(requireTrafficAccess("any-user-id")).resolves.toBeUndefined();
  });
});

describe("assertCompanyLimit", () => {
  it("resolves without throwing regardless of count", async () => {
    await expect(assertCompanyLimit("any-user", 0)).resolves.toBeUndefined();
    await expect(assertCompanyLimit("any-user", 100)).resolves.toBeUndefined();
    await expect(assertCompanyLimit("any-user", 999)).resolves.toBeUndefined();
  });
});
