import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VehicleOption = { id: string; vehicle_number: string; name: string; engine_number?: string; chassis_number?: string };

export function useVehicleOptions() {
  return useQuery({
    queryKey: ["admin", "vehicles", "options"],
    queryFn: async (): Promise<VehicleOption[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number,name,engine_number,chassis_number,enabled")
        .order("vehicle_number", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[])
        .filter((r) => Boolean(r.enabled ?? true))
        .map((r) => ({
          id: String(r.id),
          vehicle_number: String(r.vehicle_number ?? ""),
          name: String(r.name ?? ""),
          engine_number: String(r.engine_number ?? ""),
          chassis_number: String(r.chassis_number ?? ""),
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
