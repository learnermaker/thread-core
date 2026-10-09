import { describe, test, expect } from "vitest";
import { z } from "zod";
import { Seed } from "../../src/engine/seed.ts";
import { Person, Thread } from "../../src/model/schemas.ts";
import { loadSeed } from "../helpers.ts";

const rawSeed = () => loadSeed();

describe("contract schemas", () => {
  test("the Seed parses", () => {
    expect(() => rawSeed()).not.toThrow();
  });

  test("an unknown field is rejected with the issue path", () => {
    const bad = { ...samplePerson(), extra: true };
    const r = Person.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.code).toBe("unrecognized_keys");
  });

  test("a bad id ('Maya') is rejected naming the path", () => {
    const bad = { ...samplePerson(), id: "Maya" };
    const r = Person.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["id"]);
  });

  test("a bad instant ('tomorrow') is rejected naming the path", () => {
    const seed = JSON.parse(JSON.stringify(loadSeed()));
    seed.threads[0].input.deadline = "tomorrow";
    const r = Seed.safeParse(seed);
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.includes("deadline"))).toBe(true);
  });

  test("z.toJSONSchema(Thread) has additionalProperties: false", () => {
    const schema = z.toJSONSchema(Thread) as { additionalProperties?: boolean };
    expect(schema.additionalProperties).toBe(false);
  });
});

function samplePerson() {
  return { id: "maya", name: "Maya", adult: true, has_account: true, can_drive: true, guardian_of: ["leo"] };
}
