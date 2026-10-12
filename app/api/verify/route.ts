import { requestSchema, evaluate, recommend } from "@/lib/buyright/engine";
import { body, errorResponse } from "@/lib/buyright/server";
export async function POST(request: Request) {
  try {
    const b = await body(request);
    const parsed = requestSchema.parse(b.request);
    const selected = b.recommend ? recommend(parsed) : parsed;
    return Response.json({ request: selected, result: evaluate(selected) });
  } catch (e) {
    return errorResponse(e);
  }
}
