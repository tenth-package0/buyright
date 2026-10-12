import { HttpError } from "./errors";
import { parseMoney, type Snapshot } from "./engine";
export function validateRemoteOrder(
  remote: Record<string, any>,
  s: Snapshot,
  id: string,
  merchantId: string,
) {
  const units = remote.purchase_units;
  if (!Array.isArray(units) || units.length !== 1)
    throw new HttpError(409, "Unexpected purchase units.");
  const p = units[0];
  if (
    p.custom_id !== id ||
    p.payee?.merchant_id !== merchantId ||
    p.amount?.currency_code !== "USD" ||
    parseMoney(p.amount.value) !== s.totalCents
  )
    throw new HttpError(
      409,
      "Order amount, currency, recipient, or reference differs from the approved purchase.",
    );
  if (!Array.isArray(p.items) || p.items.length !== s.items.length)
    throw new HttpError(409, "Order items have changed.");
  const expected = s.items
    .map((x) => `${x.employeeId}:${x.sku}:1:${x.unitCents}`)
    .sort();
  const actual = p.items
    .map(
      (x: any) =>
        `${x.name}:${x.sku}:${x.quantity}:${x.unit_amount?.currency_code === "USD" ? parseMoney(x.unit_amount.value) : -1}`,
    )
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new HttpError(
      409,
      "The approved SKU, quantity, or unit price has changed.",
    );
}
export function validateCapture(
  capture: Record<string, any>,
  s: Snapshot,
  orderId: string,
  merchantId: string,
) {
  if (
    typeof capture.id !== "string" ||
    !capture.id ||
    capture.amount?.currency_code !== "USD" ||
    parseMoney(capture.amount?.value) !== s.totalCents ||
    capture.payee?.merchant_id !== merchantId ||
    capture.supplementary_data?.related_ids?.order_id !== orderId
  )
    throw new HttpError(409, "Capture does not match the approved purchase.");
  if (!["COMPLETED", "PENDING"].includes(capture.status))
    throw new HttpError(409, "Capture requires manual review.");
}
