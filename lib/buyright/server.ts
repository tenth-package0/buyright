import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { HttpError } from "./errors";
export { HttpError } from "./errors";
export async function owner(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Cross-origin writes are not allowed.");
  const user = await getChatGPTUser();
  if (!user)
    throw new HttpError(
      401,
      "Sign in before using AI or creating a sandbox purchase.",
    );
  return user.userId;
}
export function db() {
  if (!env.DB) throw new HttpError(503, "Order storage is not configured.");
  return env.DB;
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === "ZodError")
    return Response.json(
      { error: "Invalid input. Check all fields and try again." },
      { status: 400 },
    );
  console.error(
    "BuyRight request failed",
    error instanceof Error ? error.name : "Unknown",
  );
  return Response.json(
    {
      error:
        "The request could not be completed. Your purchase is not marked paid. Retry or check the order status.",
    },
    { status: 502 },
  );
}
export async function body(request: Request, max = 100000) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
export function paypalConfigured() {
  return Boolean(
    env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_MERCHANT_ID,
  );
}
