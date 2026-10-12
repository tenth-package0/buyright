declare namespace Cloudflare {
 interface Env {
  DB?:D1Database; BUCKET?:R2Bucket;
  PAYPAL_CLIENT_ID?:string; PAYPAL_CLIENT_SECRET?:string; PAYPAL_MERCHANT_ID?:string; PAYPAL_WEBHOOK_ID?:string;
  ANTHROPIC_API_KEY?:string; ANTHROPIC_MODEL?:string; AG_STUDIO_LICENSE_KEY?:string;
 }
}
