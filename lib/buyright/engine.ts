import { z } from "zod";
import {
  products,
  productById,
  profiles,
  CATALOG_VERSION,
  type SourceId,
} from "./catalog";
export const policySchema = z
  .object({
    budgetCents: z.number().int().min(100).max(10000000),
    displays: z.number().int().min(1).max(2),
    resolution: z.literal("4K"),
    refreshHz: z.union([z.literal(30), z.literal(60)]),
    minPowerWatts: z.number().int().min(0).max(140),
    allowDrivers: z.boolean(),
  })
  .strict();
export const employeeSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    team: z.string().max(80),
    profile: z.enum(["mac-m2", "mac-m2-pro", "windows-tb4", "unknown"]),
    productId: z.enum([
      "anker-575",
      "plugable-tbt4",
      "plugable-6950",
      "unverified-dock",
    ]),
  })
  .strict();
export const requestSchema = z
  .object({
    policy: policySchema,
    fleet: z.array(employeeSchema).min(1).max(50),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.fleet.map((e) => e.id)).size !== v.fleet.length)
      c.addIssue({ code: "custom", message: "Employee IDs must be unique" });
  });
export type Policy = z.infer<typeof policySchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type PurchaseRequest = z.infer<typeof requestSchema>;
export type Check = {
  key: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
  source?: SourceId;
};
export const defaultPolicy: Policy = {
  budgetCents: 180000,
  displays: 2,
  resolution: "4K",
  refreshHz: 60,
  minPowerWatts: 65,
  allowDrivers: false,
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function evaluateEmployee(e: Employee, p: Policy) {
  const dock = productById(e.productId),
    host = profiles[e.profile];
  const checks: Check[] = [];
  if (e.profile === "unknown" || dock.technology === "unknown")
    checks.push({
      key: "display",
      label: "Display configuration",
      status: "unknown",
      reason: "Exact host and dock specifications are required.",
    });
  else if (dock.technology === "mst" && p.displays === 2 && p.refreshHz === 60)
    checks.push({
      key: "display",
      label: "Display configuration",
      status: "fail",
      reason:
        "This dock specifies dual 4K at 30Hz; your request requires 60Hz.",
      source: "anker",
    });
  else if (
    dock.technology === "mst" &&
    e.profile.startsWith("mac") &&
    p.displays === 2
  )
    checks.push({
      key: "display",
      label: "Display configuration",
      status: "unknown",
      reason:
        "The selected evidence does not establish two independent desktops on macOS. Do not infer this from the number of ports.",
      source: "anker",
    });
  else if (
    dock.technology !== "displaylink" &&
    p.displays > (host.nativeDisplays ?? 0)
  )
    checks.push({
      key: "display",
      label: "Display configuration",
      status: "fail",
      reason:
        "This M2 Air supports one native external display. This setup cannot provide two independent displays.",
      source: "apple",
    });
  else
    checks.push({
      key: "display",
      label: "Display configuration",
      status: "pass",
      reason:
        dock.technology === "thunderbolt"
          ? "Supported within this host profile. Use the manufacturer’s documented display port groups."
          : dock.technology === "displaylink"
            ? "DisplayLink supplies the requested displays when its required software is installed."
            : "The requested single display is within the documented capability.",
      source: dock.source ?? undefined,
    });
  if (
    e.profile === "mac-m2" &&
    p.displays === 2 &&
    ["mst", "thunderbolt"].includes(dock.technology) &&
    !checks.some((c) => c.source === "apple")
  ) {
    checks.push({
      key: "host-displays",
      label: "Host display limit",
      status: "fail",
      reason:
        "Even with a faster native dock, this M2 Air supports only one external display. A second independent display requires a different solution.",
      source: "apple",
    });
  }
  checks.push({
    key: "drivers",
    label: "Software policy",
    status:
      dock.technology === "unknown"
        ? "unknown"
        : dock.technology === "displaylink" && !p.allowDrivers
          ? "fail"
          : "pass",
    reason:
      dock.technology === "unknown"
        ? "Software requirements are undocumented."
        : dock.technology === "displaylink"
          ? p.allowDrivers
            ? "Display software is explicitly allowed. On macOS, install DisplayLink Manager and grant its required permission."
            : "DisplayLink needs additional software; your policy currently prohibits it."
          : "No DisplayLink display driver is needed for this configuration.",
    source:
      dock.technology === "displaylink"
        ? "displaylink"
        : (dock.source ?? undefined),
  });
  checks.push({
    key: "power",
    label: "Host charging",
    status:
      dock.powerWatts === null
        ? "unknown"
        : dock.powerWatts < p.minPowerWatts
          ? "fail"
          : "pass",
    reason:
      dock.powerWatts === null
        ? "Host power delivery is not documented."
        : `${dock.powerWatts}W host charging; your minimum is ${p.minPowerWatts}W.`,
    source: dock.source ?? undefined,
  });
  const status: Check["status"] = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "unknown")
      ? "unknown"
      : "pass";
  return { employee: e, product: dock, checks, status };
}
export function evaluate(input: PurchaseRequest) {
  const request = requestSchema.parse(input);
  const rows = request.fleet.map((e) => evaluateEmployee(e, request.policy));
  const subtotalCents = rows.reduce((s, r) => s + r.product.priceCents, 0);
  const taxCents = Math.round((subtotalCents * 850) / 10000),
    shippingCents = 0,
    totalCents = subtotalCents + taxCents;
  const budgetOk = totalCents <= request.policy.budgetCents;
  return {
    rows,
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents,
    budgetOk,
    ready: budgetOk && rows.every((r) => r.status === "pass"),
    passed: rows.filter((r) => r.status === "pass").length,
    blocked: rows.filter((r) => r.status === "fail").length,
    unresolved: rows.filter((r) => r.status === "unknown").length,
    catalogVersion: CATALOG_VERSION,
  };
}
export function recommend(input: PurchaseRequest) {
  const request = requestSchema.parse(input);
  return {
    ...request,
    fleet: request.fleet.map((e) => {
      const candidates = products
        .filter(
          (p) =>
            evaluateEmployee({ ...e, productId: p.id }, request.policy)
              .status === "pass",
        )
        .sort((a, b) => a.priceCents - b.priceCents);
      return candidates.length ? { ...e, productId: candidates[0].id } : e;
    }),
  };
}
export function snapshot(input: PurchaseRequest) {
  const request = requestSchema.parse(input),
    result = evaluate(request);
  if (!result.ready)
    throw new Error(
      "Every requirement must pass and the order must fit the budget.",
    );
  return {
    request,
    catalogVersion: CATALOG_VERSION,
    currency: "USD",
    subtotalCents: result.subtotalCents,
    taxCents: result.taxCents,
    totalCents: result.totalCents,
    items: result.rows.map((r) => ({
      employeeId: r.employee.id,
      sku: r.product.id,
      quantity: 1,
      unitCents: r.product.priceCents,
    })),
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function checkSnapshot(s: Snapshot) {
  const fresh = snapshot(s.request);
  if (JSON.stringify(fresh) !== JSON.stringify(s))
    throw new Error(
      "The approved configuration has changed. Review a new quote before payment.",
    );
  return fresh;
}
export function parseMoney(value: string): number {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error("Invalid USD amount");
  const [a, b] = value.split(".");
  const cents = Number(a) * 100 + Number(b);
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid amount");
  return cents;
}
