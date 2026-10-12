import assert from "node:assert/strict";
import { sampleFleet } from "../lib/buyright/catalog";
import { defaultPolicy } from "../lib/buyright/engine";
const base = process.env.BUYRIGHT_TEST_URL ?? "http://127.0.0.1:5173";
async function post(
  path: string,
  value: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}
const response = await post("/api/verify", {
  request: { fleet: sampleFleet, policy: defaultPolicy },
  recommend: true,
});
assert.equal(response.status, 200);
const result = (await response.json()) as {
  result: { passed: number; ready: boolean };
  request: { policy: unknown };
};
assert.equal(result.result.passed, 4);
assert.equal(result.result.ready, false);
assert.deepEqual(result.request.policy, defaultPolicy);
assert.equal(
  (await post("/api/verify", { request: { fleet: [], policy: defaultPolicy } }))
    .status,
  400,
);
assert.equal(
  (await post("/api/orders", { action: "capture", id: crypto.randomUUID() }))
    .status,
  401,
);
assert.equal(
  (
    await post(
      "/api/orders",
      { action: "capture", id: crypto.randomUUID() },
      { origin: "https://other-origin.invalid" },
    )
  ).status,
  403,
);
assert.equal(
  (await post("/api/ai", { text: "A supported fictional request" })).status,
  401,
);
assert.equal((await post("/api/studio", {})).status, 401);
console.log(
  "HTTP smoke checks passed: recommendation, malformed input, authentication and cross-origin protection. No provider calls were made.",
);
