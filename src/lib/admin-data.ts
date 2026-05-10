import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cloud-backed admin data store.
 * Tables: public.states, public.branches, public.customers
 * RLS: any authenticated user has full access (pre-launch admin tooling).
 */

export type State = { id: string; name: string };

export type Branch = {
  id: string;
  code: string;
  name: string;
  description: string;
  stateId: string;
};

export type CustomerStatus = "active" | "inactive";

export type Customer = {
  id: string;
  code: string;
  name: string;
  website: string;
  phone: string;
  address: string;
  contractStartDate: string; // yyyy-mm-dd or ""
  status: CustomerStatus;
};

type Result = { ok: true } | { ok: false; error: string };

const QK = {
  states: ["admin", "states"] as const,
  branches: ["admin", "branches"] as const,
  customers: ["admin", "customers"] as const,
};

function errMsg(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

// ───────────────────────── States ─────────────────────────

export function useStates() {
  const qc = useQueryClient();

  const { data: states = [] } = useQuery({
    queryKey: QK.states,
    queryFn: async (): Promise<State[]> => {
      const { data, error } = await supabase
        .from("states")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK.states });

  const addMut = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase.from("states").insert({ name: trimmed });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase
        .from("states")
        .update({ name: trimmed })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("states").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addState = async (name: string): Promise<Result> => {
    try {
      await addMut.mutateAsync(name);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e, "Could not add state") };
    }
  };

  const updateState = async (id: string, name: string): Promise<Result> => {
    try {
      await updateMut.mutateAsync({ id, name });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e, "Could not update state") };
    }
  };

  const deleteState = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch (e) {
      throw new Error(errMsg(e, "Could not delete state"));
    }
  };

  return { states, addState, updateState, deleteState };
}

// ───────────────────────── Branches ─────────────────────────

export function useBranches() {
  const qc = useQueryClient();

  const { data: branches = [] } = useQuery({
    queryKey: QK.branches,
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name, description, state_id");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name ?? "",
        description: r.description ?? "",
        stateId: r.state_id,
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK.branches });

  const addMut = useMutation({
    mutationFn: async (data: Omit<Branch, "id">) => {
      const code = data.code.trim();
      if (!code) throw new Error("Branch code is required");
      if (!data.stateId) throw new Error("Pick a state");
      const { error } = await supabase.from("branches").insert({
        code,
        name: data.name.trim(),
        description: data.description.trim(),
        state_id: data.stateId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Omit<Branch, "id"> }) => {
      const code = data.code.trim();
      if (!code) throw new Error("Branch code is required");
      if (!data.stateId) throw new Error("Pick a state");
      const { error } = await supabase
        .from("branches")
        .update({
          code,
          name: data.name.trim(),
          description: data.description.trim(),
          state_id: data.stateId,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addBranch = async (data: Omit<Branch, "id">): Promise<Result> => {
    try {
      await addMut.mutateAsync(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "branch") };
    }
  };

  const updateBranch = async (
    id: string,
    data: Omit<Branch, "id">,
  ): Promise<Result> => {
    try {
      await updateMut.mutateAsync({ id, data });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "branch") };
    }
  };

  const deleteBranch = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch (e) {
      throw new Error(errMsg(e, "Could not delete branch"));
    }
  };

  return { branches, addBranch, updateBranch, deleteBranch };
}

// ───────────────────────── Customers ─────────────────────────

export function nextCustomerCode(customers: { code: string }[]) {
  const nums = customers
    .map((c) => parseInt(c.code.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ORG${max + 1}`;
}

export function useCustomers() {
  const qc = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: QK.customers,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, code, name, website, phone, address, contract_start_date, status",
        );
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        website: r.website ?? "",
        phone: r.phone ?? "",
        address: r.address ?? "",
        contractStartDate: r.contract_start_date ?? "",
        status: r.status as CustomerStatus,
      }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK.customers });

  const addMut = useMutation({
    mutationFn: async (data: Omit<Customer, "id">) => {
      const code = data.code.trim();
      const name = data.name.trim();
      if (!code) throw new Error("Organisation ID is required");
      if (!name) throw new Error("Organisation name is required");
      const { error } = await supabase.from("customers").insert({
        code,
        name,
        website: data.website.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        contract_start_date: data.contractStartDate || null,
        status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Omit<Customer, "id">;
    }) => {
      const code = data.code.trim();
      const name = data.name.trim();
      if (!code) throw new Error("Organisation ID is required");
      if (!name) throw new Error("Organisation name is required");
      const { error } = await supabase
        .from("customers")
        .update({
          code,
          name,
          website: data.website.trim(),
          phone: data.phone.trim(),
          address: data.address.trim(),
          contract_start_date: data.contractStartDate || null,
          status: data.status,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addCustomer = async (data: Omit<Customer, "id">): Promise<Result> => {
    try {
      await addMut.mutateAsync(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "customer") };
    }
  };

  const updateCustomer = async (
    id: string,
    data: Omit<Customer, "id">,
  ): Promise<Result> => {
    try {
      await updateMut.mutateAsync({ id, data });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "customer") };
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch (e) {
      throw new Error(errMsg(e, "Could not delete customer"));
    }
  };

  return { customers, addCustomer, updateCustomer, deleteCustomer };
}

function friendlyDbError(e: unknown, kind: "branch" | "customer"): string {
  const msg = errMsg(e, "");
  if (/duplicate key/i.test(msg) || /unique/i.test(msg)) {
    if (kind === "branch") {
      if (/state/i.test(msg)) return "State already mapped to a branch";
      return "Branch code already exists";
    }
    if (/name/i.test(msg)) return "Organisation name already exists";
    return "Organisation ID already exists";
  }
  return msg || "Something went wrong";
}
