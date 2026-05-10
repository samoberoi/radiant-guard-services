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

function friendlyDbError(
  e: unknown,
  kind: "branch" | "customer" | "unit",
): string {
  const msg = errMsg(e, "");
  if (/duplicate key/i.test(msg) || /unique/i.test(msg)) {
    if (kind === "branch") {
      if (/state/i.test(msg)) return "State already mapped to a branch";
      return "Branch code already exists";
    }
    if (kind === "unit") return "Unit code already exists";
    if (/name/i.test(msg)) return "Organisation name already exists";
    return "Organisation ID already exists";
  }
  return msg || "Something went wrong";
}

// ───────────────────────── Units ─────────────────────────

export type ReportingOfficer = {
  name: string;
  isPrimary: boolean;
  isActive: boolean;
};

export type Unit = {
  id: string;
  code: string;
  name: string;
  location: string;
  description: string;
  status: CustomerStatus;
  branchId: string | null;
  customerId: string | null;
  onboardingDate: string;
  closingDate: string;
  panNumber: string;
  gstNumber: string;
  billingSalutation: string;
  billingName: string;
  billingAddress1: string;
  billingAddress2: string;
  billingPincode: string;
  billingCity: string;
  billingDistrict: string;
  billingState: string;
  billingCountry: string;
  shippingSameAsBilling: boolean;
  shippingSameAsOrg: boolean;
  shippingSalutation: string;
  shippingName: string;
  shippingAddress1: string;
  shippingAddress2: string;
  shippingPincode: string;
  shippingCity: string;
  shippingDistrict: string;
  shippingState: string;
  shippingCountry: string;
  reportingOfficers: ReportingOfficer[];
  emergencyContactName: string;
  emergencyContactMobile: string;
  nearbyHospitalName: string;
  nearbyHospitalMobile: string;
  ambulanceName: string;
  ambulanceMobile: string;
};

