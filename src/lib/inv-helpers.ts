import { supabase } from "@/integrations/supabase/client";

export type LocationType = "warehouse" | "branch" | "field_officer" | "guard" | "scrap";

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  warehouse: "Warehouse",
  branch: "Branch",
  field_officer: "Field Officer",
  guard: "Guard",
  scrap: "Scrap / Write-off",
};

export async function nextSeq(seqName: string): Promise<number> {
  const { data, error } = await supabase.rpc("nextval" as never, { sequence_name: seqName } as never);
  if (error) throw error;
  return Number(data ?? 0);
}

export function fmtNumber(prefix: string, n: number, width = 4): string {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export type Movement = {
  movement_type: string;
  location_type: LocationType;
  location_id: string;
  item_id: string;
  size_value?: string;
  qty_change: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
};

export async function postMovements(rows: Movement[]) {
  if (!rows.length) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  const payload = rows.map((r) => ({
    movement_type: r.movement_type,
    location_type: r.location_type,
    location_id: r.location_id,
    item_id: r.item_id,
    size_value: r.size_value ?? "",
    qty_change: r.qty_change,
    reference_type: r.reference_type ?? "",
    reference_id: r.reference_id ?? null,
    notes: r.notes ?? "",
    created_by: uid,
  }));
  const { error } = await supabase.from("inv_stock_movements" as never).insert(payload as never);
  if (error) throw error;
}

export async function getBalance(
  location_type: LocationType,
  location_id: string,
  item_id: string,
  size_value = "",
): Promise<number> {
  const { data, error } = await supabase
    .from("inv_stock_balances" as never)
    .select("qty")
    .eq("location_type", location_type)
    .eq("location_id", location_id)
    .eq("item_id", item_id)
    .eq("size_value", size_value)
    .maybeSingle();
  if (error) throw error;
  return Number((data as unknown as { qty?: number } | null)?.qty ?? 0);
}

export const STATUS_BADGE: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  open: "bg-blue-500/15 text-blue-700",
  partially_received: "bg-amber-500/15 text-amber-700",
  received: "bg-emerald-500/15 text-emerald-700",
  closed: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-rose-500/15 text-rose-700",
  in_transit: "bg-amber-500/15 text-amber-700",
  dispatched: "bg-amber-500/15 text-amber-700",
  issued: "bg-blue-500/15 text-blue-700",
  acknowledged: "bg-emerald-500/15 text-emerald-700",
  approved: "bg-emerald-500/15 text-emerald-700",
  pending: "bg-amber-500/15 text-amber-700",
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "bg-secondary text-muted-foreground";
}
