import { z } from "zod";
import { env } from "cloudflare:workers";
import {
  validateRemoteOrder,
  validateCapture,
} from "@/lib/buyright/payment-validation";
import {
  body,
  owner,
  db,
  HttpError,
  errorResponse,
  paypalConfigured,
} from "@/lib/buyright/server";
import {
  snapshot,
  checkSnapshot,
  digest,
  requestSchema,
  type Snapshot,
} from "@/lib/buyright/engine";
import { paypal, orderPayload } from "@/lib/buyright/paypal";
type Row = {
  id: string;
  owner: string;
  snapshot: string;
  snapshot_hash: string;
  status: string;
  paypal_id: string | null;
  authorization_id: string | null;
  capture_id: string | null;
  created_at: number;
  updated_at: number;
  error: string | null;
};
const actionSchema = z.object({
  action: z.enum(["create", "capture", "status"]),
  id: z.string().uuid(),
  request: requestSchema.optional(),
});
export async function GET(request: Request) {
  try {
    const uid = await owner(request);
    const rows = await db()
      .prepare(
        "SELECT id,status,snapshot,created_at,capture_id,paypal_id FROM orders WHERE owner=? ORDER BY created_at DESC LIMIT 30",
      )
      .bind(uid)
      .all<Row>();
    return Response.json({
      orders: rows.results.map((r) => ({
        id: r.id,
        status: r.status,
        totalCents: (JSON.parse(r.snapshot) as Snapshot).totalCents,
        createdAt: r.created_at,
        captureId: r.capture_id,
        paypalId: r.paypal_id,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    const uid = await owner(request),
      input = actionSchema.parse(await body(request)),
      database = db();
    let row = await database
      .prepare("SELECT * FROM orders WHERE id=?")
      .bind(input.id)
      .first<Row>();
    if (row && row.owner !== uid) throw new HttpError(404, "Order not found.");
    if (input.action === "create") {
      if (!paypalConfigured())
        throw new HttpError(
          503,
          "Connect PayPal sandbox before creating a payment.",
        );
      if (!input.request)
        throw new HttpError(400, "A verified request is required.");
      let approved: Snapshot;
      try {
        approved = snapshot(input.request);
      } catch (e) {
        throw new HttpError(
          409,
          e instanceof Error ? e.message : "Verification failed.",
        );
      }
      const hash = await digest(approved);
      if (row && row.snapshot_hash !== hash)
        throw new HttpError(
          409,
          "This order ID belongs to a different configuration. Start a new purchase.",
        );
      if (
        row &&
        !row.paypal_id &&
        Date.now() - row.created_at > 5 * 60 * 60 * 1000
      )
        throw new HttpError(
          409,
          "This order creation attempt needs manual reconciliation. Do not retry it automatically.",
        );
      if (row?.paypal_id)
        return Response.json({
          id: row.id,
          paypalId: row.paypal_id,
          status: row.status,
        });
      if (!row) {
        const now = Date.now();
        await database
          .prepare(
            "INSERT INTO orders (id,owner,snapshot,snapshot_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            input.id,
            uid,
            JSON.stringify(approved),
            hash,
            "CREATING",
            now,
            now,
          )
          .run();
      }
      row = await database
        .prepare("SELECT * FROM orders WHERE id=?")
        .bind(input.id)
        .first<Row>();
      if (!row || row.owner !== uid || row.snapshot_hash !== hash)
        throw new HttpError(409, "Order ownership or configuration mismatch.");
      const remote = await paypal(
        "/v2/checkout/orders",
        "POST",
        orderPayload(approved, input.id),
        `c-${input.id}`,
      );
      await database
        .prepare(
          "UPDATE orders SET paypal_id=?,status=?,updated_at=? WHERE id=? AND owner=? AND status=?",
        )
        .bind(
          remote.id,
          "AWAITING_APPROVAL",
          Date.now(),
          input.id,
          uid,
          "CREATING",
        )
        .run();
      return Response.json({
        id: input.id,
        paypalId: remote.id,
        status: "AWAITING_APPROVAL",
      });
    }
    if (!row?.paypal_id) throw new HttpError(404, "Order not found.");
    // Recover an interrupted request from PayPal's authoritative capture record before retrying.
    if (
      ["PROCESSING", "PAYMENT_PENDING", "RETRY_REQUIRED"].includes(row.status)
    ) {
      const remote = await paypal(`/v2/checkout/orders/${row.paypal_id}`);
      const s = JSON.parse(row.snapshot) as Snapshot;
      validateRemoteOrder(remote, s, row.id, env.PAYPAL_MERCHANT_ID!);
      const captureId =
        row.capture_id ??
        remote.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      if (captureId) {
        const capture = await paypal(`/v2/payments/captures/${captureId}`);
        validateCapture(capture, s, row.paypal_id, env.PAYPAL_MERCHANT_ID!);
        if (capture.status === "COMPLETED") {
          await database
            .prepare(
              "UPDATE orders SET status='PAID',capture_id=?,updated_at=?,error=NULL WHERE id=?",
            )
            .bind(capture.id, Date.now(), row.id)
            .run();
          row.status = "PAID";
          row.capture_id = capture.id;
        }
      }
      if (row.status === "PROCESSING" && Date.now() - row.updated_at > 120000) {
        await database
          .prepare(
            "UPDATE orders SET status='RETRY_REQUIRED' WHERE id=? AND status='PROCESSING' AND updated_at=?",
          )
          .bind(row.id, row.updated_at)
          .run();
        row.status = "RETRY_REQUIRED";
      }
    }
    if (input.action === "status")
      return Response.json({
        id: row.id,
        status: row.status,
        captureId: row.capture_id,
        snapshot: JSON.parse(row.snapshot),
        paypalId: row.paypal_id,
      });
    if (row.status === "PAID")
      return Response.json({
        id: row.id,
        status: "PAID",
        captureId: row.capture_id,
        totalCents: JSON.parse(row.snapshot).totalCents,
      });
    if (
      !["AWAITING_APPROVAL", "RETRY_REQUIRED", "AUTHORIZED"].includes(
        row.status,
      )
    )
      throw new HttpError(
        409,
        "This order is already processing or blocked. Check its status before retrying.",
      );
    if (Date.now() - row.created_at > 5 * 60 * 60 * 1000)
      throw new HttpError(
        409,
        "This purchase is outside the automatic retry window. Review its PayPal sandbox record before creating another purchase.",
      );
    const lock = await database
      .prepare(
        "UPDATE orders SET status='PROCESSING',updated_at=? WHERE id=? AND owner=? AND status=?",
      )
      .bind(Date.now(), row.id, uid, row.status)
      .run();
    if (lock.meta.changes !== 1)
      throw new HttpError(409, "Another request is processing this purchase.");
    const approved = JSON.parse(row.snapshot) as Snapshot;
    let authorizationId: string | undefined = row.authorization_id ?? undefined;
    try {
      checkSnapshot(approved);
      let remote = await paypal(`/v2/checkout/orders/${row.paypal_id}`);
      validateRemoteOrder(remote, approved, row.id, env.PAYPAL_MERCHANT_ID!);
      if (!["APPROVED", "COMPLETED"].includes(remote.status))
        throw new HttpError(
          409,
          "Buyer approval is required before authorization.",
        );
      authorizationId =
        authorizationId ??
        remote.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
      if (!authorizationId) {
        remote = await paypal(
          `/v2/checkout/orders/${row.paypal_id}/authorize`,
          "POST",
          {},
          `a-${row.id}`,
        );
        authorizationId =
          remote.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
      }
      if (!authorizationId)
        throw new HttpError(502, "PayPal did not return an authorization.");
      await database
        .prepare("UPDATE orders SET authorization_id=?,updated_at=? WHERE id=?")
        .bind(authorizationId, Date.now(), row.id)
        .run();
      checkSnapshot(approved);
      const captured = await paypal(
        `/v2/payments/authorizations/${authorizationId}/capture`,
        "POST",
        {
          amount: {
            currency_code: "USD",
            value: (approved.totalCents / 100).toFixed(2),
          },
          final_capture: true,
        },
        `p-${row.id}`,
      );
      if (typeof captured.id !== "string")
        throw new HttpError(502, "PayPal did not return a capture reference.");
      await database
        .prepare("UPDATE orders SET capture_id=? WHERE id=?")
        .bind(captured.id, row.id)
        .run();
      const capture = await paypal(`/v2/payments/captures/${captured.id}`);
      validateCapture(
        capture,
        approved,
        row.paypal_id,
        env.PAYPAL_MERCHANT_ID!,
      );
      const status =
        capture.status === "COMPLETED" ? "PAID" : "PAYMENT_PENDING";
      await database
        .prepare(
          "UPDATE orders SET status=?,capture_id=?,updated_at=?,error=NULL WHERE id=? AND status<>'PAID'",
        )
        .bind(status, capture.id, Date.now(), row.id)
        .run();
      return Response.json({
        id: row.id,
        status,
        captureId: capture.id,
        totalCents: approved.totalCents,
      });
    } catch (e) {
      const blocked =
        (e instanceof HttpError && e.status === 409) ||
        (e instanceof Error &&
          e.message.startsWith("The approved configuration"));
      if (blocked && authorizationId) {
        try {
          const authorization = await paypal(
            `/v2/payments/authorizations/${authorizationId}`,
          );
          if (authorization.status === "CREATED") {
            await paypal(
              `/v2/payments/authorizations/${authorizationId}/void`,
              "POST",
              {},
              `v-${row.id}`,
            );
          }
        } catch {
          await database
            .prepare(
              "UPDATE orders SET status='VOID_REVIEW_REQUIRED',updated_at=? WHERE id=? AND status='PROCESSING'",
            )
            .bind(Date.now(), row.id)
            .run();
        }
      }
      // Never presume a timeout means the payment failed. Retry uses the same PayPal request IDs.
      await database
        .prepare(
          "UPDATE orders SET status=?,updated_at=?,error=? WHERE id=? AND status=?",
        )
        .bind(
          blocked ? "REVIEW_REQUIRED" : "RETRY_REQUIRED",
          Date.now(),
          blocked
            ? "Approval or configuration needs review."
            : "Remote operation outcome requires reconciliation.",
          row.id,
          "PROCESSING",
        )
        .run();
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
