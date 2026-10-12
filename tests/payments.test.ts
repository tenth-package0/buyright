import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot, recommend, defaultPolicy } from "../lib/buyright/engine";
import { sampleFleet } from "../lib/buyright/catalog";
import {
  validateRemoteOrder,
  validateCapture,
} from "../lib/buyright/payment-validation";
const s = snapshot(
  recommend({
    policy: { ...defaultPolicy, allowDrivers: true },
    fleet: sampleFleet,
  }),
);
const remote = () => ({
  purchase_units: [
    {
      custom_id: "local-1",
      payee: { merchant_id: "merchant-1" },
      amount: { currency_code: "USD", value: (s.totalCents / 100).toFixed(2) },
      items: s.items.map((x) => ({
        name: x.employeeId,
        sku: x.sku,
        quantity: "1",
        unit_amount: {
          currency_code: "USD",
          value: (x.unitCents / 100).toFixed(2),
        },
      })),
    },
  ],
});
test("PayPal order must match recipient, currency, amount and every line", () => {
  validateRemoteOrder(remote(), s, "local-1", "merchant-1");
  for (const mutate of [
    (r: ReturnType<typeof remote>) =>
      (r.purchase_units[0].payee.merchant_id = "attacker"),
    (r: ReturnType<typeof remote>) =>
      (r.purchase_units[0].amount.value = "0.01"),
    (r: ReturnType<typeof remote>) =>
      (r.purchase_units[0].amount.currency_code = "EUR"),
    (r: ReturnType<typeof remote>) => (r.purchase_units[0].custom_id = "other"),
    (r: ReturnType<typeof remote>) =>
      (r.purchase_units[0].items[0].sku = "anker-575"),
    (r: ReturnType<typeof remote>) =>
      (r.purchase_units[0].items[0].quantity = "2"),
  ]) {
    const r = remote();
    mutate(r);
    assert.throws(() => validateRemoteOrder(r, s, "local-1", "merchant-1"));
  }
});
test("capture must match original PayPal order and approved value", () => {
  const capture = {
    id: "capture-1",
    status: "COMPLETED",
    amount: { currency_code: "USD", value: (s.totalCents / 100).toFixed(2) },
    payee: { merchant_id: "merchant-1" },
    supplementary_data: { related_ids: { order_id: "paypal-1" } },
  };
  validateCapture(capture, s, "paypal-1", "merchant-1");
  assert.throws(() => validateCapture(capture, s, "other", "merchant-1"));
  assert.throws(() =>
    validateCapture(
      { ...capture, status: "DECLINED" },
      s,
      "paypal-1",
      "merchant-1",
    ),
  );
  assert.throws(() =>
    validateCapture(
      { ...capture, amount: { currency_code: "USD", value: "1.00" } },
      s,
      "paypal-1",
      "merchant-1",
    ),
  );
});
