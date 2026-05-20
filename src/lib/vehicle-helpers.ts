import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VehicleOption = { id: string; vehicle_number: string; name: string };

export function useVehicleOptions() {
  return useQuery({
    queryKey: ["admin", "vehicles", "options"],
    queryFn: async (): Promise<VehicleOption[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number,name,enabled")
        .order("vehicle_number", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[])
        .filter((r) => Boolean(r.enabled ?? true))
        .map((r) => ({
          id: String(r.id),
          vehicle_number: String(r.vehicle_number ?? ""),
          name: String(r.name ?? ""),
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
