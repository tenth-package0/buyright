import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { paypalConfigured } from "@/lib/buyright/server";
export async function GET() {
  const user = await getChatGPTUser();
  return Response.json(
    {
      paypal: paypalConfigured(),
      paypalClientId: paypalConfigured() ? env.PAYPAL_CLIENT_ID : null,
      ai: Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL),
      model: env.ANTHROPIC_MODEL ?? null,
      studioLicense: env.AG_STUDIO_LICENSE_KEY ?? null,
      signedIn: Boolean(user),
      displayName: user?.displayName ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