export function nextUnitCode(units: { code: string }[]) {
  const nums = units
    .map((u) => parseInt(u.code.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `UN${max + 1}`;
}

const QK_UNITS = ["admin", "units"] as const;

type UnitRow = {
  id: string;
  code: string;
  name: string | null;
  location: string | null;
  description: string | null;
  status: CustomerStatus;
  branch_id: string | null;
  customer_id: string | null;
  onboarding_date: string | null;
  closing_date: string | null;
  pan_number: string | null;
  gst_number: string | null;
  billing_salutation: string | null;
  billing_name: string | null;
  billing_address1: string | null;
  billing_address2: string | null;
  billing_pincode: string | null;
  billing_city: string | null;
  billing_district: string | null;
  billing_state: string | null;
  billing_country: string | null;
  shipping_same_as_billing: boolean;
  shipping_same_as_org: boolean;
  shipping_salutation: string | null;
  shipping_name: string | null;
  shipping_address1: string | null;
  shipping_address2: string | null;
  shipping_pincode: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  shipping_state: string | null;
  shipping_country: string | null;
  reporting_officers: unknown;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
  nearby_hospital_name: string | null;
  nearby_hospital_mobile: string | null;
  ambulance_name: string | null;
  ambulance_mobile: string | null;
};

function rowToUnit(r: UnitRow): Unit {
  const officersRaw = Array.isArray(r.reporting_officers)
    ? (r.reporting_officers as Array<Record<string, unknown>>)
    : [];
  const reportingOfficers: ReportingOfficer[] = officersRaw.map((o) => ({
    name: typeof o.name === "string" ? o.name : "",
    isPrimary: Boolean(o.is_primary ?? o.isPrimary),
    isActive: o.is_active === undefined && o.isActive === undefined ? true : Boolean(o.is_active ?? o.isActive),
  }));
  return {
    id: r.id,
    code: r.code,
    name: r.name ?? "",
    location: r.location ?? "",
    description: r.description ?? "",
    status: r.status,
    branchId: r.branch_id,
    customerId: r.customer_id,
    onboardingDate: r.onboarding_date ?? "",
    closingDate: r.closing_date ?? "",
    panNumber: r.pan_number ?? "",
    gstNumber: r.gst_number ?? "",
    billingSalutation: r.billing_salutation ?? "",
    billingName: r.billing_name ?? "",
    billingAddress1: r.billing_address1 ?? "",
    billingAddress2: r.billing_address2 ?? "",
    billingPincode: r.billing_pincode ?? "",
    billingCity: r.billing_city ?? "",
    billingDistrict: r.billing_district ?? "",
    billingState: r.billing_state ?? "",
    billingCountry: r.billing_country ?? "India",
    shippingSameAsBilling: r.shipping_same_as_billing,
    shippingSameAsOrg: r.shipping_same_as_org,
    shippingSalutation: r.shipping_salutation ?? "",
    shippingName: r.shipping_name ?? "",
    shippingAddress1: r.shipping_address1 ?? "",
    shippingAddress2: r.shipping_address2 ?? "",
    shippingPincode: r.shipping_pincode ?? "",
    shippingCity: r.shipping_city ?? "",
    shippingDistrict: r.shipping_district ?? "",
    shippingState: r.shipping_state ?? "",
    shippingCountry: r.shipping_country ?? "India",
    reportingOfficers,
    emergencyContactName: r.emergency_contact_name ?? "",
    emergencyContactMobile: r.emergency_contact_mobile ?? "",
    nearbyHospitalName: r.nearby_hospital_name ?? "",
    nearbyHospitalMobile: r.nearby_hospital_mobile ?? "",
    ambulanceName: r.ambulance_name ?? "",
    ambulanceMobile: r.ambulance_mobile ?? "",
  };
}

function unitToRow(data: Omit<Unit, "id">) {
  const code = data.code.trim();
  if (!code) throw new Error("Unit code is required");
  if (!data.name.trim()) throw new Error("Unit name is required");
  return {
    code,
    name: data.name.trim(),
    location: data.location.trim(),
    description: data.description.trim(),
    status: data.status,
    branch_id: data.branchId || null,
    customer_id: data.customerId || null,
    onboarding_date: data.onboardingDate || null,
    closing_date: data.closingDate || null,
    pan_number: data.panNumber.trim(),
    gst_number: data.gstNumber.trim(),
    billing_salutation: data.billingSalutation,
    billing_name: data.billingName,
    billing_address1: data.billingAddress1,
    billing_address2: data.billingAddress2,
    billing_pincode: data.billingPincode,
    billing_city: data.billingCity,
    billing_district: data.billingDistrict,
    billing_state: data.billingState,
    billing_country: data.billingCountry || "India",
    shipping_same_as_billing: data.shippingSameAsBilling,
    shipping_same_as_org: data.shippingSameAsOrg,
    shipping_salutation: data.shippingSalutation,
    shipping_name: data.shippingName,
    shipping_address1: data.shippingAddress1,
    shipping_address2: data.shippingAddress2,
    shipping_pincode: data.shippingPincode,
    shipping_city: data.shippingCity,
    shipping_district: data.shippingDistrict,
    shipping_state: data.shippingState,
    shipping_country: data.shippingCountry || "India",
    reporting_officers: data.reportingOfficers.map((o) => ({
      name: o.name,
      is_primary: o.isPrimary,
      is_active: o.isActive,
    })),
    emergency_contact_name: data.emergencyContactName,
    emergency_contact_mobile: data.emergencyContactMobile,
    nearby_hospital_name: data.nearbyHospitalName,
    nearby_hospital_mobile: data.nearbyHospitalMobile,
    ambulance_name: data.ambulanceName,
    ambulance_mobile: data.ambulanceMobile,
  };
}

export function useUnits() {
  const qc = useQueryClient();

  const { data: units = [] } = useQuery({
    queryKey: QK_UNITS,
    queryFn: async (): Promise<Unit[]> => {
      const { data, error } = await supabase.from("units").select("*");
      if (error) throw error;
      return ((data ?? []) as UnitRow[]).map(rowToUnit);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK_UNITS });

  const addMut = useMutation({
    mutationFn: async (data: Omit<Unit, "id">) => {
      const { error } = await supabase.from("units").insert(unitToRow(data));
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Omit<Unit, "id"> }) => {
      const { error } = await supabase
        .from("units")
        .update(unitToRow(data))
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addUnit = async (data: Omit<Unit, "id">): Promise<Result> => {
    try {
      await addMut.mutateAsync(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "unit") };
    }
  };

  const updateUnit = async (id: string, data: Omit<Unit, "id">): Promise<Result> => {
    try {
      await updateMut.mutateAsync({ id, data });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyDbError(e, "unit") };
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
    } catch (e) {
      throw new Error(errMsg(e, "Could not delete unit"));
    }
  };

  return { units, addUnit, updateUnit, deleteUnit };
}
