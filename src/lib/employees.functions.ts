import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CandidateListItem = {
  id: string;
  aadhaar_number: string;
  full_name: string;
  photo_url: string;
  mobile: string;
  email: string;
  unit_id: string | null;
  designation_id: string | null;
  status: string;
};

export type UnitLite = {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  customer_name?: string;
};

export type DesignationLite = { id: string; name: string; code: string };

export const getEmployeesPageData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [{ data: candidates, error: candidatesError }, { data: units, error: unitsError }, { data: designations, error: designationsError }] =
      await Promise.all([
        supabase
          .from("candidates" as never)
          .select("id,aadhaar_number,full_name,photo_url,mobile,email,unit_id,designation_id,status")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase.from("units" as never).select("id,code,name,customer_id").order("name", { ascending: true }).limit(2000),
        supabase
          .from("designations" as never)
          .select("id,name,code,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500),
      ]);

    if (candidatesError) throw candidatesError;
    if (unitsError) throw unitsError;
    if (designationsError) throw designationsError;

    const unitRows = ((units as unknown) as UnitLite[]) ?? [];
    const customerIds = Array.from(new Set(unitRows.map((unit) => unit.customer_id).filter(Boolean))) as string[];

    let customerNameById = new Map<string, string>();
    if (customerIds.length) {
      const { data: customers, error: customersError } = await supabase
        .from("customers" as never)
        .select("id,name")
        .in("id", customerIds);

      if (customersError) throw customersError;

      customerNameById = new Map(
        (((customers ?? []) as Array<{ id: string; name: string }>)).map((customer) => [customer.id, customer.name]),
      );
    }

    return {
      candidates: ((candidates as unknown) as CandidateListItem[]) ?? [],
      units: unitRows.map((unit) => ({
        ...unit,
        customer_name: unit.customer_id ? customerNameById.get(unit.customer_id) ?? "" : "",
      })),
      designations: (((designations ?? []) as unknown) as DesignationLite[]) ?? [],
    };
  });