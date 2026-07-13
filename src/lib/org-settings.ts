import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrgSettings = {
  id: string;
  company_name: string | null;
  company_gstin: string | null;
  company_state: string | null;
  company_state_code: string | null;
};

export function useOrgSettings() {
  return useQuery({
    queryKey: ["org_settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<OrgSettings | null> => {
      const { data } = await supabase
        .from("org_settings" as never)
        .select("id, company_name, company_gstin, company_state, company_state_code")
        .maybeSingle();
      return (data as unknown) as OrgSettings | null;
    },
  });
}
