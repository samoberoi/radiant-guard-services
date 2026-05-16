import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  CheckCircle2,
  Edit2,
  FileText,
  IdCard,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
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
  application_date: string;
  preferred_joining_date: string | null;
  unit_id: string | null;
  designation_id: string | null;
  status: string;
};

type UnitLite = {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  customer_name?: string;
};

type DesignationLite = { id: string; name: string; code: string };

const QK = ["admin", "candidates"] as const;
const QK_UNITS = ["admin", "units-lite"] as const;
const QK_DESIG = ["admin", "designations-lite"] as const;

// ---------------- Hooks ---------------- //
function useCandidates() {
  return useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as unknown) as Candidate[];
    },
  });
}

function useUnits() {
  return useQuery({
    queryKey: QK_UNITS,
    queryFn: async (): Promise<UnitLite[]> => {
      const { data, error } = await supabase
        .from("units" as never)
        .select("id,code,name,customer_id")
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      const units = ((data as unknown) as UnitLite[]) ?? [];
      const custIds = Array.from(new Set(units.map((u) => u.customer_id).filter(Boolean))) as string[];
      let custMap = new Map<string, string>();
      if (custIds.length) {
        const { data: cs } = await supabase
          .from("customers" as never)
          .select("id,name")
          .in("id", custIds);
        custMap = new Map(((cs ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      }
      return units.map((u) => ({ ...u, customer_name: u.customer_id ? custMap.get(u.customer_id) ?? "" : "" }));
    },
  });
}

function useDesignations() {
  return useQuery({
    queryKey: QK_DESIG,
    queryFn: async (): Promise<DesignationLite[]> => {
      const { data, error } = await supabase
        .from("designations" as never)
        .select("id,name,code,enabled")
        .eq("enabled", true)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return ((data as unknown) as DesignationLite[]) ?? [];
    },
  });
}

// ---------------- Page ---------------- //
function EmployeesPage() {
  const { data: candidates = [], isLoading } = useCandidates();
  const { data: units = [] } = useUnits();
  const { data: designations = [] } = useDesignations();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [openWizard, setOpenWizard] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Candidate | null>(null);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const desigMap = useMemo(() => new Map(designations.map((d) => [d.id, d])), [designations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.full_name, c.aadhaar_number, c.mobile, c.email].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [candidates, search]);

  const stats = useMemo(() => {
    const total = candidates.length;
    const active = candidates.filter((c) => c.status === "active").length;
    const pending = candidates.filter((c) => c.status === "pending").length;
    const rejected = candidates.filter((c) => c.status === "rejected").length;
    return { total, active, pending, rejected };
  }, [candidates]);

  const deleteMut = useMutation({
    mutationFn: async (c: Candidate) => {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Onboard and manage candidates joining client units."
        crumbs={[{ label: "Employees" }]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, tone: "bg-secondary text-foreground" },
          { label: "Active", value: stats.active, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
          { label: "Pending", value: stats.pending, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
          { label: "Rejected", value: stats.rejected, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {s.label}
            </div>
            <div className={cn("mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-2xl font-bold tabular-nums", s.tone)}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, Aadhaar, mobile…"
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpenWizard(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Candidate
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Candidate</th>
                <th className="px-4 py-3 text-left font-semibold">Aadhaar</th>
                <th className="px-4 py-3 text-left font-semibold">Mobile</th>
                <th className="px-4 py-3 text-left font-semibold">Unit</th>
                <th className="px-4 py-3 text-left font-semibold">Designation</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No candidates yet. Click <b>Add Candidate</b> to start.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const unit = c.unit_id ? unitMap.get(c.unit_id) : undefined;
                  const desig = c.designation_id ? desigMap.get(c.designation_id) : undefined;
                  return (
                    <tr key={c.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.photo_url ? (
                            <img src={c.photo_url} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-border" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                              <UserPlus className="h-4 w-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-foreground">{c.full_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{c.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{maskAadhaar(c.aadhaar_number)}</td>
                      <td className="px-4 py-3">{c.mobile || "—"}</td>
                      <td className="px-4 py-3">
                        {unit ? (
                          <div>
                            <div className="font-medium">{unit.name}</div>
                            <div className="text-xs text-muted-foreground">{unit.customer_name}</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">{desig?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(c);
                              setOpenWizard(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmDelete(c)}
                            className="text-rose-500 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CandidateWizard
        open={openWizard}
        onOpenChange={(v) => {
          setOpenWizard(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        units={units}
        designations={designations}
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
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

type CandidateForm = Omit<Candidate, "id">;

function emptyForm(): CandidateForm {
  return {
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
    application_date: new Date().toISOString().slice(0, 10),
    preferred_joining_date: null,
    unit_id: null,
    designation_id: null,
    status: "pending",
  };
}

function CandidateWizard({
  open,
  onOpenChange,
  editing,
  units,
  designations,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Candidate | null;
  units: UnitLite[];
  designations: DesignationLite[];
}) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractAadhaar);
  const [step, setStep] = useState<WizardStep>("aadhaar");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [form, setForm] = useState<CandidateForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id: _id, ...rest } = editing;
      void _id;
      setForm(rest);
      setStep("form");
    } else {
      setForm(emptyForm());
      setStep("aadhaar");
    }
    setOtp("");
    setOtpError(null);
  }, [open, editing]);

  const set = <K extends keyof CandidateForm>(k: K, v: CandidateForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const unit = form.unit_id ? units.find((u) => u.id === form.unit_id) : undefined;

  // ----- Step 1: Aadhaar number ----- //
  const aadhaarValid = /^\d{12}$/.test(form.aadhaar_number);

  const sendOtp = () => {
    if (!aadhaarValid) {
      toast.error("Enter a valid 12-digit Aadhaar number");
      return;
    }
    toast.success(`OTP sent to Aadhaar-linked mobile. (Demo OTP: ${MOCK_OTP})`);
    setStep("otp");
  };

  const verifyOtp = () => {
    if (otp !== MOCK_OTP) {
      setOtpError("Invalid OTP. Try 1111 (demo).");
      return;
    }
    setOtpError(null);
    toast.success("Aadhaar verified");
    setStep("form");
  };

  // ----- File upload helper ----- //
  const uploadFile = async (file: File, slot: "photo" | "signature" | "aadhaar"): Promise<string> => {
    const ext = file.name.split(".").pop() || "png";
    const path = `${slot}/${form.aadhaar_number || "NEW"}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("candidate-files")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("candidate-files").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFile = async (file: File | null, slot: "photo" | "signature" | "aadhaar") => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (slot === "photo" && !isImage) {
      toast.error("Photograph must be an image");
      return;
    }
    if ((slot === "aadhaar" || slot === "signature") && !isImage && !isPdf) {
      toast.error("Only image or PDF files are allowed");
      return;
    }
    setUploading(slot);
    try {
      const url = await uploadFile(file, slot);
      if (slot === "photo") set("photo_url", url);
      else if (slot === "signature") set("signature_url", url);
      else set("aadhaar_image_url", url);
      toast.success(`${slot[0].toUpperCase() + slot.slice(1)} uploaded`);
      if (slot === "aadhaar") {
        const reader = new FileReader();
        const dataUrl: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        setScanning(true);
        try {
          const res = (await extractFn({ data: { imageDataUrl: dataUrl } })) as AadhaarExtraction;
          applyExtraction(res);
          const filled = [res.full_name, res.aadhaar_number, res.date_of_birth, res.address_line1]
            .filter((v) => v && v.trim()).length;
          if (filled === 0) {
            toast.warning("Aadhaar scanned but no fields could be read. Try a clearer image.");
          } else {
            toast.success(`Aadhaar scanned — ${filled} field(s) auto-filled`);
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
    const pick = (incoming: string, current: string) =>
      incoming && incoming.trim() ? incoming.trim() : current;
    setForm((f) => {
      const next: CandidateForm = {
        ...f,
        full_name: pick(x.full_name, f.full_name),
        date_of_birth: x.date_of_birth ? x.date_of_birth : f.date_of_birth,
        gender: x.gender ? toTitle(x.gender) : f.gender,
        aadhaar_number: pick(x.aadhaar_number, f.aadhaar_number),
        birthplace: pick(x.birthplace, f.birthplace),
        permanent_address1: pick(x.address_line1, f.permanent_address1),
        permanent_address2: pick(x.address_line2, f.permanent_address2),
        permanent_landmark: pick(x.landmark, f.permanent_landmark),
        permanent_pincode: pick(x.pincode, f.permanent_pincode),
        permanent_city: pick(x.city, f.permanent_city),
        permanent_district: pick(x.district, f.permanent_district),
        permanent_state: pick(x.state, f.permanent_state),
        permanent_country: pick(x.country, f.permanent_country) || "India",
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

  // ----- Submit ----- //
  const uploadsComplete = !!form.photo_url && !!form.aadhaar_image_url && !!form.signature_url;
  const submit = async () => {
    if (!form.photo_url) return toast.error("Photograph is required");
    if (!form.aadhaar_image_url) return toast.error("Aadhaar upload is required");
    if (!form.signature_url) return toast.error("Signature is required");
    if (!form.full_name.trim()) return toast.error("Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile is required");
    setSubmitting(true);
    try {
      const payload = form.same_as_permanent
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
        toast.success("Candidate updated");
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
        toast.success("Candidate created");
      }
      qc.invalidateQueries({ queryKey: QK });
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
            {step === "aadhaar" && "Start by entering the candidate's Aadhaar number."}
            {step === "otp" && "An OTP has been sent to the Aadhaar-linked mobile number."}
            {step === "form" && "Complete the candidate's profile."}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        {!editing && (
          <div className="flex items-center justify-center gap-2 border-b border-border bg-card px-6 py-3">
            {[
              { id: "aadhaar", label: "Aadhaar" },
              { id: "otp", label: "Verify OTP" },
              { id: "form", label: "Details" },
            ].map((s, i) => {
              const active = step === s.id;
              const done = ["aadhaar", "otp", "form"].indexOf(step) > i;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-emerald-500 text-white"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                  {i < 2 && <div className="ml-1 h-px w-8 bg-border" />}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-6 py-5">
          {/* ----- Step: Aadhaar ----- */}
          {step === "aadhaar" && (
            <div className="mx-auto max-w-md space-y-4 py-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <IdCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold">Enter Aadhaar Number</h3>
                  <p className="text-sm text-muted-foreground">
                    We'll send a one-time password to the Aadhaar-linked mobile.
                  </p>
                </div>
              </div>
              <div>
                <Label>Aadhaar Number</Label>
                <Input
                  value={form.aadhaar_number}
                  onChange={(e) =>
                    set("aadhaar_number", e.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  placeholder="12-digit Aadhaar"
                  className="mt-1 text-center font-mono text-lg tracking-widest"
                  maxLength={12}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.aadhaar_number.length}/12 digits
                </p>
              </div>
              <Button onClick={sendOtp} disabled={!aadhaarValid} className="w-full">
                Send OTP
              </Button>
            </div>
          )}

          {/* ----- Step: OTP ----- */}
          {step === "otp" && (
            <div className="mx-auto max-w-md space-y-4 py-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold">Verify OTP</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter the 4-digit OTP sent to the registered mobile. (Demo: <b>1111</b>)
                  </p>
                </div>
              </div>
              <div>
                <Label>OTP</Label>
                <Input
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setOtpError(null);
                  }}
                  placeholder="• • • •"
                  className="mt-1 text-center font-mono text-2xl tracking-[0.5em]"
                  maxLength={4}
                />
                {otpError && <p className="mt-1 text-xs text-rose-500">{otpError}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => toast.success(`OTP resent. (Demo: ${MOCK_OTP})`)}
                >
                  Resend OTP
                </Button>
                <Button onClick={verifyOtp} disabled={otp.length !== 4} className="flex-1">
                  Verify OTP
                </Button>
              </div>
              <button
                type="button"
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setStep("aadhaar")}
              >
                ← Change Aadhaar number
              </button>
            </div>
          )}

          {/* ----- Step: Full form ----- */}
          {step === "form" && (
            <div className="space-y-6">
              {/* Uploads strip */}
              <Section title={`Uploads — all required${uploadsComplete ? "" : " (incomplete)"}`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    label="Signature"
                    required
                    url={form.signature_url}
                    accept="image/*,application/pdf"
                    onPick={(f) => handleFile(f, "signature")}
                    uploading={uploading === "signature"}
                  />
                </div>
              </Section>

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
                <div className="mt-3">
                  <Field label="Nearest Police Station (Permanent)">
                    <Input
                      value={form.permanent_police_station}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((f) => ({
                          ...f,
                          permanent_police_station: v,
                          present_police_station: f.same_as_permanent ? v : f.present_police_station,
                        }));
                      }}
                    />
                  </Field>
                </div>
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
                    <div className="mt-3">
                      <Field label="Nearest Police Station (Present)">
                        <Input
                          value={form.present_police_station}
                          onChange={(e) => set("present_police_station", e.target.value)}
                        />
                      </Field>
                    </div>
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
                    />
                  </Field>
                  <Field label="Organization">
                    <Input value={unit?.customer_name ?? ""} disabled placeholder="Auto-filled from unit" />
                  </Field>
                  <Field label="Designation">
                    <Select
                      value={form.designation_id ?? undefined}
                      onValueChange={(v) => set("designation_id", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        {designations.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            </div>
          )}
        </div>

        {step === "form" && (
          <DialogFooter className="border-t border-border bg-card px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={submitting || !!uploading || scanning || !uploadsComplete}
              title={!uploadsComplete ? "Upload photograph, Aadhaar and signature to continue" : undefined}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Candidate"}
            </Button>
          </DialogFooter>
        )}
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
}: {
  units: UnitLite[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? units.find((u) => u.id === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search units…" />
          <CommandList>
            <CommandEmpty>No units found.</CommandEmpty>
            <CommandGroup>
              {units.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.code} ${u.name} ${u.customer_name ?? ""}`}
                  onSelect={() => {
                    onChange(u.id);
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

function toTitle(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
