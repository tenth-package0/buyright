import { employeeSchema, type Employee } from "./engine";
export function parseRoster(text: string): Employee[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closedQuote = true;
      } else if (!field && !closedQuote) {
        quoted = true;
      } else {
        throw new Error("CSV has a quote outside a quoted field.");
      }
    } else if (c === "," && !quoted) {
      row.push(field.trim());
      field = "";
      closedQuote = false;
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
    } else if (closedQuote && c !== " " && c !== "\t") {
      throw new Error("CSV has text after a closing quote.");
    } else if (!closedQuote) {
      field += c;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const header = rows
    .shift()
    ?.map((v) => v.replace(/^\uFEFF/, "").trim().toLowerCase());
  if (!header || !["name", "team", "profile"].every((k) => header.includes(k)))
    throw new Error("CSV needs name, team, profile columns.");
  if (new Set(header).size !== header.length)
    throw new Error("CSV column names must be unique.");
  if (rows.length < 1 || rows.length > 50)
    throw new Error("Import between 1 and 50 employees.");
  return rows.map((r, i) => {
    if (r.length !== header.length)
      throw new Error(`CSV row ${i + 2} has ${r.length} columns; expected ${header.length}.`);
    return employeeSchema.parse({
      id: `csv-${i + 1}`,
      name: r[header.indexOf("name")],
      team: r[header.indexOf("team")],
      profile: r[header.indexOf("profile")],
      productId: "anker-575",
    });
  });
}
