import { describe, expect, test } from "vitest";

describe("package surface (core-app-api task 5.3)", () => {
  test("src/index.ts exports the documented public API", async () => {
    const mod = await import("../src/index.ts");
    for (const name of [
      "createThreadApp", "memoryStore", "operations", "jsonSchemas", "errorCodes",
      "householdTypes", "Thread", "rankCandidates", "buildReceipt", "deriveStatus",
    ]) {
      expect(mod[name as keyof typeof mod], `export ${name}`).toBeDefined();
    }
  });
});
