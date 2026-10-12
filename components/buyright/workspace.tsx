"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Monitor,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  X,
  XCircle,
  RotateCcw,
  ShoppingBag,
  LockKeyhole,
  BookOpen,
  AlertTriangle,
  PanelLeftClose,
  ExternalLink,
} from "lucide-react";
import {
  sampleFleet,
  profiles,
  products,
  sources,
  productById,
  type ProfileId,
  type ProductId,
  type SourceId,
} from "@/lib/buyright/catalog";
import {
  defaultPolicy,
  evaluate,
  money,
  type Policy,
  type Employee,
  type PurchaseRequest,
  requestSchema,
} from "@/lib/buyright/engine";
import { parseRoster } from "@/lib/buyright/csv";
const Matrix = dynamic(() => import("./matrix"), {
  ssr: false,
  loading: () => (
    <div className="loading-panel">
      <LoaderCircle className="spin" /> Loading comparison workspace…
    </div>
  ),
});
const Studio = dynamic(() => import("./studio"), {
  ssr: false,
  loading: () => (
    <div className="loading-panel">
      <LoaderCircle className="spin" /> Loading AG Studio…
    </div>
  ),
});
const Checkout = dynamic(() => import("./checkout"), { ssr: false });
type Config = {
  paypal: boolean;
  paypalClientId: string | null;
  ai: boolean;
  model: string | null;
  studioLicense: string | null;
  signedIn: boolean;
  displayName: string | null;
};
type AIResult = {
  summary: string;
  warnings: string[];
  policy?: Policy;
  fleet?: Employee[];
  findings?: {
    claim: string;
    evidence: string;
    page: number | null;
    status: string;
  }[];
};
type SavedOrder = {
  id: string;
  status: string;
  totalCents: number;
  createdAt: number;
  captureId: string | null;
  paypalId: string | null;
};
const labels = {
  pass: "Verified",
  fail: "Conflict",
  unknown: "Needs evidence",
};
function Status({ status }: { status: "pass" | "fail" | "unknown" }) {
  return (
    <span className={`status ${status}`}>
      {status === "pass" ? (
        <Check size={12} />
      ) : status === "fail" ? (
        <X size={12} />
      ) : (
        <CircleHelp size={12} />
      )}{" "}
      {labels[status]}
    </span>
  );
}
export default function Workspace() {
  const [tab, setTab] = useState("workspace"),
    [fleet, setFleet] = useState<Employee[]>(sampleFleet),
    [policy, setPolicy] = useState<Policy>(defaultPolicy),
    [config, setConfig] = useState<Config | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState<PurchaseRequest | null>(null),
    [aiOpen, setAiOpen] = useState(false),
    [aiMode, setAiMode] = useState<"intake" | "document">("intake"),
    [prompt, setPrompt] = useState(""),
    [pdf, setPdf] = useState<{ name: string; data: string } | null>(null),
    [aiResult, setAiResult] = useState<AIResult | null>(null),
    [aiBusy, setAiBusy] = useState(false),
    [orders, setOrders] = useState<SavedOrder[]>([]),
    [catalogChoice, setCatalogChoice] = useState<ProductId>("anker-575");
  const fileRef = useRef<HTMLInputElement>(null),
    pdfRef = useRef<HTMLInputElement>(null);
  const input = useMemo(() => ({ fleet, policy }), [fleet, policy]);
  const result = useMemo(() => evaluate(input), [input]);
  const active = result.rows.find((r) => r.employee.id === selected);
  const rows = result.rows.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      `${r.employee.name} ${r.employee.team} ${profiles[r.employee.profile].label} ${r.product.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json() as Promise<Config>)
      .then(setConfig)
      .catch(() => setError("Could not load connection status."));
  }, []);
  useEffect(() => {
    if (!selected && !review && !aiOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([hidden]),textarea,select,[tabindex="0"]',
        ) ?? [],
      ).filter((x) => x.getClientRects().length);
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setReview(null);
        setAiOpen(false);
      }
      if (event.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [selected, review, aiOpen]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (tab === "orders") void loadOrders();
  }, [tab]);
  async function loadOrders() {
    setError("");
    try {
      const r = await fetch("/api/orders");
      const data = (await r.json()) as { orders: SavedOrder[]; error?: string };
      if (!r.ok) throw new Error(data.error);
      setOrders(data.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    }
  }
  async function inspectOrder(id: string, download = false) {
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "status", id }),
      });
      const data = (await response.json()) as {
        status: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Unable to reconcile this purchase.");
      if (download) {
        const url = URL.createObjectURL(
          new Blob(
            [JSON.stringify({ ...data, environment: "sandbox" }, null, 2)],
            { type: "application/json" },
          ),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = `buyright-${id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
      await loadOrders();
      setToast(`Purchase status: ${data.status.replaceAll("_", " ")}.`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load purchase.",
      );
    }
  }
  async function verify(recommend = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: input, recommend }),
      });
      const b = (await r.json()) as {
        error?: string;
        request: PurchaseRequest;
        result: AIResult & ReturnType<typeof evaluate>;
      };
      if (!r.ok) throw new Error(b.error);
      setFleet(b.request.fleet);
      setToast(
        recommend
          ? `Configurations updated. ${b.result.passed} of ${fleet.length} meet your requirements.`
          : "Server verification complete. Evidence and totals checked.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }
  function updateEmployee(
    id: string,
    field: "profile" | "productId",
    value: string,
  ) {
    setFleet((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  }
  function downloadReport() {
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: "curated-rule-checks",
      prices: "demo fixture, not current offers",
      request: input,
      result,
      sources,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "buyright-verification.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importCSV(file: File) {
    try {
      if (file.size > 100000)
        throw new Error("CSV must be smaller than 100KB.");
      setFleet(parseRoster(await file.text()));
      setToast("Team imported. Review host profiles before purchasing.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid roster.");
    }
  }
  async function analyze() {
    setAiBusy(true);
    setError("");
    setAiResult(null);
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: aiMode,
          text: prompt,
          ...(pdf ? { pdf: pdf.data } : {}),
        }),
      });
      const b = (await r.json()) as {
        error?: string;
        request: PurchaseRequest;
        result: AIResult & ReturnType<typeof evaluate>;
      };
      if (!r.ok) throw new Error(b.error);
      setAiResult(b.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI analysis failed.");
    } finally {
      setAiBusy(false);
    }
  }
  function applyAI() {
    if (!aiResult?.fleet || !aiResult.policy) return;
    try {
      const parsed = requestSchema.parse({
        fleet: aiResult.fleet,
        policy: aiResult.policy,
      });
      setFleet(parsed.fleet);
      setPolicy(parsed.policy);
      setAiOpen(false);
      setTab("workspace");
      setToast("AI draft applied. Review every requirement before checkout.");
    } catch {
      setError(
        "The AI draft contains unsupported fields and could not be applied.",
      );
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="BuyRight home">
          <span className="brand-mark">
            <Check size={22} strokeWidth={3} />
          </span>
          buyright<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="org-icon">N</span>
          <div>
            <strong>Northstar Supply</strong>
            <small>Sample merchant</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ["workspace", "Purchase workspace", LayoutDashboard],
            ["catalog", "Equipment catalog", Package],
            ["evidence", "Evidence library", BookOpen],
            ["orders", "Orders & receipts", ShoppingBag],
            ["studio", "Insights studio", SlidersHorizontal],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Package;
            return (
              <button
                key={String(id)}
                className={tab === id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setTab(String(id));
                  setError("");
                }}
              >
                <I size={17} />
                {String(label)}
                {id === "workspace" && (
                  <span className="nav-count">{fleet.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="build-note">
            <ShieldCheck size={19} />
            <strong>Evidence before payment.</strong>
            <p>
              Every configuration checked.
              <br />
              Every decision explained.
            </p>
          </div>
          <button
            className={tab === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("settings")}
          >
            <Settings2 size={17} /> Connections
          </button>
          <div className="profile">
            <span className="avatar">
              {config?.displayName?.slice(0, 1) || "B"}
            </span>
            <div>
              <strong>{config?.displayName || "Builder workspace"}</strong>
              <small>PayPal hackathon · prototype</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>
              {tab === "workspace"
                ? "Team equipment"
                : tab === "studio"
                  ? "Insights studio"
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </strong>
          </div>
          <div className="top-actions">
            <span className="sandbox-tag">
              <span /> Sandbox workspace
            </span>
            <a
              href="https://github.com/tenth-package0/buyright"
              target="_blank"
              rel="noreferrer"
              className="repo-link"
            >
              Source <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main>
          {error && (
            <div className="error top-error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "workspace" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> PURCHASE REQUEST · BR-001
                  </div>
                  <h1>
                    The right setup.
                    <br className="mobile-only" /> For every teammate.
                  </h1>
                  <p>
                    Turn a team’s requirements into a purchase you can explain.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setAiMode("intake");
                    setAiOpen(true);
                    setAiResult(null);
                  }}
                >
                  <Sparkles size={16} /> Describe your request
                </button>
              </div>
              <div className="metric-grid">
                <div className="metric">
                  <span>
                    Team members <Users size={16} />
                  </span>
                  <strong>{fleet.length.toString().padStart(2, "0")}</strong>
                  <small>Workstations to configure</small>
                </div>
                <div className="metric">
                  <span>
                    Ready to purchase <ShieldCheck size={16} />
                  </span>
                  <strong className="green">
                    {result.passed.toString().padStart(2, "0")}
                    <em> / {fleet.length}</em>
                  </strong>
                  <small>All supported checks passed</small>
                </div>
                <div className="metric">
                  <span>
                    Need attention <AlertTriangle size={16} />
                  </span>
                  <strong className="orange">
                    {(result.blocked + result.unresolved)
                      .toString()
                      .padStart(2, "0")}
                  </strong>
                  <small>Compatibility or evidence gaps</small>
                </div>
                <div className="metric">
                  <span>
                    Estimated total <ShoppingBag size={16} />
                  </span>
                  <strong>{money(result.totalCents)}</strong>
                  <small className={!result.budgetOk ? "red" : ""}>
                    {result.budgetOk
                      ? `${money(policy.budgetCents - result.totalCents)} within budget`
                      : `${money(result.totalCents - policy.budgetCents)} over budget`}
                  </small>
                </div>
              </div>
              <section className="requirements panel">
                <div className="section-label">
                  <SlidersHorizontal size={17} />
                  <strong>Purchase requirements</strong>
                  <span>Applied to every employee</span>
                </div>
                <div className="requirements-fields">
                  <label>
                    Order budget
                    <div className="money-input">
                      <span>$</span>
                      <input
                        aria-label="Order budget"
                        type="number"
                        min="1"
                        max="100000"
                        value={policy.budgetCents / 100}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            budgetCents: Math.max(
                              100,
                              Math.min(
                                10000000,
                                Math.round(Number(e.target.value) * 100),
                              ),
                            ),
                          })
                        }
                      />
                    </div>
                  </label>
                  <label>
                    External displays
                    <select
                      value={policy.displays}
                      onChange={(e) =>
                        setPolicy({
                          ...policy,
                          displays: Number(e.target.value) as 1 | 2,
                        })
                      }
                    >
                      <option value={1}>1 × 4K display</option>
                      <option value={2}>2 × 4K displays</option>
                    </select>
                  </label>
                  <label>
                    Refresh rate
                    <select
                      value={policy.refreshHz}
                      onChange={(e) =>
                        setPolicy({
                          ...policy,
                          refreshHz: Number(e.target.value) as 30 | 60,
                        })
                      }
                    >
                      <option value={60}>60 Hz</option>
                      <option value={30}>30 Hz</option>
                    </select>
                  </label>
                  <label>
                    Minimum charging
                    <select
                      value={policy.minPowerWatts}
                      onChange={(e) =>
                        setPolicy({
                          ...policy,
                          minPowerWatts: Number(e.target.value),
                        })
                      }
                    >
                      {[0, 45, 65, 85, 100, 140].map((w) => (
                        <option key={w} value={w}>
                          {w} W
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="driver-label">
                    Display software
                    <button
                      className={`policy-toggle ${policy.allowDrivers ? "allowed" : ""}`}
                      onClick={() =>
                        setPolicy({
                          ...policy,
                          allowDrivers: !policy.allowDrivers,
                        })
                      }
                      aria-pressed={policy.allowDrivers}
                    >
                      <span className="toggle-track">
                        <span />
                      </span>
                      {policy.allowDrivers ? "Allowed by buyer" : "Not allowed"}
                    </button>
                  </label>
                </div>
              </section>
              <div className="section-heading">
                <div>
                  <h2>
                    Configuration review{" "}
                    <span className="pill">{fleet.length} employees</span>
                  </h2>
                  <p>Compare the actual setup—not just the product headline.</p>
                </div>
                <div className="button-row">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void importCSV(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={15} /> Import team
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => verify(true)}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}{" "}
                    Find compatible options
                  </button>
                </div>
              </div>
              <section className="matrix-panel panel">
                <div className="matrix-tools">
                  <div className="filter-tabs">
                    {[
                      ["all", "Everyone"],
                      ["fail", "Conflicts"],
                      ["unknown", "Unresolved"],
                      ["pass", "Verified"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "selected" : ""}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                        {id === "fail" && result.blocked > 0 && (
                          <span>{result.blocked}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={15} />
                    <input
                      aria-label="Search team"
                      placeholder="Find a teammate…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <Matrix
                  rows={rows}
                  onSelect={setSelected}
                  onChange={updateEmployee}
                />
                <div className="matrix-footer">
                  <span>
                    <span className="live-dot" /> Curated manufacturer evidence
                    · rules evaluated live
                  </span>
                  <button className="text-button" onClick={downloadReport}>
                    <ArrowDownToLine size={14} /> Export verification
                  </button>
                </div>
              </section>
              {(result.blocked > 0 || result.unresolved > 0) && (
                <div className="insight">
                  <div className="insight-icon">
                    <FileCheck2 size={21} />
                  </div>
                  <div>
                    <strong>
                      {!policy.allowDrivers &&
                      fleet.some((e) => e.profile === "mac-m2") &&
                      policy.displays === 2
                        ? "Your driver policy needs a decision."
                        : "Some configurations don’t meet the request."}
                    </strong>
                    <p>
                      {!policy.allowDrivers &&
                      fleet.some((e) => e.profile === "mac-m2") &&
                      policy.displays === 2
                        ? "Base M2 Air laptops cannot drive two native external displays. Allow DisplayLink software explicitly, reduce the display requirement, or change the hardware."
                        : "Open a row to inspect the evidence. Compatible alternatives respect your existing requirements and budget."}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      setSelected(
                        result.rows.find((r) => r.status !== "pass")?.employee
                          .id ?? null,
                      )
                    }
                  >
                    See evidence <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <section className="checkout-strip">
                <div className="checkout-icon">
                  <LockKeyhole size={21} />
                </div>
                <div>
                  <h3>
                    {result.ready
                      ? "Ready for your approval."
                      : "Resolve the checks before checkout."}
                  </h3>
                  <p>
                    Demo catalog prices · 8.5% sample tax · no shipping charge ·
                    sandbox only
                  </p>
                </div>
                <div className="checkout-total">
                  <small>ORDER TOTAL</small>
                  <strong>{money(result.totalCents)}</strong>
                </div>
                <button
                  className="primary"
                  disabled={!result.ready}
                  onClick={() => setReview(structuredClone(input))}
                >
                  Review purchase <ArrowRight size={16} />
                </button>
              </section>
              <div className="workspace-foot">
                <span>
                  Prototype scope: docks for supported host profiles. Displays
                  and cables are existing equipment.
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setFleet(sampleFleet);
                    setPolicy(defaultPolicy);
                    setToast("Sample workspace restored.");
                  }}
                >
                  <RotateCcw size={13} /> Reset sample
                </button>
              </div>
            </>
          )}
          {tab === "catalog" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CURATED EQUIPMENT</div>
                  <h1>Know what you’re buying.</h1>
                  <p>
                    Real product references. Illustrative prices for a
                    controlled sandbox merchant.
                  </p>
                </div>
              </div>
              <div className="catalog-grid">
                {products.map((p, i) => (
                  <article className="product-card panel" key={p.id}>
                    <div className={`product-visual visual-${i}`}>
                      <DockArt />
                      <span>{p.label}</span>
                    </div>
                    <div className="product-body">
                      <small>{p.brand}</small>
                      <h2>{p.name}</h2>
                      <p>{p.subtitle}</p>
                      <div className="product-cost">
                        <strong>{money(p.priceCents)}</strong>
                        <span>demo unit price</span>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          setFleet(
                            fleet.map((e) => ({ ...e, productId: p.id })),
                          );
                          setTab("workspace");
                          setToast(
                            `${p.name} assigned to all employees. Check compatibility before purchasing.`,
                          );
                        }}
                      >
                        Compare for my team <ArrowRight size={15} />
                      </button>
                      {p.source && (
                        <a
                          className="source-link"
                          href={sources[p.source].url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Manufacturer reference <ArrowUpRight size={13} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "evidence" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">SOURCE LIBRARY</div>
                  <h1>The details make the difference.</h1>
                  <p>
                    Every supported check has a source. Missing evidence stays
                    unresolved.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setAiMode("document");
                    setAiOpen(true);
                    setAiResult(null);
                    setPrompt(
                      "Review this manual for display limits, host exceptions, charging output, and required drivers. Cite pages and distinguish uncertain claims.",
                    );
                  }}
                >
                  <Plus size={16} /> Review a manual
                </button>
              </div>
              <div className="notice">
                <FileCheck2 size={18} />
                <span>
                  Catalog checks use manually curated facts. AI document reviews
                  are suggestions and do not automatically change purchasable
                  configurations.
                </span>
              </div>
              <div className="evidence-list">
                {Object.entries(sources).map(([id, s]) => (
                  <article className="evidence-card panel" key={id}>
                    <div className="doc-icon">
                      <FileText size={22} />
                    </div>
                    <div>
                      <span className="eyebrow">
                        MANUFACTURER DOCUMENTATION
                      </span>
                      <h2>{s.title}</h2>
                      <blockquote>“{s.quote}”</blockquote>
                      <p>{s.note}</p>
                      <a
                        className="source-link"
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Read original documentation <ArrowUpRight size={14} />
                      </a>
                    </div>
                    <span className="pill">Curated Oct 12, 2026</span>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "orders" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PAYMENT HISTORY</div>
                  <h1>Every purchase, accounted for.</h1>
                  <p>
                    Server-stored sandbox orders with PayPal transaction
                    references.
                  </p>
                </div>
                <button className="secondary" onClick={loadOrders}>
                  <RotateCcw size={15} /> Refresh
                </button>
              </div>
              {!orders.length ? (
                <div className="empty panel">
                  <ShoppingBag size={36} />
                  <h2>No purchases yet.</h2>
                  <p>
                    Complete a verified sandbox checkout to create your first
                    receipt.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setTab("workspace")}
                  >
                    Open workspace <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="panel order-list">
                  {orders.map((o) => (
                    <div className="order-row" key={o.id}>
                      <span className="doc-icon">
                        <ShoppingBag size={20} />
                      </span>
                      <div>
                        <strong>{o.id.slice(0, 8).toUpperCase()}</strong>
                        <p>{new Date(o.createdAt).toLocaleString()}</p>
                        <small>
                          {o.captureId
                            ? `Capture: ${o.captureId}`
                            : "No confirmed capture"}
                        </small>
                      </div>
                      <span
                        className={`pill ${o.status === "PAID" ? "green" : ""}`}
                      >
                        {o.status.replaceAll("_", " ")}
                      </span>
                      <strong>{money(o.totalCents)}</strong>
                      <button
                        className="secondary"
                        onClick={() => inspectOrder(o.id)}
                      >
                        Check payment
                      </button>
                      <button
                        className="text-button"
                        onClick={() => inspectOrder(o.id, true)}
                      >
                        Export record
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "studio" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">AG STUDIO · LIVE WORKSPACE DATA</div>
                  <h1>See the whole purchase.</h1>
                  <p>
                    Arrange your verification widgets and explore team-level
                    purchasing decisions.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setTab("workspace")}
                >
                  Back to configurations <ArrowRight size={15} />
                </button>
              </div>
              <Studio input={input} license={config?.studioLicense ?? null} />
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CONNECTIONS</div>
                  <h1>Ready when your services are.</h1>
                  <p>
                    The sample is usable now. Live AI and sandbox checkout
                    activate when configured.
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                {[
                  {
                    title: "PayPal sandbox",
                    ok: config?.paypal,
                    icon: ShoppingBag,
                    description:
                      "Creates real sandbox orders, obtains buyer approval, authorizes and captures payments.",
                    keys: "PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET · PAYPAL_MERCHANT_ID · PAYPAL_WEBHOOK_ID",
                  },
                  {
                    title: "Anthropic AI",
                    ok: config?.ai,
                    icon: Sparkles,
                    description:
                      "Interprets requests and reviews uploaded PDF manuals. AI suggestions require your review.",
                    keys: "ANTHROPIC_API_KEY · ANTHROPIC_MODEL",
                  },
                  {
                    title: "AG Studio",
                    ok: Boolean(config?.studioLicense),
                    icon: LayoutDashboard,
                    description:
                      "Interactive data workspace with custom verification and purchase widgets. A valid evaluation or production license is needed.",
                    keys: "AG_STUDIO_LICENSE_KEY",
                  },
                ].map((x) => (
                  <div className="panel setting-card" key={x.title}>
                    <x.icon size={24} />
                    <div className="setting-title">
                      <h2>{x.title}</h2>
                      <span className={`status ${x.ok ? "pass" : "unknown"}`}>
                        {x.ok ? "Configured" : "Setup needed"}
                      </span>
                    </div>
                    <p>{x.description}</p>
                    <code>{x.keys}</code>
                  </div>
                ))}
              </div>
              <div className="panel setup-guide">
                <h2>Private configuration</h2>
                <p>
                  For local development, copy <code>.env.example</code> to{" "}
                  <code>.dev.vars</code> and fill in your sandbox and API
                  values. Hosted deployments use encrypted runtime settings.
                  Never put secrets in the repository.
                </p>
                <p>
                  PayPal webhook endpoint: <code>/api/paypal/webhook</code>.
                  Subscribe to <code>PAYMENT.CAPTURE.COMPLETED</code>.
                </p>
                {!config?.signedIn && (
                  <a
                    className="primary"
                    href="/signin-with-chatgpt?return_to=/"
                    target="_top"
                  >
                    Sign in to enable protected actions <ArrowRight size={16} />
                  </a>
                )}
                <a href="/team-template.csv" download className="source-link">
                  Download team CSV template <ArrowDownToLine size={14} />
                </a>
              </div>
            </>
          )}
        </main>
        <footer>
          BuyRight <span>Built for considered purchases.</span>
          <a
            href="https://paypalaihackathon.devpost.com/"
            target="_blank"
            rel="noreferrer"
          >
            PayPal AI Hackathon ↗
          </a>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {active && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <aside
            className="evidence-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Configuration evidence"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-button"
              aria-label="Close evidence"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">CONFIGURATION EVIDENCE</div>
            <h2>{active.employee.name}</h2>
            <p className="muted">{profiles[active.employee.profile].label}</p>
            <div className="drawer-product">
              <Monitor size={26} />
              <div>
                <strong>
                  {active.product.brand} {active.product.name}
                </strong>
                <p>{active.product.subtitle}</p>
              </div>
              <Status status={active.status} />
            </div>
            {active.checks.map((c) => (
              <section className="check-card" key={c.key}>
                <div>
                  <strong>{c.label}</strong>
                  <Status status={c.status} />
                </div>
                <p>{c.reason}</p>
                {c.source && (
                  <>
                    {(c.key === "display" ||
                      c.key === "host-displays" ||
                      (c.key === "drivers" && c.source === "displaylink")) && (
                      <blockquote>“{sources[c.source].quote}”</blockquote>
                    )}
                    <a
                      href={sources[c.source].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sources[c.source].title} <ExternalLink size={12} />
                    </a>
                  </>
                )}
              </section>
            ))}
            <div className="notice">
              Evidence supports this defined profile; it is not a guarantee for
              every model, firmware, cable, or display.
            </div>
            <button
              className="primary full-width"
              onClick={() => {
                setSelected(null);
                void verify(true);
              }}
            >
              <Sparkles size={16} /> Find options within my policy
            </button>
          </aside>
        </div>
      )}
      {review && (
        <div className="overlay" onClick={() => setReview(null)}>
          <div
            className="modal purchase-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review purchase"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setReview(null)}
              aria-label="Close purchase"
            >
              <X size={20} />
            </button>
            <div className="eyebrow">BUYER APPROVAL</div>
            <h2>Review your purchase.</h2>
            <p className="muted">
              The server rechecks this exact configuration before payment.
            </p>
            <div className="review-items">
              {review.fleet.map((e) => (
                <div key={e.id}>
                  <div>
                    <strong>{e.name}</strong>
                    <small>{productById(e.productId).name}</small>
                  </div>
                  <span>{money(productById(e.productId).priceCents)}</span>
                </div>
              ))}
            </div>
            <div className="review-total">
              <span>Sample tax (8.5%)</span>
              <span>{money(evaluate(review).taxCents)}</span>
            </div>
            <div className="review-total grand">
              <strong>Total · USD</strong>
              <strong>{money(evaluate(review).totalCents)}</strong>
            </div>
            {config?.paypal && config.signedIn && config.paypalClientId ? (
              <Checkout
                request={review}
                clientId={config.paypalClientId}
                onPaid={() =>
                  setToast("Sandbox payment confirmed. Receipt saved.")
                }
              />
            ) : (
              <div className="notice">
                <LockKeyhole size={20} />
                <div>
                  <strong>
                    {!config?.signedIn
                      ? "Sign in to create a purchase."
                      : "PayPal sandbox needs connecting."}
                  </strong>
                  <p>
                    Compatibility checks are complete. No payment has been
                    created or simulated.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setReview(null);
                      setTab("settings");
                    }}
                  >
                    Open connections <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {aiOpen && (
        <div className="overlay" onClick={() => setAiOpen(false)}>
          <div
            className="modal ai-modal"
            role="dialog"
            aria-modal="true"
            aria-label="AI purchasing analyst"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-button"
              aria-label="Close AI analyst"
              onClick={() => setAiOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">
              <Sparkles size={14} /> AI PURCHASING ANALYST
            </div>
            <h2>
              {aiMode === "intake"
                ? "Start with what you need."
                : "Read between the specifications."}
            </h2>
            <p className="muted">
              {aiMode === "intake"
                ? "Describe the team, exact laptop models, budget, and constraints. Review the extracted draft before applying it."
                : "Upload a manufacturer PDF. Findings remain suggestions until independently reviewed."}
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Six employees need two 4K displays at 60Hz. Our budget is $1,800…"
              rows={5}
            />
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5000000) {
                  setError("PDF must be under 5MB.");
                  return;
                }
                const bytes = new Uint8Array(await f.arrayBuffer());
                let binary = "";
                for (const b of bytes) binary += String.fromCharCode(b);
                setPdf({ name: f.name, data: btoa(binary) });
              }}
            />
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => pdfRef.current?.click()}
              >
                <Upload size={15} />
                {pdf?.name || "Attach PDF (up to 5MB)"}
              </button>
              {pdf && (
                <button className="text-button" onClick={() => setPdf(null)}>
                  Remove
                </button>
              )}
              <button
                className="primary"
                disabled={
                  aiBusy || !prompt.trim() || !config?.ai || !config?.signedIn
                }
                onClick={analyze}
              >
                {aiBusy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Sparkles size={16} />
                )}{" "}
                Analyze
              </button>
            </div>
            <p className="tiny muted">
              When you analyze, the request and attached PDF are sent to the
              configured Anthropic API. Do not upload information you are not
              authorized to share.
            </p>
            {(!config?.ai || !config?.signedIn) && (
              <div className="notice">
                Live AI requires a configured API connection and sign-in.{" "}
                <button
                  className="text-button"
                  onClick={() => {
                    setAiOpen(false);
                    setTab("settings");
                  }}
                >
                  Open connections →
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {aiResult && (
              <div className="ai-results">
                <h3>Review the analysis</h3>
                <p>{aiResult.summary}</p>
                {aiResult.warnings.map((w, i) => (
                  <p className="notice" key={i}>
                    {w}
                  </p>
                ))}
                {aiResult.findings?.map((f, i) => (
                  <div className="check-card" key={i}>
                    <strong>{f.claim}</strong>
                    <p>{f.evidence}</p>
                    <small>
                      {f.status} ·{" "}
                      {f.page ? `page ${f.page}` : "page unverified"}
                    </small>
                  </div>
                ))}
                {aiResult.fleet && aiResult.policy && (
                  <>
                    <pre>
                      {JSON.stringify(
                        { policy: aiResult.policy, fleet: aiResult.fleet },
                        null,
                        2,
                      )}
                    </pre>
                    <button className="primary" onClick={applyAI}>
                      Apply reviewed draft <ArrowRight size={15} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function DockArt() {
  return (
    <svg viewBox="0 0 320 160" aria-hidden="true">
      <defs>
        <linearGradient id="dock" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#575e5b" />
          <stop offset="1" stopColor="#262e2b" />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="122" rx="110" ry="10" fill="#17382d" opacity=".1" />
      <path d="M66 62L250 50 278 75 93 91Z" fill="#78817c" />
      <path d="M93 91L278 75 278 108 93 124Z" fill="url(#dock)" />
      <path d="M66 62L93 91 93 124 66 94Z" fill="#39443e" />
      <rect x="113" y="98" width="23" height="9" rx="2" fill="#101c17" />
      <rect x="147" y="95" width="23" height="9" rx="2" fill="#101c17" />
      <rect x="184" y="92" width="16" height="7" rx="3" fill="#101c17" />
      <circle cx="251" cy="91" r="2" fill="#b6e998" />
      <path
        d="M71 77C20 71 26 134 63 135"
        fill="none"
        stroke="#3c4c43"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
