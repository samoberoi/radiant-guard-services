import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ComplianceSection,
  KnowledgeSection,
  PhysicalSection,
  IdentificationSection,
  CriminalSection,
  OtherSection,
  ListSection,
} from "@/components/candidate-extra-sections";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Check,
  CheckCircle2,
  Edit2,
  FileSignature,
  FileText,
  IdCard,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { SignDocumentDialog } from "@/components/SignDocumentDialog";
import type { DocType } from "@/lib/company-documents";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { extractAadhaar, type AadhaarExtraction } from "@/lib/aadhaar.functions";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/employees")({
  component: EmployeesPage,
});

// ---------------- Reference lists ---------------- //
const RELIGIONS = [
  "Hindu",
  "Muslim",
  "Christian",
  "Sikh",
  "Buddhist",
  "Jain",
  "Parsi",
  "Jewish",
  "Other",
];
const CASTE_CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed", "Separated"];
const GENDERS = ["Male", "Female", "Other"];
const MOCK_OTP = "1111";

const getAadhaarOcrClient = createClientOnlyFn(() => import("@/lib/aadhaar-ocr.client"));

// ---------------- Types ---------------- //
type AddressBlock = {
  address1: string;
  address2: string;
  landmark: string;
  pincode: string;
  city: string;
  district: string;
  state: string;
  country: string;
};

type Candidate = {
  id: string;
  candidate_code: string;
  rejection_reason: string;
  aadhaar_number: string;
  full_name: string;
  photo_url: string;
  aadhaar_image_url: string;
  signature_url: string;
  date_of_birth: string | null;
  gender: string;
  religion: string;
  caste_category: string;
  marital_status: string;
  birthplace: string;
  mobile: string;
  alt_mobile: string;
  email: string;
  // Permanent address (structured)
  permanent_address1: string;
  permanent_address2: string;
  permanent_landmark: string;
  permanent_pincode: string;
  permanent_city: string;
  permanent_district: string;
  permanent_state: string;
  permanent_country: string;
  permanent_police_station: string;
  // Present address (structured)
  present_address1: string;
  present_address2: string;
  present_landmark: string;
  present_pincode: string;
  present_city: string;
  present_district: string;
  present_state: string;
  present_country: string;
  present_police_station: string;
  same_as_permanent: boolean;
  // PAN
  pan_number: string;
  pan_image_url: string;
  // Bank Details
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  bank_account_type: string;
  // Emergency Contact (legacy, derived from primary contact on save)
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_mobile: string;
  // Contacts (list, one marked as emergency)
  contacts: CandidateContact[];
  // References
  references: CandidateReference[];
  // Ex-Service
  is_ex_service: boolean;
  ex_service_id: string | null;
  // Languages / Experiences / Education
  languages: string[];
  experiences: CandidateExperience[];
  educations: CandidateEducation[];
  application_date: string;
  preferred_joining_date: string | null;
  unit_id: string | null;
  designation_id: string | null;
  status: string;
  // Extended (JSONB) sections
  physical_health: Record<string, any>;
  compliance: Record<string, any>;
  identification_proofs: any[];
  criminal_history: { has_history: boolean; incidents: any[] };
  extra_curricular: any[];
  other_info: Record<string, any>;
  documents: any[];
  nominations: any[];
  kyc_completed: boolean;
};

type CandidateExperience = {
  company_name: string;
  designation: string;
  location: string;
  joined_date: string;
  resigned_date: string;
  reason: string;
  remarks: string;
};

type CandidateEducation = {
  education_name: string;
  university: string;
  course: string;
  institution: string;
  year_of_passing: string;
  percentage: string;
};

type CandidateReference = {
  name: string;
  relation_type: string;
  mobile: string;
  address: string;
};

type CandidateContact = {
  name: string;
  relation: string;
  mobile: string;
  is_emergency: boolean;
};

const RELATION_TYPES = ["Family", "Friend", "Colleague", "Neighbor", "Other"] as const;
const REFERENCE_RELATIONS = ["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend", "Colleague", "Neighbor", "Relative", "Other"] as const;
const BANK_ACCOUNT_TYPES = ["Savings", "Current", "Salary"] as const;

type CandidateListItem = Pick<
  Candidate,
  | "id"
  | "candidate_code"
  | "rejection_reason"
  | "aadhaar_number"
  | "full_name"
  | "photo_url"
  | "mobile"
  | "email"
  | "unit_id"
  | "designation_id"
  | "status"
> & { employee_code: string; role_key: string };

type RoleLite = { key: string; name: string };

type UnitLite = {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  customer_name?: string;
};

type DesignationLite = { id: string; name: string; code: string };
type ExServiceLite = { id: string; name: string; description: string };
type LanguageLite = { id: string; name: string };

const QK = ["admin", "candidates"] as const;
const QK_UNITS = ["admin", "units-lite"] as const;
const QK_DESIG = ["admin", "designations-lite"] as const;
const QK_EX_SERVICES = ["admin", "ex-services-lite"] as const;
const QK_LANGUAGES = ["admin", "languages-lite"] as const;

async function runWithQueryTimeout<T>(label: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} request timed out. Please retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------- Hooks ---------------- //
function useCandidates() {
  return useQuery({
    queryKey: QK,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<CandidateListItem[]> => {
      const { data, error } = await runWithQueryTimeout("Employees", async (signal) =>
        await supabase
          .from("candidates" as never)
          .select("id,candidate_code,employee_code,rejection_reason,aadhaar_number,full_name,photo_url,mobile,email,unit_id,designation_id,status,role_key")
          .order("created_at", { ascending: false })
          .limit(250)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as CandidateListItem[]) ?? [];
    },
  });
}

function useUnits() {
  return useQuery({
    queryKey: QK_UNITS,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<UnitLite[]> => {
      const { data, error } = await runWithQueryTimeout("Units", async (signal) =>
        await supabase
          .from("units" as never)
          .select("id,code,name,customer_id")
          .order("name", { ascending: true })
          .limit(2000)
          .abortSignal(signal),
      );
      if (error) throw error;
      const units = ((data as unknown) as UnitLite[]) ?? [];
      const custIds = Array.from(new Set(units.map((u) => u.customer_id).filter(Boolean))) as string[];
      let custMap = new Map<string, string>();
      if (custIds.length) {
        const { data: cs } = await runWithQueryTimeout("Customers", async (signal) =>
          await supabase
            .from("customers" as never)
            .select("id,name")
            .in("id", custIds)
            .abortSignal(signal),
        );
        custMap = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      }
      return units.map((u) => ({ ...u, customer_name: u.customer_id ? custMap.get(u.customer_id) ?? "" : "" }));
    },
  });
}

