import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VehicleOption = {
  id: string;
  vehicle_number: string;
  name: string;
  owner?: string;
  type?: string;
  fuel_type?: string;
  brand?: string;
  make?: string;
  year?: number | null;
  color?: string;
  engine_number?: string;
  chassis_number?: string;
  registration_date?: string | null;
};

export function useVehicleOptions() {
  return useQuery({
    queryKey: ["admin", "vehicles", "options"],
    queryFn: async (): Promise<VehicleOption[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select(
          "id,vehicle_number,name,owner,type,fuel_type,brand,make,year,color,engine_number,chassis_number,registration_date,enabled",
        )
        .order("vehicle_number", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[])
        .filter((r) => Boolean(r.enabled ?? true))
        .map((r) => ({
          id: String(r.id),
          vehicle_number: String(r.vehicle_number ?? ""),
          name: String(r.name ?? ""),
          owner: String(r.owner ?? ""),
          type: String(r.type ?? ""),
          fuel_type: String(r.fuel_type ?? ""),
          brand: String(r.brand ?? ""),
          make: String(r.make ?? ""),
          year: r.year == null ? null : Number(r.year),
          color: String(r.color ?? ""),
          engine_number: String(r.engine_number ?? ""),
          chassis_number: String(r.chassis_number ?? ""),
          registration_date: (r.registration_date as string) ?? null,
        }));
    },
  });
}

export function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}

export function vehicleLabel(v: { vehicle_number: string; name?: string }) {
  return v.name ? `${v.vehicle_number} — ${v.name}` : v.vehicle_number;
}

/** Format ISO date (YYYY-MM-DD) as DD/MM/YYYY */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Shared vehicle detail columns reused across FastTag / Insurance / PUC / Service tables. */
const DETAIL_LABELS = [
  "Owner",
  "Type",
  "Fuel",
  "Brand",
  "Make / Model",
  "Year",
  "Color",
  "Engine No.",
  "Chassis No.",
  "Reg. Date",
] as const;

export const VEHICLE_DETAIL_COLUMN_COUNT = DETAIL_LABELS.length;

export function VehicleDetailHeaders({ thClassName = "px-5 py-3 whitespace-nowrap" }: { thClassName?: string } = {}) {
  return (
    <>
      {DETAIL_LABELS.map((l) => (
        <th key={l} className={thClassName}>{l}</th>
      ))}
    </>
  );
}

export function VehicleDetailCells({
  v,
  tdClassName = "px-5 py-3 text-foreground/90 whitespace-nowrap",
}: { v: VehicleOption | undefined; tdClassName?: string }) {
  const cells: (string | number)[] = [
    v?.owner || "—",
    v?.type || "—",
    v?.fuel_type || "—",
    v?.brand || "—",
    [v?.make, v?.name].filter(Boolean).join(" ") || "—",
    v?.year ?? "—",
    v?.color || "—",
    v?.engine_number || "—",
    v?.chassis_number || "—",
    fmtDate(v?.registration_date ?? null),
  ];
  return (
    <>
      {cells.map((c, i) => (
        <td key={i} className={tdClassName}>{c}</td>
      ))}
    </>
  );
}
