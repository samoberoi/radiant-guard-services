import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, SUPER_ADMIN_PHONE } from "@/lib/auth";

/**
 * Returns the current user's auth uid, role_key, and convenience flags.
 * Used for row-level filtering on the client (RLS is broader: branch-scoped).
 */
export function useCurrentUserRole() {
  const { user } = useAuth();
  const phone = user?.phone?.replace(/\D/g, "").slice(-10) ?? "";
  const isSuperAdmin = phone === SUPER_ADMIN_PHONE;

  const q = useQuery({
    queryKey: ["current-user-role", phone],
    enabled: !!phone && !isSuperAdmin,
    queryFn: async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: cand } = await supabase
        .from("candidates")
        .select("id,role_key")
        .eq("mobile", phone)
        .maybeSingle();
      return {
        userId: authUser?.id ?? null,
        roleKey: (cand?.role_key as string | undefined) ?? null,
      };
    },
  });

  const userId = q.data?.userId ?? null;
  const roleKey = q.data?.roleKey ?? null;
  return {
    isLoading: q.isLoading,
    userId,
    roleKey,
    isSuperAdmin,
    isFieldOfficer: !isSuperAdmin && roleKey === "field_officer",
  };
}