function useDesignations() {
  return useQuery({
    queryKey: QK_DESIG,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<DesignationLite[]> => {
      const { data, error } = await runWithQueryTimeout("Designations", async (signal) =>
        await supabase
          .from("designations" as never)
          .select("id,name,code,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as DesignationLite[]) ?? [];
    },
  });
}

function useExServices() {
  return useQuery({
    queryKey: QK_EX_SERVICES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<ExServiceLite[]> => {
      const { data, error } = await runWithQueryTimeout("Ex-Services", async (signal) =>
        await supabase
          .from("ex_services" as never)
          .select("id,name,description,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as ExServiceLite[]) ?? [];
    },
  });
}

function useLanguagesLite() {
  return useQuery({
    queryKey: QK_LANGUAGES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<LanguageLite[]> => {
      const { data, error } = await runWithQueryTimeout("Languages", async (signal) =>
        await supabase
          .from("languages" as never)
          .select("id,name,enabled")
          .eq("enabled", true)
          .order("name", { ascending: true })
          .limit(500)
          .abortSignal(signal),
      );
      if (error) throw error;
      return ((data as unknown) as LanguageLite[]) ?? [];
    },
  });
}

const QK_ROLES = ["admin", "roles-lite"] as const;
function useRolesLite() {
  return useQuery({
    queryKey: QK_ROLES,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<RoleLite[]> => {
      const { data, error } = await supabase
        .from("roles" as never)
        .select("key,name,sort_order")
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data as unknown) as RoleLite[]) ?? [];
    },
  });
}

function EmployeesPage() {
  const candidatesQuery = useCandidates();
  const unitsQuery = useUnits();
  const designationsQuery = useDesignations();
  const exServicesQuery = useExServices();
  const languagesQuery = useLanguagesLite();
  const rolesQuery = useRolesLite();
  const candidates = candidatesQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const designations = designationsQuery.data ?? [];
  const exServices = exServicesQuery.data ?? [];
  const languagesList = languagesQuery.data ?? [];
  const rolesList = rolesQuery.data ?? [];
  const isLoading = candidatesQuery.isLoading;
  const candidatesError = candidatesQuery.error;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"employee" | "candidate">("employee");
  const [openWizard, setOpenWizard] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [openingCandidateId, setOpeningCandidateId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CandidateListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CandidateListItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [signTarget, setSignTarget] = useState<{ id: string; docType: DocType } | null>(null);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const desigMap = useMemo(() => new Map(designations.map((d) => [d.id, d])), [designations]);

  const matchesSearch = (c: CandidateListItem) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.full_name, c.aadhaar_number, c.mobile, c.email, c.candidate_code, c.employee_code].some(
      (v) => (v ?? "").toLowerCase().includes(q),
    );
  };

  const employees = useMemo(
    () => candidates.filter((c) => (c.status === "approved" || c.status === "active") && matchesSearch(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, search],
  );
  const candidateRows = useMemo(
    () => candidates.filter((c) => c.status !== "approved" && c.status !== "active" && matchesSearch(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, search],
  );

  const stats = useMemo(() => {
    const total = candidates.length;
    const approved = candidates.filter((c) => c.status === "approved" || c.status === "active").length;
    const pending = candidates.filter((c) => c.status === "pending").length;
    const rejected = candidates.filter((c) => c.status === "rejected").length;
    const drafts = candidates.filter((c) => c.status === "draft").length;
    return { total, approved, pending, rejected, drafts };
  }, [candidates]);

  const deleteMut = useMutation({
    mutationFn: async (c: CandidateListItem) => {
      const { error } = await supabase.from("candidates" as never).delete().eq("id", c.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "delete",
        entityType: "candidate",
        entityId: c.id,
        entityLabel: c.full_name || c.aadhaar_number,
        before: c as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Candidate deleted");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const approveMut = useMutation({
    mutationFn: async (c: CandidateListItem) => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .update({ status: "approved", rejection_reason: "" } as unknown as never)
        .eq("id", c.id)
        .select("id,employee_code,full_name")
        .single();
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "approve",
        entityType: "candidate",
        entityId: c.id,
        entityLabel: c.full_name || c.aadhaar_number,
        after: data as unknown as Record<string, unknown>,
      });
      return data as { employee_code: string };
    },
    onSuccess: (data) => {
      toast.success(`Approved — ${data?.employee_code ?? "Employee code assigned"}`);
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approve failed"),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ c, reason }: { c: CandidateListItem; reason: string }) => {
      const { error } = await supabase
        .from("candidates" as never)
        .update({ status: "rejected", rejection_reason: reason } as unknown as never)
        .eq("id", c.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "reject",
        entityType: "candidate",
        entityId: c.id,
        entityLabel: c.full_name || c.aadhaar_number,
        after: { rejection_reason: reason },
      });
    },
    onSuccess: () => {
      toast.success("Candidate rejected");
      qc.invalidateQueries({ queryKey: QK });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reject failed"),
  });

  const openEditor = async (candidateId: string) => {
    setOpeningCandidateId(candidateId);
    try {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("*")
        .eq("id", candidateId)
        .single();
      if (error) throw error;
      setEditing((data as Candidate) ?? null);
      setOpenWizard(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open candidate");
    } finally {
      setOpeningCandidateId(null);
    }
  };

  const renderRows = (rows: CandidateListItem[], mode: "employee" | "candidate") => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
            Loading…
          </td>
        </tr>
      );
    }
    if (candidatesError) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
            {candidatesError instanceof Error
              ? candidatesError.message
              : "Could not load employees right now. Please retry."}
          </td>
        </tr>
      );
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
            {mode === "employee"
              ? "No employees yet. Approve a candidate to generate an Employee ID."
              : "No candidates here. Click "}
            {mode === "candidate" && <b>Add Candidate</b>}
            {mode === "candidate" && " to start."}
          </td>
        </tr>
      );
    }
    return rows.map((c) => {
      const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
      const desig = c.designation_id ? desigMap.get(c.designation_id) : undefined;
      const code = mode === "employee" ? c.employee_code || "—" : c.candidate_code || "—";
      return (
        <tr key={c.id} className="group transition-colors hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
          <td className="px-6 py-5">
            <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {code}
            </span>
          </td>
          <td className="px-6 py-5">
            <div className="flex items-center gap-3">
              {c.photo_url ? (
                <img
                  src={c.photo_url}
                  alt=""
                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover shadow-sm ring-2 ring-card"
                />
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground shadow-sm ring-2 ring-card">
                  <UserPlus className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold leading-tight text-foreground group-hover:text-amber-900 dark:group-hover:text-amber-300">
                  {c.full_name || "—"}
                </div>
                <div className="truncate text-xs text-muted-foreground">{c.email || "—"}</div>
              </div>
            </div>
          </td>
          <td className="px-6 py-5 font-mono text-xs text-muted-foreground">{maskAadhaar(c.aadhaar_number)}</td>
          <td className="px-6 py-5 text-center text-sm font-medium text-muted-foreground">{c.mobile || "—"}</td>
          <td className="px-6 py-5">
            {unit ? (
              <div>
                <div className="text-sm font-semibold text-foreground">{unit.name}</div>
                <div className="text-xs text-muted-foreground">{unit.customer_name}</div>
              </div>
            ) : (
              "—"
            )}
          </td>
          <td className="px-6 py-5 text-sm text-muted-foreground">{desig?.name ?? "—"}</td>
          <td className="px-6 py-5">
            <StatusBadge status={c.status} />
            {c.status === "rejected" && c.rejection_reason && (
              <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={c.rejection_reason}>
                {c.rejection_reason}
              </div>
            )}
          </td>
          <td className="px-4 py-5">
            <div className="flex items-center justify-end gap-1.5">
              {mode === "candidate" && c.status === "pending" && (
                <>
                  <Button
                    size="icon"
                    onClick={() => approveMut.mutate(c)}
                    disabled={approveMut.isPending}
                    className="h-8 w-8 rounded-lg bg-emerald-600 text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
                    title="Approve & assign Employee ID"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setRejectTarget(c);
                      setRejectReason("");
                    }}
                    className="h-8 w-8 rounded-lg border-rose-200 bg-rose-50/50 text-rose-600 transition-all hover:bg-rose-50 active:scale-95 dark:border-rose-500/40 dark:bg-transparent dark:hover:bg-rose-500/10"
                    title="Reject candidate"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {mode === "employee" && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSignTarget({ id: c.id, docType: "nda" })}
                    className="h-8 w-8 rounded-lg border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
                    title="Sign NDA"
                  >
                    <FileSignature className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSignTarget({ id: c.id, docType: "appointment_letter" })}
                    className="h-8 w-8 rounded-lg border-sky-200 bg-sky-50/50 text-sky-700 hover:bg-sky-50 dark:border-sky-500/40 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-500/10"
                    title="Sign Appointment Letter"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </>
              )}
              <div className="ml-0.5 flex items-center gap-1 border-l border-border/60 pl-1.5">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Open the full 10-section editor"
                >
                  <Link to="/admin/candidates/$id/details" params={{ id: c.id }}>
                    <FileText className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void openEditor(c.id)}
                  disabled={openingCandidateId === c.id}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Quick edit"
                >
                  {openingCandidateId === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Edit2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(c)}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </td>
        </tr>
      );
    });
  };

  const renderTable = (rows: CandidateListItem[], mode: "employee" | "candidate") => (
    <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm shadow-stone-200/40 dark:shadow-black/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border/60 bg-secondary/40">
            <tr>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "employee" ? "Emp ID" : "Code"}
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "employee" ? "Employee" : "Candidate"}
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Aadhaar
              </th>
              <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Mobile
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Unit
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Designation
              </th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </th>
              <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">{renderRows(rows, mode)}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Onboard and manage candidates joining client units."
        crumbs={[{ label: "Employees" }]}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total, accent: false, dot: "bg-stone-400" },
          { label: "Drafts", value: stats.drafts, accent: false, dot: "bg-slate-400" },
          { label: "Pending", value: stats.pending, accent: true, dot: "bg-amber-500" },
          { label: "Approved", value: stats.approved, accent: false, dot: "bg-emerald-500" },
          { label: "Rejected", value: stats.rejected, accent: false, dot: "bg-rose-500" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all hover:shadow-md",
              s.accent
                ? "border-amber-200/60 bg-amber-50/60 backdrop-blur-md"
                : "border-border/60 bg-card/80 backdrop-blur-md",
            )}
          >
            <div className="relative z-10 flex items-start justify-between">
              <p
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.2em] transition-colors",
                  s.accent ? "text-amber-700" : "text-muted-foreground group-hover:text-amber-600",
                )}
              >
                {s.label}
              </p>
              {s.accent && s.value > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", s.dot)} />
                </span>
              )}
            </div>
            <p className="relative z-10 mt-3 text-4xl font-bold tabular-nums text-foreground">
              {s.value}
            </p>
            {s.accent && (
              <div className="pointer-events-none absolute -right-4 -bottom-4 h-16 w-16 rounded-full bg-amber-200/30 blur-2xl" />
            )}
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "employee" | "candidate")} className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <TabsList className="inline-flex h-auto rounded-xl border border-border/60 bg-secondary/40 p-1 backdrop-blur-sm">
            <TabsTrigger
              value="employee"
              className="rounded-lg px-6 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Employees <span className="ml-1.5 text-xs opacity-60">({stats.approved})</span>
            </TabsTrigger>
            <TabsTrigger
              value="candidate"
              className="rounded-lg px-6 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              Candidates <span className="ml-1.5 text-xs opacity-60">({stats.total - stats.approved})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex w-full items-center gap-3 md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, Aadhaar, mobile, code…"
                className="h-11 rounded-xl border-border/70 bg-card pl-11 shadow-sm focus-visible:ring-4 focus-visible:ring-amber-500/10 focus-visible:border-amber-500/60"
              />
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setOpenWizard(true);
              }}
              className="h-11 whitespace-nowrap rounded-xl bg-stone-900 px-6 font-semibold text-white shadow-lg shadow-stone-900/10 transition-all hover:-translate-y-0.5 hover:bg-stone-800 active:translate-y-0 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Candidate
            </Button>
          </div>
        </div>

        <TabsContent value="employee" className="mt-0">
          {renderTable(employees, "employee")}
        </TabsContent>
        <TabsContent value="candidate" className="mt-0">
          {renderTable(candidateRows, "candidate")}
        </TabsContent>
      </Tabs>

      <CandidateWizard
        open={openWizard}
        onOpenChange={(v) => {
          setOpenWizard(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        units={units}
        unitsLoading={unitsQuery.isLoading}
        unitsError={unitsQuery.error instanceof Error ? unitsQuery.error.message : null}
        designations={designations}
        designationsLoading={designationsQuery.isLoading}
        designationsError={designationsQuery.error instanceof Error ? designationsQuery.error.message : null}
        exServices={exServices}
        languagesList={languagesList}
        canReview={!!editing && editing.status === "pending"}
        isApproving={approveMut.isPending}
        onApprove={() => {
          if (!editing) return;
          approveMut.mutate(editing as unknown as CandidateListItem, {
            onSuccess: () => {
              setOpenWizard(false);
              setEditing(null);
            },
          });
        }}
        onReject={() => {
          if (!editing) return;
          setRejectTarget(editing as unknown as CandidateListItem);
          setRejectReason("");
          setOpenWizard(false);
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {confirmDelete?.full_name || "this candidate"} from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-rose-500 hover:bg-rose-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject candidate</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {rejectTarget?.full_name || "this candidate"}. They will see this note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Rejection reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Aadhaar details could not be verified…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rejectTarget) return;
                if (!rejectReason.trim()) {
                  toast.error("Please enter a rejection reason");
                  return;
                }
                rejectMut.mutate({ c: rejectTarget, reason: rejectReason.trim() });
              }}
              disabled={rejectMut.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {rejectMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignDocumentDialog
        open={!!signTarget}
        onOpenChange={(o) => !o && setSignTarget(null)}
        candidateId={signTarget?.id ?? null}
        docType={signTarget?.docType ?? "nda"}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-600",
    approved: "bg-emerald-500/15 text-emerald-600",
    active: "bg-emerald-500/15 text-emerald-600",
    pending: "bg-amber-500/15 text-amber-600",
    rejected: "bg-rose-500/15 text-rose-600",
  };
  return <Badge className={cn("border-0 font-semibold capitalize", map[status] ?? "bg-secondary text-foreground")}>{status}</Badge>;
}

function maskAadhaar(n: string) {
  const d = (n ?? "").replace(/\D/g, "");
  if (d.length < 4) return d || "—";
  return `XXXX XXXX ${d.slice(-4)}`;
}

// ---------------- Wizard ---------------- //
type WizardStep = "aadhaar" | "otp" | "form";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

type CandidateForm = Omit<Candidate, "id">;

function emptyForm(): CandidateForm {
  return {
    candidate_code: "",
    rejection_reason: "",
    aadhaar_number: "",
    full_name: "",
    photo_url: "",
    aadhaar_image_url: "",
    signature_url: "",
    date_of_birth: null,
    gender: "",
    religion: "",
    caste_category: "",
    marital_status: "",
    birthplace: "",
    mobile: "",
    alt_mobile: "",
    email: "",
    permanent_address1: "",
    permanent_address2: "",
    permanent_landmark: "",
    permanent_pincode: "",
    permanent_city: "",
    permanent_district: "",
    permanent_state: "",
    permanent_country: "India",
    permanent_police_station: "",
    present_address1: "",
    present_address2: "",
    present_landmark: "",
    present_pincode: "",
    present_city: "",
    present_district: "",
    present_state: "",
    present_country: "India",
    present_police_station: "",
    same_as_permanent: true,
    pan_number: "",
    pan_image_url: "",
    bank_account_holder: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
    bank_branch: "",
    bank_account_type: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_mobile: "",
    contacts: [],
    references: [],
    is_ex_service: false,
    ex_service_id: null,
    languages: [],
    experiences: [],
    educations: [],
    application_date: new Date().toISOString().slice(0, 10),
    preferred_joining_date: null,
    unit_id: null,
    designation_id: null,
    status: "pending",
    physical_health: {},
    compliance: {},
    identification_proofs: [],
    criminal_history: { has_history: false, incidents: [] },
    extra_curricular: [],
    other_info: {},
    documents: [],
    nominations: [],
    kyc_completed: false,
  };
}

function CandidateWizard({
  open,
  onOpenChange,
  editing,
  units,
  unitsLoading,
  unitsError,
  designations,
  designationsLoading,
  designationsError,
  exServices,
  languagesList,
  canReview = false,
  isApproving = false,
  onApprove,
  onReject,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Candidate | null;
  units: UnitLite[];
  unitsLoading: boolean;
  unitsError: string | null;
  designations: DesignationLite[];
  designationsLoading: boolean;
  designationsError: string | null;
  exServices: ExServiceLite[];
  languagesList: LanguageLite[];
  canReview?: boolean;
  isApproving?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractAadhaar);
  const [form, setForm] = useState<CandidateForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      const restAny = rest as unknown as Partial<CandidateForm> & { contacts?: CandidateContact[] };
      const existing = Array.isArray(restAny.contacts) ? restAny.contacts : [];
      let contacts = existing;
      if (contacts.length === 0 && (rest.emergency_contact_name || rest.emergency_contact_mobile)) {
        contacts = [{
          name: rest.emergency_contact_name || "",
          relation: rest.emergency_contact_relation || "",
          mobile: rest.emergency_contact_mobile || "",
          is_emergency: true,
        }];
      }
      setForm({ ...(rest as CandidateForm), contacts });
    } else {
      setForm(emptyForm());
    }
  }, [open, editing]);

  const set = <K extends keyof CandidateForm>(k: K, v: CandidateForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setAny = (k: string, v: any) =>
    setForm((f) => ({ ...f, [k]: v }) as CandidateForm);
  const setSection = (k: string, v: any) =>
    setForm((f) => ({ ...f, [k]: { ...((f as any)[k] ?? {}), ...v } }) as CandidateForm);

  const unit = form.unit_id ? units.find((u) => u.id === form.unit_id) : undefined;

  // ----- File upload helper ----- //
  const uploadFile = async (file: File, slot: "photo" | "signature" | "aadhaar" | "pan"): Promise<string> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${slot}/${form.aadhaar_number || "NEW"}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("candidate-files")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("candidate-files").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFile = async (file: File | null, slot: "photo" | "signature" | "aadhaar" | "pan") => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (slot === "photo" && !isImage) {
      toast.error("Photograph must be an image");
      return;
    }
    if ((slot === "aadhaar" || slot === "signature" || slot === "pan") && !isImage && !isPdf) {
      toast.error("Only image or PDF files are allowed");
      return;
    }
    setUploading(slot);
    try {
      const uploadPromise = uploadFile(file, slot);
      if (slot === "photo" || slot === "signature" || slot === "pan") {
        const url = await uploadPromise;
        if (slot === "photo") set("photo_url", url);
        else if (slot === "signature") set("signature_url", url);
        else set("pan_image_url", url);
        toast.success(`${slot[0].toUpperCase() + slot.slice(1)} uploaded`);
        return;
      }

      if (slot === "aadhaar") {
        const clientOcr = await getAadhaarOcrClient();
        setScanning(true);
        try {
          // Read file as data URL. For PDFs we also rasterize pages so the AI
          // gets actual image content (UIDAI PDFs use scrambled fonts).
          const pageImageDataUrlsPromise = isPdf
            ? clientOcr.renderPdfPagesAsDataUrls(file).catch(() => [])
            : Promise.resolve<string[]>([]);

          const [uploadedUrl, pageImageDataUrls] = await Promise.all([
            uploadPromise,
            pageImageDataUrlsPromise,
          ]);
          set("aadhaar_image_url", uploadedUrl);
          toast.success("Aadhaar uploaded — scanning…");

          let extraction: AadhaarExtraction;
          try {
            extraction = await withTimeout(
              extractFn({
                data: {
                  fileUrl: uploadedUrl,
                  mimeType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
                  pageImageDataUrls,
                },
              }) as Promise<AadhaarExtraction>,
              45_000,
              "Aadhaar scan timed out — please try again or fill the form manually",
            );
          } catch (serverScanError) {
            console.warn("Server Aadhaar scan failed, falling back to client OCR", serverScanError);
            extraction = await withTimeout(
              clientOcr.extractAadhaarClient(file),
              45_000,
              "Aadhaar scan timed out — please try again or fill the form manually",
            );
            toast.warning("Server scan unavailable — used local OCR fallback. Please review the extracted fields.");
          }

          // If the user already typed an Aadhaar number and the AI couldn't read one, keep theirs.
          const finalExtraction: AadhaarExtraction =
            form.aadhaar_number && !/^\d{12}$/.test(extraction.aadhaar_number)
              ? { ...extraction, aadhaar_number: form.aadhaar_number }
              : extraction;

          applyExtraction(finalExtraction);
          const filled = clientOcr.countExtractedFields(finalExtraction);
          if (filled === 0) {
            toast.warning("Scan complete but no fields could be read. Please fill manually or upload a clearer scan.");
          } else if (filled >= 8) {
            toast.success(`Aadhaar scanned — ${filled} field(s) auto-filled. Please review.`);
          } else {
            toast.success(`Aadhaar scanned — ${filled} field(s) auto-filled. Please review and complete the rest.`);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Aadhaar scan failed");
        } finally {
          setScanning(false);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const applyExtraction = (x: AadhaarExtraction) => {
    const cleanValue = (incoming: string) => incoming?.trim() ?? "";
    const looksSuspicious = (value: string) => {
      const next = cleanValue(value);
      if (!next) return false;
      return /[`~^*_={}|<>]/.test(next) || /[;:]{2,}/.test(next) || /\b[il1|]\s*[;:=]\s*/i.test(next);
    };
    const looksUseful = (value: string, kind: "name" | "address" | "place" | "pin" | "aadhaar" | "gender") => {
      const next = cleanValue(value);
      if (!next) return false;
      if ((kind === "name" || kind === "address" || kind === "place") && looksSuspicious(next)) return false;
      switch (kind) {
        case "name": {
          if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(next)) return false;
          const parts = next.match(/[A-Za-z]+/g) ?? [];
          const meaningfulParts = parts.filter((part) => part.length >= 2);
          const longestPart = meaningfulParts.reduce((max, part) => Math.max(max, part.length), 0);
          return parts.join("").length >= 4 && (meaningfulParts.length >= 2 || longestPart >= 4);
        }
        case "address":
          return /[A-Za-z]{3,}/.test(next) && !/[`~^*_={}|<>]{2,}/.test(next);
        case "place":
          return /^[A-Za-z][A-Za-z .'-]{1,79}$/.test(next);
        case "pin":
          return /^\d{6}$/.test(next);
        case "aadhaar":
          return /^\d{12}$/.test(next);
        case "gender":
          return /^(male|female|other)$/i.test(next);
        default:
          return false;
      }
    };
    const pick = (incoming: string, current: string, kind: Parameters<typeof looksUseful>[1]) => {
      const next = cleanValue(incoming);
      return looksUseful(next, kind) ? next : current;
    };
    setForm((f) => {
      const resolvedName = pick(x.full_name, f.full_name, "name");
      const next: CandidateForm = {
        ...f,
        full_name: resolvedName,
        date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(x.date_of_birth) ? x.date_of_birth : f.date_of_birth,
        gender: looksUseful(x.gender, "gender") ? toTitle(x.gender) : f.gender,
        aadhaar_number: pick(x.aadhaar_number, f.aadhaar_number, "aadhaar"),
        birthplace: pick(x.birthplace, f.birthplace, "place"),
        permanent_address1: pick(x.address_line1, f.permanent_address1, "address"),
        permanent_address2: pick(x.address_line2, f.permanent_address2, "address"),
        permanent_landmark: pick(x.landmark, f.permanent_landmark, "address"),
        permanent_pincode: pick(x.pincode, f.permanent_pincode, "pin"),
        permanent_city: pick(x.city, f.permanent_city, "place"),
        permanent_district: pick(x.district, f.permanent_district, "place"),
        permanent_state: pick(x.state, f.permanent_state, "place"),
        permanent_country: cleanValue(x.country) || f.permanent_country || "India",
      };
      if (next.same_as_permanent) {
        next.present_address1 = next.permanent_address1;
        next.present_address2 = next.permanent_address2;
        next.present_landmark = next.permanent_landmark;
        next.present_pincode = next.permanent_pincode;
        next.present_city = next.permanent_city;
        next.present_district = next.permanent_district;
        next.present_state = next.permanent_state;
        next.present_country = next.permanent_country;
        next.present_police_station = next.permanent_police_station;
      }
      return next;
    });
  };

  // ----- Profile completion meter ----- //
  const completionChecks: Array<{ key: string; ok: boolean }> = [
    { key: "Photograph", ok: !!form.photo_url },
    { key: "Aadhaar upload", ok: !!form.aadhaar_image_url },
    { key: "PAN upload", ok: !!form.pan_image_url },
    { key: "Signature", ok: !!form.signature_url },
    { key: "Full name", ok: !!form.full_name.trim() },
    { key: "Aadhaar number", ok: /^\d{12}$/.test(form.aadhaar_number) },
    { key: "Date of birth", ok: !!form.date_of_birth },
    { key: "Gender", ok: !!form.gender },
    { key: "Mobile", ok: !!form.mobile.trim() },
    { key: "Email", ok: !!form.email.trim() },
    { key: "Permanent address", ok: !!form.permanent_address1.trim() && !!form.permanent_pincode },
    { key: "Bank account", ok: !!form.bank_account_number.trim() && !!form.bank_ifsc.trim() },
    { key: "PAN number", ok: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((form.pan_number || "").trim().toUpperCase()) },
    { key: "Unit assignment", ok: !!form.unit_id },
    { key: "Designation", ok: !!form.designation_id },
  ];
  const completionDone = completionChecks.filter((c) => c.ok).length;
  const completionTotal = completionChecks.length;
  const completionPct = Math.round((completionDone / completionTotal) * 100);
  const profileComplete = completionDone === completionTotal;

  const uploadsComplete =
    !!form.photo_url && !!form.aadhaar_image_url && !!form.signature_url && !!form.pan_image_url;

  // ----- Build payload helper ----- //
  const buildPayload = (status: string) => {
    const emergencyContact = form.contacts.find((c) => c.is_emergency) ?? form.contacts[0] ?? null;
    const basePayload = form.same_as_permanent
      ? {
          ...form,
          present_address1: form.permanent_address1,
          present_address2: form.permanent_address2,
          present_landmark: form.permanent_landmark,
          present_pincode: form.permanent_pincode,
          present_city: form.permanent_city,
          present_district: form.permanent_district,
          present_state: form.permanent_state,
          present_country: form.permanent_country,
          present_police_station: form.permanent_police_station,
        }
      : { ...form };
    return {
      ...basePayload,
      status,
      emergency_contact_name: emergencyContact?.name ?? "",
      emergency_contact_relation: emergencyContact?.relation ?? "",
      emergency_contact_mobile: emergencyContact?.mobile ?? "",
    };
  };

  const persist = async (status: string, successMsg: string) => {
    const payload = buildPayload(status);
    if (editing) {
      const { data: before } = await supabase
        .from("candidates" as never)
        .select("*")
        .eq("id", editing.id)
        .maybeSingle();
      const { error } = await supabase
        .from("candidates" as never)
        .update(payload as never)
        .eq("id", editing.id);
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "update",
        entityType: "candidate",
        entityId: editing.id,
        entityLabel: payload.full_name,
        before: (before as unknown as Record<string, unknown>) ?? null,
        after: payload as unknown as Record<string, unknown>,
      });
    } else {
      const { data, error } = await supabase
        .from("candidates" as never)
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      await logActivity({
        module: "Employees",
        action: "create",
        entityType: "candidate",
        entityId: (data as { id: string }).id,
        entityLabel: payload.full_name,
        after: payload as unknown as Record<string, unknown>,
      });
    }
    toast.success(successMsg);
    qc.invalidateQueries({ queryKey: QK });
  };

  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      // Drafts have no strict validation — let user save partial work.
      await persist(editing && editing.status !== "draft" ? form.status : "draft", "Draft saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const submit = async () => {
    if (!form.photo_url) return toast.error("Photograph is required");
    if (!form.aadhaar_image_url) return toast.error("Aadhaar upload is required");
    if (!form.signature_url) return toast.error("Signature is required");
    if (!form.pan_image_url) return toast.error("PAN card upload is required");
    if (!form.full_name.trim()) return toast.error("Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile is required");
    if (form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan_number.trim().toUpperCase()))
      return toast.error("PAN number format is invalid (e.g. ABCDE1234F)");
    if (form.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bank_ifsc.trim().toUpperCase()))
      return toast.error("IFSC code format is invalid (e.g. SBIN0001234)");
    if (form.bank_account_number && !/^\d{6,18}$/.test(form.bank_account_number.trim()))
      return toast.error("Bank account number must be 6–18 digits");
    setSubmitting(true);
    try {
      // Creating / re-submitting moves to "pending" so the admin can approve.
      const nextStatus = editing && editing.status === "approved" ? "approved" : "pending";
      await persist(nextStatus, editing ? "Candidate updated" : "Candidate submitted for approval");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border bg-secondary/30 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {editing ? "Edit Candidate" : "Add Candidate"}
          </DialogTitle>
          <DialogDescription>
            Complete the candidate profile. Save a draft any time; only submit when 100% complete.
          </DialogDescription>
        </DialogHeader>

        {/* Profile completion meter */}
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Profile Completion
              </span>
              {editing?.candidate_code && (
                <Badge className="border-0 bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                  {editing.candidate_code}
                </Badge>
              )}
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              completionPct === 100 ? "text-emerald-600" : completionPct >= 60 ? "text-amber-600" : "text-rose-500",
            )}>
              {completionPct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full transition-all",
                completionPct === 100
                  ? "bg-emerald-500"
                  : completionPct >= 60
                    ? "bg-amber-500"
                    : "bg-rose-500",
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {completionDone} of {completionTotal} required fields complete
            {!profileComplete && " — Save as draft to come back later."}
          </p>
          {!profileComplete && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Still missing:
              </span>
              {completionChecks.filter((c) => !c.ok).map((c) => (
                <Badge
                  key={c.key}
                  variant="outline"
                  className="border-rose-300 bg-rose-50 text-[10px] font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {c.key}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {/* ----- Full form (single page) ----- */}
          {true && (
            <div className="space-y-6">
              {/* Uploads strip */}
              <Section title={`Uploads — all required${uploadsComplete ? "" : " (incomplete)"}`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <UploadTile
                    label="Photograph"
                    required
                    url={form.photo_url}
                    accept="image/*"
                    allowCamera
                    onPick={(f) => handleFile(f, "photo")}
                    uploading={uploading === "photo"}
                  />
                  <UploadTile
                    label="Aadhaar Card"
                    required
                    url={form.aadhaar_image_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "aadhaar")}
                    uploading={uploading === "aadhaar" || scanning}
                    badge={scanning ? "Scanning…" : undefined}
                  />
                  <UploadTile
                    label="PAN Card"
                    required
                    url={form.pan_image_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "pan")}
                    uploading={uploading === "pan"}
                  />
                  <UploadTile
                    label="Signature"
                    required
                    url={form.signature_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "signature")}
                    uploading={uploading === "signature"}
                  />
                </div>
              </Section>

              {(unitsLoading || unitsError || designationsLoading || designationsError) && (
                <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                  {unitsLoading || designationsLoading
                    ? "Loading units and designations…"
                    : unitsError || designationsError || "Reference data is unavailable right now."}
                </div>
              )}

              <Section title="Basic Information">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Full Name" required>
                    <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
                  </Field>
                  <Field label="Date of Birth">
                    <Input
                      type="date"
                      value={form.date_of_birth ?? ""}
                      onChange={(e) => set("date_of_birth", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Gender">
                    <Select value={form.gender || undefined} onValueChange={(v) => set("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Religion">
                    <Select value={form.religion || undefined} onValueChange={(v) => set("religion", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {RELIGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Caste Category">
                    <Select value={form.caste_category || undefined} onValueChange={(v) => set("caste_category", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {CASTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Marital Status">
                    <Select value={form.marital_status || undefined} onValueChange={(v) => set("marital_status", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {MARITAL_STATUSES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Birthplace">
                    <Input value={form.birthplace} onChange={(e) => set("birthplace", e.target.value)} />
                  </Field>
                  <Field label="Aadhaar Number">
                    <Input value={form.aadhaar_number} disabled className="font-mono" />
                  </Field>
                </div>
              </Section>

              <Section title="Contact Information">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="Mobile" required>
                    <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
                  </Field>
                  <Field label="Alternate Mobile">
                    <Input value={form.alt_mobile} onChange={(e) => set("alt_mobile", e.target.value)} />
                  </Field>
                  <Field label="Personal Email">
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </Field>
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Contacts
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          contacts: [
                            ...f.contacts,
                            { name: "", relation: "", mobile: "", is_emergency: f.contacts.length === 0 },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add Contact
                    </Button>
                  </div>
                  {form.contacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No contacts added. Click "Add Contact" to include one. Mark one as Emergency.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {form.contacts.map((ct, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-secondary/30 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Contact #{i + 1}
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-rose-500"
                                  checked={!!ct.is_emergency}
                                  onChange={(e) =>
                                    setForm((f) => ({
                                      ...f,
                                      contacts: f.contacts.map((c, idx) =>
                                        idx === i
                                          ? { ...c, is_emergency: e.target.checked }
                                          : e.target.checked
                                            ? { ...c, is_emergency: false }
                                            : c,
                                      ),
                                    }))
                                  }
                                />
                                Emergency
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setForm((f) => ({
                                    ...f,
                                    contacts: f.contacts.filter((_, idx) => idx !== i),
                                  }))
                                }
                              >
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Field label="Name">
                              <Input
                                value={ct.name}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    contacts: f.contacts.map((c, idx) =>
                                      idx === i ? { ...c, name: e.target.value } : c,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Relationship">
                              <Select
                                value={ct.relation || undefined}
                                onValueChange={(v) =>
                                  setForm((f) => ({
                                    ...f,
                                    contacts: f.contacts.map((c, idx) =>
                                      idx === i ? { ...c, relation: v } : c,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>
                                  {REFERENCE_RELATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Mobile">
                              <Input
                                value={ct.mobile}
                                inputMode="numeric"
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    contacts: f.contacts.map((c, idx) =>
                                      idx === i
                                        ? { ...c, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }
                                        : c,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      References
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          references: [
                            ...f.references,
                            { name: "", relation_type: "", mobile: "", address: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add Reference
                    </Button>
                  </div>
                  {form.references.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No references added. Click "Add Reference" to include one.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {form.references.map((ref, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-secondary/30 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Reference #{i + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  references: f.references.filter((_, idx) => idx !== i),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Name">
                              <Input
                                value={ref.name}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, name: e.target.value } : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Relation Type">
                              <Select
                                value={ref.relation_type || undefined}
                                onValueChange={(v) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, relation_type: v } : r,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger><SelectValue placeholder="Family / Friend / …" /></SelectTrigger>
                                <SelectContent>
                                  {RELATION_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Mobile">
                              <Input
                                value={ref.mobile}
                                inputMode="numeric"
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i
                                        ? { ...r, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }
                                        : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Address">
                              <Input
                                value={ref.address}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    references: f.references.map((r, idx) =>
                                      idx === i ? { ...r, address: e.target.value } : r,
                                    ),
                                  }))
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Bank Details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Account Holder Name">
                    <Input
                      value={form.bank_account_holder}
                      onChange={(e) => set("bank_account_holder", e.target.value)}
                      placeholder="As per bank records"
                    />
                  </Field>
                  <Field label="Account Number">
                    <Input
                      value={form.bank_account_number}
                      inputMode="numeric"
                      onChange={(e) =>
                        set("bank_account_number", e.target.value.replace(/\D/g, "").slice(0, 18))
                      }
                      className="font-mono"
                    />
                  </Field>
                  <Field label="IFSC Code">
                    <Input
                      value={form.bank_ifsc}
                      onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase().slice(0, 11))}
                      placeholder="e.g. SBIN0001234"
                      className="font-mono uppercase"
                    />
                  </Field>
                  <Field label="Bank Name">
                    <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} />
                  </Field>
                  <Field label="Branch">
                    <Input value={form.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} />
                  </Field>
                  <Field label="Account Type">
                    <Select
                      value={form.bank_account_type || undefined}
                      onValueChange={(v) => set("bank_account_type", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {BANK_ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="PAN Number">
                    <Input
                      value={form.pan_number}
                      onChange={(e) => set("pan_number", e.target.value.toUpperCase().slice(0, 10))}
                      placeholder="e.g. ABCDE1234F"
                      className="font-mono uppercase"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Permanent Address (auto-filled from Aadhaar)">
                <CandidateAddressFields
                  block={{
                    address1: form.permanent_address1,
                    address2: form.permanent_address2,
                    landmark: form.permanent_landmark,
                    pincode: form.permanent_pincode,
                    city: form.permanent_city,
                    district: form.permanent_district,
                    state: form.permanent_state,
                    country: form.permanent_country,
                  }}
                  onChange={(patch) => {
                    setForm((f) => {
                      const next = { ...f };
                      for (const [k, v] of Object.entries(patch)) {
                        const key = `permanent_${k}` as keyof CandidateForm;
                        (next as Record<string, unknown>)[key] = v;
                      }
                      if (f.same_as_permanent) {
                        for (const [k, v] of Object.entries(patch)) {
                          const key = `present_${k}` as keyof CandidateForm;
                          (next as Record<string, unknown>)[key] = v;
                        }
                      }
                      return next;
                    });
                  }}
                />
              </Section>

              <Section title="Present Address">
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                  <Switch
                    checked={form.same_as_permanent}
                    onCheckedChange={(v) => set("same_as_permanent", v)}
                  />
                  <Label className="m-0 cursor-pointer">Same as permanent address</Label>
                </div>
                {!form.same_as_permanent && (
                  <>
                    <CandidateAddressFields
                      block={{
                        address1: form.present_address1,
                        address2: form.present_address2,
                        landmark: form.present_landmark,
                        pincode: form.present_pincode,
                        city: form.present_city,
                        district: form.present_district,
                        state: form.present_state,
                        country: form.present_country,
                      }}
                      onChange={(patch) =>
                        setForm((f) => {
                          const next = { ...f };
                          for (const [k, v] of Object.entries(patch)) {
                            const key = `present_${k}` as keyof CandidateForm;
                            (next as Record<string, unknown>)[key] = v;
                          }
                          return next;
                        })
                      }
                    />
                  </>
                )}
              </Section>

              <Section title="Assignment">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Application Date">
                    <Input
                      type="date"
                      value={form.application_date}
                      onChange={(e) => set("application_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Preferred Joining Date">
                    <Input
                      type="date"
                      value={form.preferred_joining_date ?? ""}
                      onChange={(e) => set("preferred_joining_date", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Unit (Client)">
                    <UnitPicker
                      units={units}
                      value={form.unit_id}
                      onChange={(id) => set("unit_id", id)}
                      disabled={unitsLoading || !!unitsError}
                      emptyMessage={unitsError ? `Could not load units: ${unitsError}` : "No units found."}
                    />
                  </Field>
                  <Field label="Organization">
                    <Input value={unit?.customer_name ?? ""} disabled placeholder="Auto-filled from unit" />
                  </Field>
                  <Field label="Designation">
                    <DesignationPicker
                      designations={designations}
                      value={form.designation_id}
                      onChange={(id) => set("designation_id", id)}
                      disabled={designationsLoading || !!designationsError}
                      emptyMessage={designationsError ? `Could not load designations: ${designationsError}` : "No designations found."}
                    />
                  </Field>
                  <Field label="Status">
                    <Select value={form.status} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section title="Compliance">
                <ComplianceSection form={form} setSection={setSection} />
              </Section>

              <Section title="Knowledge & Experience">
                <KnowledgeSection form={form} set={setAny} />
              </Section>

              <Section title="Physical & Health">
                <PhysicalSection form={form} setSection={setSection} />
              </Section>

              <Section title="Identification Proofs">
                <IdentificationSection form={form} set={setAny} setSection={setSection} />
              </Section>

              <Section title="Criminal History">
                <CriminalSection form={form} set={setAny} />
              </Section>

            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {canReview && (
              <>
                <Button
                  onClick={() => onApprove?.()}
                  disabled={isApproving || submitting || savingDraft || !!uploading || scanning}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Approve & assign Employee ID"
                >
                  {isApproving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onReject?.()}
                  disabled={submitting || savingDraft || !!uploading || scanning}
                  className="border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-transparent dark:hover:bg-rose-500/10"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={saveDraft}
              disabled={savingDraft || submitting || !!uploading || scanning}
            >
              {savingDraft && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Draft
            </Button>
            <Button
              onClick={submit}
              disabled={submitting || savingDraft || !!uploading || scanning || !profileComplete}
              title={!profileComplete ? `Complete all ${completionTotal} required fields to submit (${completionPct}% done)` : undefined}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Submit" : "Create Candidate"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}

function CandidateAddressFields({
  block,
  onChange,
}: {
  block: AddressBlock;
  onChange: (patch: Partial<AddressBlock>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Address line 1">
        <Input value={block.address1} onChange={(e) => onChange({ address1: e.target.value })} />
      </Field>
      <Field label="Address line 2">
        <Input value={block.address2} onChange={(e) => onChange({ address2: e.target.value })} />
      </Field>
      <Field label="Landmark">
        <Input value={block.landmark} onChange={(e) => onChange({ landmark: e.target.value })} />
      </Field>
      <Field label="Pincode">
        <Input
          value={block.pincode}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
        />
      </Field>
      <Field label="City">
        <Input value={block.city} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <Field label="District">
        <Input value={block.district} onChange={(e) => onChange({ district: e.target.value })} />
      </Field>
      <Field label="State">
        <Input value={block.state} onChange={(e) => onChange({ state: e.target.value })} />
      </Field>
      <Field label="Country">
        <Input value={block.country} onChange={(e) => onChange({ country: e.target.value })} />
      </Field>
    </div>
  );
}

function UploadTile({
  label,
  required,
  url,
  accept = "image/*",
  allowCamera = false,
  onPick,
  uploading,
  badge,
}: {
  label: string;
  required?: boolean;
  url: string;
  accept?: string;
  allowCamera?: boolean;
  onPick: (f: File | null) => void;
  uploading: boolean;
  badge?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const isPdf = !!url && /\.pdf(\?|$)/i.test(url);
  const done = !!url;
  return (
    <div
      className={`relative flex flex-col items-center gap-2 rounded-lg border border-dashed p-3 ${
        done ? "border-emerald-500/40 bg-emerald-500/5" : required ? "border-rose-400/40 bg-secondary/20" : "border-border bg-secondary/20"
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label} {required && <span className="text-rose-500">*</span>}
        </div>
        {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-md bg-background">
        {url ? (
          isPdf ? (
            <a href={url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <FileText className="h-8 w-8" />
              <span>View PDF</span>
            </a>
          ) : (
            <img src={url} alt={label} className="h-full w-full object-contain" />
          )
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          onPick(f);
        }}
      />
      {allowCamera ? (
        <div className="grid w-full grid-cols-2 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCameraOpen(true)}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Camera className="mr-1 h-3.5 w-3.5" />
                Take
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            Upload
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {badge ?? "Uploading…"}
            </>
          ) : url ? "Replace" : "Upload (Image or PDF)"}
        </Button>
      )}
      {allowCamera && (
        <CameraCaptureDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={(file) => {
            setCameraOpen(false);
            onPick(file);
          }}
        />
      )}
    </div>
  );
}

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        if (err.name === "NotAllowedError") {
          setError("Camera permission denied. Enable camera access in your browser settings and retry.");
        } else if (err.name === "NotFoundError") {
          setError("No camera found on this device.");
        } else if (err.name === "NotReadableError") {
          setError("Camera is in use by another application.");
        } else {
          setError(err.message || "Could not start camera");
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, facing]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Take Photograph</DialogTitle>
          <DialogDescription>Position the subject and click Capture.</DialogDescription>
        </DialogHeader>
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-black">
          {error ? (
            <div className="px-6 text-center text-sm text-rose-300">{error}</div>
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
          )}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            disabled={!!error}
          >
            Switch camera ({facing === "user" ? "front" : "back"})
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={snap} disabled={!ready || !!error}>
              <Camera className="mr-1.5 h-4 w-4" /> Capture
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnitPicker({
  units,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No units found.",
}: {
  units: UnitLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ? units.find((u) => u.id === value) : null;
  const filteredUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units;

    return units.filter((unit) =>
      [unit.code, unit.name, unit.customer_name ?? "", unit.id].some((part) =>
        part.toLowerCase().includes(needle),
      ),
    );
  }, [query, units]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">
              <b>{selected.code}</b> · {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Search unit by code or name…</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search units…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filteredUnits.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.code} ${u.name} ${u.customer_name ?? ""}`}
                  onSelect={() => {
                    onChange(u.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium"><b>{u.code}</b> · {u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.customer_name}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DesignationPicker({
  designations,
  value,
  onChange,
  disabled = false,
  emptyMessage = "No designations found.",
}: {
  designations: DesignationLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ? designations.find((d) => d.id === value) : null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return designations;
    return designations.filter((d) =>
      [d.code ?? "", d.name].some((p) => p.toLowerCase().includes(needle)),
    );
  }, [query, designations]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">
              {selected.code ? <><b>{selected.code}</b> · </> : null}{selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Search designation…</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search designations…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {filtered.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`${d.code ?? ""} ${d.name}`}
                  onSelect={() => {
                    onChange(d.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{d.name}</span>
                    {d.code ? <span className="text-xs text-muted-foreground">{d.code}</span> : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function toTitle(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
