"use client";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { Check, X, ChevronRight, CircleHelp } from "lucide-react";
import { profiles, products } from "@/lib/buyright/catalog";
import { money, evaluateEmployee } from "@/lib/buyright/engine";
ModuleRegistry.registerModules([AllCommunityModule]);
type Row = ReturnType<typeof evaluateEmployee>;
const gridTheme = themeQuartz.withParams({
  accentColor: "#265345",
  backgroundColor: "#ffffff",
  foregroundColor: "#233b32",
  borderColor: "#e6e9e4",
  headerBackgroundColor: "#f8f9f6",
  headerTextColor: "#7b847e",
  fontFamily: "Arial, sans-serif",
  fontSize: 12,
  headerFontSize: 10,
  rowBorder: { color: "#edf0eb" },
  wrapperBorder: false,
  cellHorizontalPadding: 20,
});
export default function Matrix({
  rows,
  onSelect,
  onChange,
}: {
  rows: Row[];
  onSelect: (id: string) => void;
  onChange: (id: string, key: "profile" | "productId", value: string) => void;
}) {
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        headerName: "TEAM MEMBER",
        field: "employee.name",
        minWidth: 190,
        flex: 1.2,
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data && (
            <button
              className="person-cell"
              onClick={() => onSelect(data.employee.id)}
            >
              <span
                className={`person-avatar avatar-${data.employee.team.toLowerCase()}`}
              >
                {data.employee.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{data.employee.name}</strong>
                <small>{data.employee.team}</small>
              </span>
            </button>
          ),
      },
      {
        headerName: "HOST COMPUTER",
        minWidth: 180,
        flex: 1.2,
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data && (
            <select
              className="grid-select"
              aria-label={`Host for ${data.employee.name}`}
              value={data.employee.profile}
              onChange={(e) =>
                onChange(data.employee.id, "profile", e.target.value)
              }
            >
              {Object.entries(profiles).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.short}
                </option>
              ))}
            </select>
          ),
      },
      {
        headerName: "PROPOSED DOCK",
        minWidth: 180,
        flex: 1.2,
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data && (
            <div className="dock-cell">
              <select
                className="grid-select"
                aria-label={`Dock for ${data.employee.name}`}
                value={data.employee.productId}
                onChange={(e) =>
                  onChange(data.employee.id, "productId", e.target.value)
                }
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <small>{money(data.product.priceCents)} / unit</small>
            </div>
          ),
      },
      {
        headerName: "VERIFICATION",
        minWidth: 165,
        flex: 1,
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data && (
            <button
              className={`status ${data.status}`}
              onClick={() => onSelect(data.employee.id)}
            >
              {data.status === "pass" ? (
                <Check size={12} />
              ) : data.status === "fail" ? (
                <X size={12} />
              ) : (
                <CircleHelp size={12} />
              )}{" "}
              {data.status === "pass"
                ? "Verified"
                : data.status === "fail"
                  ? "Conflict"
                  : "Needs evidence"}
            </button>
          ),
      },
      {
        headerName: "EVIDENCE",
        width: 106,
        sortable: false,
        cellRenderer: ({ data }: ICellRendererParams<Row>) =>
          data && (
            <button
              className="evidence-button"
              aria-label={`View evidence for ${data.employee.name}`}
              onClick={() => onSelect(data.employee.id)}
            >
              Review <ChevronRight size={14} />
            </button>
          ),
      },
    ],
    [onChange, onSelect],
  );
  return (
    <div
      className="grid-container"
      style={{ height: Math.max(180, Math.min(650, rows.length * 78 + 42)) }}
    >
      <AgGridReact<Row>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.employee.id}
        rowHeight={78}
        headerHeight={42}
        defaultColDef={{
          sortable: true,
          resizable: true,
          suppressMovable: true,
        }}
        overlayNoRowsTemplate="<span>No matching teammates. Change the filter or search.</span>"
      />
    </div>
  );
}
