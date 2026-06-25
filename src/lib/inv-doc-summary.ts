import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LineRow = { doc_id: string; item_id: string; size_value: string | null; qty: number };

const TABLE_CONFIG = {
  inv_po_lines: { fk: "po_id", qty: "ordered_qty" },
  inv_demand_lines: { fk: "demand_id", qty: "requested_qty" },
  inv_transfer_lines: { fk: "transfer_id", qty: "qty" },
  inv_issuance_lines: { fk: "issuance_id", qty: "qty" },
  inv_goods_receipt_lines: { fk: "grn_id", qty: "received_qty" },
} as const;

type LineTable = keyof typeof TABLE_CONFIG;

/**
 * Build a one-line item summary per document for use inside dropdown labels.
 * Returns Map<docId, "Khaki Shirt (M) ×5, Cap ×2"> (capped to 3 items + "…").
 */
export function useDocItemSummaries(table: LineTable, docIds: string[]) {
  const cfg = TABLE_CONFIG[table];
  const ids = Array.from(new Set(docIds.filter(Boolean))).sort();
  const key = ids.join(",");

  return useQuery({
    queryKey: ["inv", "doc-summary", table, key],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [linesRes, itemsRes] = await Promise.all([
        supabase
          .from(table as never)
          .select(`${cfg.fk},item_id,size_value,${cfg.qty}`)
          .in(cfg.fk, ids),
        supabase
          .from("inv_items" as never)
          .select("id,name,item_code"),
      ]);
      const items = new Map<string, { name: string; code: string }>(
        ((itemsRes.data ?? []) as Array<{ id: string; name: string; item_code: string }>)
          .map((i) => [i.id, { name: i.name, code: i.item_code }]),
      );
      const grouped = new Map<string, LineRow[]>();
      for (const raw of (linesRes.data ?? []) as Array<Record<string, unknown>>) {
        const docId = String(raw[cfg.fk] ?? "");
        if (!docId) continue;
        const arr = grouped.get(docId) ?? [];
        arr.push({
          doc_id: docId,
          item_id: String(raw.item_id ?? ""),
          size_value: (raw.size_value ?? null) as string | null,
          qty: Number(raw[cfg.qty] ?? 0),
        });
        grouped.set(docId, arr);
      }
      const out = new Map<string, string>();
      for (const [docId, lines] of grouped) {
        const parts = lines.slice(0, 3).map((l) => {
          const it = items.get(l.item_id);
          const name = it?.name ?? "Item";
          const sz = l.size_value ? ` (${l.size_value})` : "";
          return `${name}${sz} ×${l.qty}`;
        });
        if (lines.length > 3) parts.push(`+${lines.length - 3} more`);
        out.set(docId, parts.join(", "));
      }
      return out;
    },
    staleTime: 30_000,
  });
}
