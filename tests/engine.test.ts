import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPolicy,
  evaluate,
  recommend,
  snapshot,
  checkSnapshot,
  parseMoney,
  requestSchema,
} from "../lib/buyright/engine";
import { sampleFleet } from "../lib/buyright/catalog";
import { parseRoster } from "../lib/buyright/csv";
const initial = () =>
  structuredClone({ policy: defaultPolicy, fleet: sampleFleet });
test("cheap dock fails dual 4K60 for the entire sample team", () => {
  const r = evaluate(initial());
  assert.equal(r.blocked, 6);
  assert.equal(r.ready, false);
});
test("recommendations never relax policy and preserve the impossible M2 constraint", () => {
  const input = initial(),
    next = recommend(input);
  assert.deepEqual(next.policy, input.policy);
  assert.deepEqual(input, initial());
  assert.equal(evaluate(next).passed, 4);
  assert.equal(evaluate(next).blocked, 2);
  assert.throws(() => snapshot(next));
});
test("explicit driver permission makes the six-person purchase feasible", () => {
  const input = initial();
  input.policy.allowDrivers = true;
  const r = evaluate(recommend(input));
  assert.equal(r.passed, 6);
  assert.equal(r.totalCents, 129549);
  assert.equal(r.ready, true);
});
test("unknown host or dock is unresolved, never checkout eligible", () => {
  for (const field of ["profile", "productId"] as const) {
    const input = initial();
    input.policy.allowDrivers = true;
    if (field === "profile") input.fleet[0].profile = "unknown";
    else input.fleet[0].productId = "unverified-dock";
    assert.equal(evaluate(input).rows[0].status, "unknown");
    assert.equal(evaluate(input).ready, false);
  }
});
test("budget includes tax and remains binding after recommendation", () => {
  const input = initial();
  input.policy.allowDrivers = true;
  input.policy.budgetCents = 120000;
  const r = evaluate(recommend(input));
  assert.equal(r.passed, 6);
  assert.equal(r.budgetOk, false);
  assert.equal(r.ready, false);
});
test("snapshot rejects altered price, total, SKU, policy or catalog version", () => {
  const input = initial();
  input.policy.allowDrivers = true;
  const good = snapshot(recommend(input));
  assert.deepEqual(checkSnapshot(good), good);
  for (const mutate of [
    (s: typeof good) => s.totalCents++,
    (s: typeof good) => s.items[0].unitCents--,
    (s: typeof good) => (s.items[0].sku = "anker-575"),
    (s: typeof good) => (s.catalogVersion = "old"),
    (s: typeof good) => (s.request.policy.allowDrivers = false),
  ]) {
    const altered = structuredClone(good);
    mutate(altered);
    assert.throws(() => checkSnapshot(altered));
  }
});
test("money parser rejects partial, scientific, negative and unsafe amounts", () => {
  assert.equal(parseMoney("1295.49"), 129549);
  for (const x of ["1", "1.001", "1e3", "-1.00", "NaN", "9007199254740992.00"])
    assert.throws(() => parseMoney(x));
});
test("schema rejects client supplied total and duplicate identities", () => {
  assert.equal(
    requestSchema.safeParse({ ...initial(), totalCents: 1 }).success,
    false,
  );
  const input = initial();
  input.fleet[1].id = input.fleet[0].id;
  assert.equal(requestSchema.safeParse(input).success, false);
});
test("CSV supports quoted names, CRLF and fails on unsupported host", () => {
  const rows = parseRoster('name,team,profile\r\n"Lee, Sam",Ops,mac-m2\r\n');
  assert.equal(rows[0].name, "Lee, Sam");
  assert.throws(() => parseRoster("name,team,profile\nSam,Ops,generic-laptop"));
  assert.throws(() => parseRoster('name,team,profile\n"Sam,Ops,mac-m2'));
});
