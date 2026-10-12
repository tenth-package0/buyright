"use client";
import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { money, type PurchaseRequest } from "@/lib/buyright/engine";
declare global {
  interface Window {
    paypal?: {
      Buttons: (options: Record<string, unknown>) => {
        render: (node: HTMLElement) => Promise<void>;
        close: () => Promise<void>;
      };
    };
  }
}
export default function Checkout({
  request,
  clientId,
  onPaid,
}: {
  request: PurchaseRequest;
  clientId: string;
  onPaid: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    id = useRef(crypto.randomUUID());
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<{
      captureId: string;
      totalCents: number;
      status: string;
    } | null>(null);
  async function action(kind: string) {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: kind,
        id: id.current,
        ...(kind === "create" ? { request } : {}),
      }),
    });
    const b = (await r.json()) as {
      captureId: string;
      totalCents: number;
      status: string;
      paypalId: string;
      error?: string;
    };
    if (!r.ok) throw new Error(b.error);
    return b;
  }
  async function complete() {
    setBusy(true);
    setError("");
    try {
      const b = await action("capture");
      setReceipt(b);
      if (b.status === "PAID") onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment needs review.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let canceled = false,
      buttons: ReturnType<NonNullable<Window["paypal"]>["Buttons"]> | undefined;
    async function mount() {
      try {
        if (!window.paypal)
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>(
              "script[data-buyright-paypal]",
            );
            if (existing) {
              existing.addEventListener("load", () => resolve(), {
                once: true,
              });
              existing.addEventListener(
                "error",
                () => reject(new Error("Could not load PayPal.")),
                { once: true },
              );
              return;
            }
            const script = document.createElement("script");
            script.dataset.buyrightPaypal = "true";
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=authorize`;
            script.onload = () => resolve();
            script.onerror = () => {
              script.remove();
              reject(
                new Error("PayPal checkout could not load. Please retry."),
              );
            };
            document.head.appendChild(script);
          });
        if (canceled || !container.current || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "paypal",
          },
          createOrder: async () => {
            setError("");
            return (await action("create")).paypalId;
          },
          onApprove: complete,
          onCancel: () =>
            setError("Checkout was canceled. No capture was requested."),
          onError: () =>
            setError(
              "PayPal checkout encountered a problem. Check the order status before starting another purchase.",
            ),
        });
        await buttons.render(container.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed.");
      }
    }
    void mount();
    return () => {
      canceled = true;
      void buttons?.close();
    };
    // This component is remounted for each immutable review snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (receipt?.status === "PAID")
    return (
      <div className="receipt">
        <CheckCircle2 size={40} />
        <h2>Purchase confirmed.</h2>
        <p>{money(receipt.totalCents)} captured in PayPal sandbox.</p>
        <dl>
          <dt>Purchase reference</dt>
          <dd>{id.current}</dd>
          <dt>PayPal capture</dt>
          <dd>{receipt.captureId}</dd>
        </dl>
        <button
          className="secondary"
          onClick={() => {
            const data = new Blob(
              [
                JSON.stringify(
                  {
                    purchaseId: id.current,
                    ...receipt,
                    request,
                    environment: "sandbox",
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            );
            const url = URL.createObjectURL(data);
            const a = document.createElement("a");
            a.href = url;
            a.download = "buyright-sandbox-receipt.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download receipt <ExternalLink size={14} />
        </button>
      </div>
    );
  return (
    <>
      <div className="payment-assurance">
        <ShieldCheck size={18} />
        <span>
          Sandbox only. Buyer approval is required. No live funds move.
        </span>
      </div>
      <div ref={container} />
      {busy && (
        <p className="muted">
          <LoaderCircle className="spin" size={16} /> Verifying and confirming
          payment…
        </p>
      )}
      {receipt && (
        <p className="notice">Payment is pending. It is not marked paid.</p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="text-button" onClick={complete} disabled={busy}>
            Reconcile / retry this purchase
          </button>
        </div>
      )}
    </>
  );
}
