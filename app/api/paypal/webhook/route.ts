import { env } from "cloudflare:workers";
import { body, db, HttpError, errorResponse } from "@/lib/buyright/server";
import { paypal } from "@/lib/buyright/paypal";
import { parseMoney, type Snapshot } from "@/lib/buyright/engine";
export async function POST(request: Request) {
  try {
    if (!env.PAYPAL_WEBHOOK_ID)
      throw new HttpError(503, "Webhook verification is not configured.");
    const event = await body(request);
    const verification = await paypal(
      "/v1/notifications/verify-webhook-signature",
      "POST",
      {
        auth_algo: request.headers.get("paypal-auth-algo"),
        cert_url: request.headers.get("paypal-cert-url"),
        transmission_id: request.headers.get("paypal-transmission-id"),
        transmission_sig: request.headers.get("paypal-transmission-sig"),
        transmission_time: request.headers.get("paypal-transmission-time"),
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      },
    );
    if (verification.verification_status !== "SUCCESS")
      throw new HttpError(400, "Invalid webhook signature.");
    if (typeof event.id !== "string" || typeof event.event_type !== "string")
      throw new HttpError(400, "Invalid event.");
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const remoteOrderId =
        event.resource?.supplementary_data?.related_ids?.order_id;
      if (typeof remoteOrderId === "string") {
        const row = await db()
          .prepare("SELECT id,snapshot,paypal_id FROM orders WHERE paypal_id=?")
          .bind(remoteOrderId)
          .first<{ id: string; snapshot: string; paypal_id: string }>();
        if (row) {
          const s = JSON.parse(row.snapshot) as Snapshot;
          const capture = await paypal(
            `/v2/payments/captures/${event.resource.id}`,
          );
          if (
            capture.status !== "COMPLETED" ||
            capture.amount?.currency_code !== "USD" ||
            parseMoney(capture.amount.value) !== s.totalCents ||
            capture.payee?.merchant_id !== env.PAYPAL_MERCHANT_ID ||
            capture.supplementary_data?.related_ids?.order_id !== row.paypal_id
          )
            throw new HttpError(
              409,
              "Capture does not match the approved purchase.",
            );
          await db().batch([
            db()
              .prepare(
                "UPDATE orders SET status='PAID',capture_id=?,updated_at=?,error=NULL WHERE id=?",
              )
              .bind(capture.id, Date.now(), row.id),
            db()
              .prepare(
                "INSERT INTO webhook_events (id,type,received_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
              )
              .bind(event.id, event.event_type, Date.now()),
          ]);
        }
      }
    }
    return Response.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
