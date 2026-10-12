"use client";
import { createContext, useContext, useMemo, useRef } from "react";
import {
  AgStudio,
  createWidgets,
  type AgWidgetDefinition,
} from "ag-studio-react";
import {
  AgStudioLicenseManager,
  AgStudioAiModule,
  studioTheme,
  createAiHarness,
  directLlmRunner,
  type AgDefaultRegistry,
  type AgReportState,
  type AgWidgetData,
  type AgWidgetDataFormat,
  type AgLlmAdapter,
  type AgLlmResponse,
  type AgAiHarnessSetup,
} from "ag-studio";
import { evaluate, money, type PurchaseRequest } from "@/lib/buyright/engine";
import { sources } from "@/lib/buyright/catalog";
type Data<T extends string> = AgWidgetData<
  Record<string, never>,
  AgWidgetDataFormat<unknown>
> & { type: T };
interface Registry extends Omit<AgDefaultRegistry, "widgets"> {
  widgets: readonly [
    ...AgDefaultRegistry["widgets"],
    AgWidgetDefinition<"readiness", Data<"readiness">>,
    AgWidgetDefinition<"exceptions", Data<"exceptions">>,
    AgWidgetDefinition<"budget", Data<"budget">>,
  ];
}
const Context = createContext<PurchaseRequest | null>(null);
function usePurchase() {
  const input = useContext(Context)!;
  return { input, result: evaluate(input) };
}
function Readiness() {
  const { result } = usePurchase();
  return (
    <section className="studio-widget">
      <div className="eyebrow">PURCHASE READINESS</div>
      <strong className="studio-number">
        {result.passed}
        <span> / {result.rows.length}</span>
      </strong>
      <h2>Configurations verified</h2>
      <p>
        {result.blocked} blocked · {result.unresolved} need evidence
      </p>
      <div className="readiness-track">
        <div
          style={{ width: `${(100 * result.passed) / result.rows.length}%` }}
        />
      </div>
      <span className={`status ${result.ready ? "pass" : "fail"}`}>
        {result.ready ? "Ready for buyer review" : "Payment remains blocked"}
      </span>
    </section>
  );
}
function Budget() {
  const { input, result } = usePurchase();
  return (
    <section className="studio-widget">
      <div className="eyebrow">APPROVED SPENDING LIMIT</div>
      <strong className="studio-number">{money(result.totalCents)}</strong>
      <p>of {money(input.policy.budgetCents)} · includes sample 8.5% tax</p>
      <div className="readiness-track">
        <div
          style={{
            width: `${Math.min(100, (100 * result.totalCents) / input.policy.budgetCents)}%`,
            background: result.budgetOk ? "#7a9b58" : "#c77351",
          }}
        />
      </div>
      <h2>
        {result.budgetOk
          ? `${money(input.policy.budgetCents - result.totalCents)} remaining`
          : "Budget exceeded"}
      </h2>
      <p>Fixed demo prices. No live merchant quote.</p>
    </section>
  );
}
function Exceptions() {
  const { result } = usePurchase();
  return (
    <section className="studio-widget">
      <div className="eyebrow">EVIDENCE & EXCEPTIONS</div>
      {result.rows.map((row) => (
        <div className="studio-exception" key={row.employee.id}>
          <strong>{row.employee.name}</strong>
          <span className={`status ${row.status}`}>{row.status}</span>
          {row.checks
            .filter((c) => c.status !== "pass")
            .map((c) => (
              <p key={c.key}>
                {c.reason}{" "}
                {c.source && (
                  <a
                    href={sources[c.source].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source ↗
                  </a>
                )}
              </p>
            ))}
        </div>
      ))}
    </section>
  );
}
const widgets = createWidgets<Registry>({
  additionalTypes: [
    {
      id: "readiness",
      label: "Purchase readiness",
      comp: Readiness,
      minSize: { width: 200, height: 200 },
      form: (p) => p.createDefaults({}),
      defaultSize: { width: 420, height: 270 },
      ai: {
        description: "Deterministic verification status for the current fleet.",
      },
    },
    {
      id: "budget",
      label: "Budget guard",
      comp: Budget,
      minSize: { width: 200, height: 200 },
      form: (p) => p.createDefaults({}),
      defaultSize: { width: 420, height: 270 },
      ai: {
        description: "Current server-verifiable quote versus buyer budget.",
      },
    },
    {
      id: "exceptions",
      label: "Evidence and exceptions",
      comp: Exceptions,
      minSize: { width: 300, height: 200 },
      form: (p) => p.createDefaults({}),
      defaultSize: { width: 700, height: 480 },
      ai: {
        description:
          "Blocking compatibility checks and linked manufacturer evidence.",
      },
    },
  ],
  menu: [
    {
      label: "BuyRight verification",
      widgetIds: ["readiness", "budget", "exceptions"],
    },
  ],
});
const initialState: AgReportState<Registry> = {
  panels: {
    filters: { collapsed: true },
    edit: { collapsed: true },
    data: { collapsed: true },
    ai: { collapsed: true },
  },
  selectedPageId: "purchase",
  pages: [
    {
      id: "purchase",
      widgets: {
        ready: { type: "readiness", dataMapping: {} },
        budget: { type: "budget", dataMapping: {} },
        exceptions: { type: "exceptions", dataMapping: {} },
      },
      widgetLayout: {
        ready: { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 17 },
        budget: { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 17 },
        exceptions: { xTrack: 0, yTrack: 18, xSpan: 24, ySpan: 30 },
      },
    },
  ],
};
const theme = studioTheme.withParams({
  backgroundColor: "#ffffff",
  textColor: "#354832",
  borderColor: "#e3e7dd",
  fontFamily: "Arial, sans-serif",
  studioCanvasBackgroundColor: "#f4f6ef",
  studioWidgetBorderRadius: 9,
});
export default function Studio({
  input,
  license,
}: {
  input: PurchaseRequest;
  license: string | null;
}) {
  const live = useRef(input);
  live.current = input;
  const ai = useMemo<AgAiHarnessSetup>(
    () =>
      ({ api }) => {
        const adapter: AgLlmAdapter = {
          executeTurn(request, options) {
            const complete = (async (): Promise<AgLlmResponse> => {
              const response = await fetch("/api/studio", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  purchase: live.current,
                  messages: request.input
                    .filter((x) => x.type === "message")
                    .map((x) => ({
                      role: x.role === "assistant" ? "assistant" : "user",
                      text: x.content
                        .filter((c) => c.type === "text")
                        .map((c) => ("text" in c ? c.text : ""))
                        .join("\n"),
                    })),
                }),
                signal: options?.signal,
              });
              const data = (await response.json()) as {
                text: string;
                error?: string;
              };
              if (!response.ok)
                throw new Error(data.error || "Analysis failed.");
              return {
                id: crypto.randomUUID(),
                createdAt: Date.now(),
                status: "completed",
                output: [
                  {
                    id: crypto.randomUUID(),
                    kind: "output",
                    type: "message",
                    role: "assistant",
                    status: "completed",
                    content: [
                      { type: "text", text: data.text, annotations: [] },
                    ],
                  },
                ],
              };
            })();
            return {
              complete,
              stream: {
                async *[Symbol.asyncIterator]() {
                  const response = await complete;
                  const message = response.output[0];
                  if (message.type === "message") {
                    yield {
                      type: "TEXT_MESSAGE_START" as const,
                      messageId: message.id,
                      role: "assistant" as const,
                    };
                    yield {
                      type: "TEXT_MESSAGE_CONTENT" as const,
                      messageId: message.id,
                      delta: message.content
                        .map((c) => ("text" in c ? c.text : ""))
                        .join(""),
                    };
                    yield {
                      type: "TEXT_MESSAGE_END" as const,
                      messageId: message.id,
                    };
                  }
                },
              },
            };
          },
        };
        return createAiHarness(api, () => ({
          primary: "analyst",
          agents: [
            directLlmRunner({
              id: "analyst",
              name: "BuyRight analyst",
              description:
                "Explains the live purchase audit and its evidence. Cannot alter a policy or move money.",
              maxTurns: 1,
              adapter,
            }),
          ],
          promptStarters: [
            {
              label: "Explain the blockers",
              prompt:
                "Which configurations are blocked, and why? Cite the source links.",
            },
            {
              label: "Find a viable next step",
              prompt:
                "What can we change explicitly to make this purchase viable without silently relaxing policy?",
            },
          ],
        }));
      },
    [],
  );
  if (license) AgStudioLicenseManager.setLicenseKey(license);
  const data = useMemo(
    () => ({
      sources: [
        {
          id: "fleet",
          data: evaluate(input).rows.map((r) => ({
            employee: r.employee.name,
            team: r.employee.team,
            product: r.product.name,
            status: r.status,
            price: r.product.priceCents / 100,
          })),
        },
      ],
    }),
    [input],
  );
  return (
    <>
      <div className="studio-notice">
        Custom widgets use the same verification engine as checkout. The analyst
        uses live AI when configured; its advice cannot authorize purchases.{" "}
        {!license &&
          "AG Studio is running without a configured license; obtain an evaluation key before recording."}
      </div>
      <Context.Provider value={input}>
        <div style={{ height: 920, overflowX: "auto" }}>
          <AgStudio<Registry>
            modules={[AgStudioAiModule]}
            style={{ height: "100%", minWidth: 700 }}
            data={data}
            widgets={widgets}
            initialState={initialState}
            theme={theme}
            mode="edit"
            panels={{ edit: { right: ["ai", "edit", "data"] } }}
            ai={ai}
          />
        </div>
      </Context.Provider>
    </>
  );
}
