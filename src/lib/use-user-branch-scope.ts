import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, SUPER_ADMIN_PHONE } from "@/lib/auth";

export type UserBranchScope = {
  isLoading: boolean;
  isScoped: boolean;        // true if the current user is locked to a single branch
  branchId: string | null;  // the branch UUID they are scoped to
  branchLabel: string;      // human label, e.g. "BR2 – BANGALORE"
};

/**
 * Returns the branch scope for the current logged-in user.
 * - Super admin: not scoped (sees everything).
 * - Users with a `branch` row in `employee_scope_assignments`: scoped to that branch.
 * - Everyone else: not scoped.
 */
export function useUserBranchScope(): UserBranchScope {
  const { user } = useAuth();
  const phone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";
  const isSuperAdmin = phone === SUPER_ADMIN_PHONE;

  const q = useQuery({
    queryKey: ["user-branch-scope", phone],
    enabled: !!phone && !isSuperAdmin,
    queryFn: async () => {
      const { data: cand, error: cErr } = await supabase
        .from("candidates")
        .select("id")
        .eq("mobile", phone)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cand?.id) return null;
      const { data, error } = await supabase
        .from("employee_scope_assignments")
        .select("scope_id,scope_label")
        .eq("candidate_id", cand.id)
        .eq("scope_type", "branch")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  if (isSuperAdmin) {
    return { isLoading: false, isScoped: false, branchId: null, branchLabel: "" };
  }
  if (q.isLoading) {
    return { isLoading: true, isScoped: false, branchId: null, branchLabel: "" };
  }
  if (q.data?.scope_id) {
    return {
      isLoading: false,
      isScoped: true,
      branchId: q.data.scope_id as string,
      branchLabel: (q.data.scope_label as string) || "",
    };
  }
  return { isLoading: false, isScoped: false, branchId: null, branchLabel: "" };
}
