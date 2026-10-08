import { describe, expect, test } from "vitest";
import { operations, systemOperations, jsonSchemas, errorCodes } from "../../src/schemas/index.ts";
import { ErrorBody } from "../../src/model/errors.ts";
import { playStory } from "../golden/story.test.ts";

const OP_NAMES = ["createThread", "listThreads", "getThread", "reportChange", "requestHandoff", "respondToHandoff", "recordEvidence", "confirmAction"];

describe("schema agreement (core-app-api task 4.1)", () => {
  test("operations are exactly the 8 user operations", () => {
    expect(Object.keys(operations).sort()).toEqual([...OP_NAMES].sort());
  });

  test("every input JSON Schema forbids additional properties (all 11)", () => {
    const all = { ...operations, ...systemOperations };
    expect(Object.keys(all)).toHaveLength(11);
    for (const name of Object.keys(all)) {
      expect(jsonSchemas[name as keyof typeof jsonSchemas].input.additionalProperties).toBe(false);
    }
  });

  test("errorCodes has 11 entries", () => {
    expect(errorCodes).toHaveLength(11);
  });

  test("every ok step's output validates against its output schema and its input against the input schema", async () => {
    const { results } = await playStory();
    const all = { ...operations, ...systemOperations } as Record<string, { input: { safeParse: (v: unknown) => { success: boolean } }; output: { safeParse: (v: unknown) => { success: boolean } } }>;
    for (const r of results) {
      const schema = all[r.op];
      expect(schema, `schema for ${r.op}`).toBeDefined();
      expect(schema!.input.safeParse(r.input).success, `input of ${r.id}`).toBe(true);
      const res = r.result as { ok: boolean; data?: unknown };
      if (res.ok) expect(schema!.output.safeParse(res.data).success, `output of ${r.id}`).toBe(true);
    }
  });

  test("every error returned in the golden story validates against ErrorBody", async () => {
    const { results } = await playStory();
    const errors = results.map((r) => r.result as { ok: boolean; error?: unknown }).filter((r) => !r.ok);
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) expect(ErrorBody.safeParse(e.error).success).toBe(true);
  });
});
