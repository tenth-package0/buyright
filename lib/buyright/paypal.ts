import { env } from "cloudflare:workers";
import { HttpError, paypalConfigured } from "./server";
import { type Snapshot } from "./engine";
const BASE = "https://api-m.sandbox.paypal.com";
export async function paypal(
  path: string,
  method = "GET",
  payload?: unknown,
  requestId?: string,
) {
  if (!paypalConfigured())
    throw new HttpError(
      503,
      "PayPal sandbox is not connected. Configure the sandbox client ID, secret and merchant ID.",
    );
  const auth = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  if (!auth.ok)
    throw new HttpError(
      502,
      "PayPal sandbox authentication failed. Check the configured sandbox credentials.",
    );
  const token = (await auth.json()) as { access_token: string };
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 204) return {};
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    throw new HttpError(
      502,
      `PayPal sandbox could not complete this step (${String(result.name ?? response.status)}). The transaction may require reconciliation; retry with the same order.`,
    );
  return result;
}
export function orderPayload(s: Snapshot, id: string) {
  return {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: "default",
        custom_id: id,
        payee: { merchant_id: env.PAYPAL_MERCHANT_ID },
        amount: {
          currency_code: "USD",
          value: (s.totalCents / 100).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: (s.subtotalCents / 100).toFixed(2),
            },
            tax_total: {
              currency_code: "USD",
              value: (s.taxCents / 100).toFixed(2),
            },
          },
        },
        items: s.items.map((x) => ({
          name: x.employeeId,
          sku: x.sku,
          quantity: "1",
          category: "PHYSICAL_GOODS",
          unit_amount: {
            currency_code: "USD",
            value: (x.unitCents / 100).toFixed(2),
          },
        })),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          brand_name: "BuyRight Sandbox",
        },
      },
    },
  };
}
