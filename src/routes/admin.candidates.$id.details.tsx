import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Activity,
  ShieldCheck,
  GraduationCap,
  Heart,
  Phone,
  FileBadge,
  Gavel,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  emptyProof,
  emptyContact,
  SectionHeader,
  Field,
  PhysicalSection,
  ComplianceSection,
  KnowledgeSection,
  CriminalSection,
  ListSection,
  IdentificationSection,
} from "@/components/candidate-extra-sections";

const MODULE = "Candidate Details";

const SECTIONS = [
  { id: "basic", label: "Basic Info", icon: Activity },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "knowledge", label: "Knowledge & Experience", icon: GraduationCap },
  { id: "physical", label: "Physical & Health", icon: Heart },
  { id: "contacts", label: "Contacts", icon: Phone },
  { id: "identification", label: "Identification Proofs", icon: FileBadge },
  { id: "criminal", label: "Criminal History", icon: Gavel },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/admin/candidates/$id/details")({
  component: CandidateDetailsPage,
});

function CandidateDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const [active, setActive] = useState<SectionId>("basic");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-details", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      ...data,
      physical_health: data.physical_health ?? {},
      compliance: data.compliance ?? {},
      identification_proofs: Array.isArray(data.identification_proofs)
        ? data.identification_proofs
        : [],
      criminal_history:
        data.criminal_history && typeof data.criminal_history === "object"
          ? data.criminal_history
          : { has_history: false, incidents: [] },
      extra_curricular: Array.isArray(data.extra_curricular) ? data.extra_curricular : [],
      other_info: data.other_info ?? {},
      documents: Array.isArray(data.documents) ? data.documents : [],
      nominations: Array.isArray(data.nominations) ? data.nominations : [],
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
    });
    setDirty(false);
  }, [data]);

  const set = (path: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [path]: value }));
    setDirty(true);
  };
  const setSection = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: { ...(prev?.[key] ?? {}), ...value } }));
    setDirty(true);
  };

  const handleSave = async (closeAfter = false) => {
    if (!form) return;
    setSaving(true);
    try {
      const payload: any = {
        physical_health: form.physical_health,
        compliance: form.compliance,
        identification_proofs: form.identification_proofs,
        criminal_history: form.criminal_history,
        extra_curricular: form.extra_curricular,
        other_info: form.other_info,
        documents: form.documents,
        nominations: form.nominations,
        contacts: form.contacts,
        kyc_completed: form.kyc_completed ?? false,
      };
      const { error } = await supabase.from("candidates").update(payload).eq("id", id);
      if (error) throw error;
      await logActivity({
        module: MODULE,
        action: "update",
        entityType: "candidate",
        entityId: id,
        entityLabel: form.full_name || id,
      });
      toast.success("Saved");
      setDirty(false);
      if (closeAfter) navigate({ to: "/admin/employees" });
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const markKyc = async () => {
    setForm((p: any) => ({ ...p, kyc_completed: true }));
    await handleSave(false);
    toast.success("KYC marked completed");
  };

  const changeStatus = async (
    next: "approved" | "rejected" | "pending",
    reason = "",
  ) => {
    setStatusBusy(true);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ status: next, rejection_reason: reason })
        .eq("id", id);
      if (error) throw error;
      setForm((p: any) => ({ ...p, status: next, rejection_reason: reason }));
      await logActivity({
        module: MODULE,
        action: next === "approved" ? "approve" : next === "rejected" ? "reject" : "resubmit",
        entityType: "candidate",
        entityId: id,
        entityLabel: form?.full_name || id,
        details: reason ? { reason } : undefined,
      });
      toast.success(
        next === "approved" ? "Candidate approved" :
        next === "rejected" ? "Candidate rejected" :
        "Candidate resubmitted for review",
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    await changeStatus("rejected", rejectReason.trim());
    setRejectOpen(false);
    setRejectReason("");
  };

  if (isLoading || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Edit Candidate</h1>
              {form.candidate_code && (
                <Badge variant="outline" className="font-mono text-xs">
                  {form.candidate_code}
                </Badge>
              )}
              <StatusPill status={form.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {form.full_name || "—"} · {form.mobile || "no mobile"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {form.kyc_completed ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
              <CheckCircle2 className="mr-1 h-3 w-3" /> KYC Completed
            </Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={markKyc} disabled={saving}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark KYC Completed
            </Button>
          )}

          {form.status === "pending" && (
            <>
              <Button
                size="sm"
                onClick={() => changeStatus("approved")}
                disabled={statusBusy}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRejectOpen(true)}
                disabled={statusBusy}
              >
                <XCircle className="mr-2 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {form.status === "rejected" && (
            <Button
              size="sm"
              onClick={() => changeStatus("pending", "")}
              disabled={statusBusy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {statusBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Resubmit for Review
            </Button>
          )}
          {form.status === "approved" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={statusBusy}
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => router.history.back()}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
            Save & Close
          </Button>
        </div>
      </div>

      {form.status === "rejected" && form.rejection_reason && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900/40 dark:bg-rose-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-700 dark:text-rose-300">Rejected</div>
            <div className="text-rose-700/90 dark:text-rose-200/90">{form.rejection_reason}</div>
          </div>
        </div>
      )}
      {form.status === "approved" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <div className="font-medium text-emerald-700 dark:text-emerald-300">
            This candidate has been approved.
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Section tabs (horizontal) */}
        <nav className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <section className="rounded-lg border bg-card p-6">
          {active === "basic" && <BasicSection form={form} />}
          {active === "physical" && (
            <PhysicalSection form={form} setSection={setSection} />
          )}
          {active === "compliance" && (
            <ComplianceSection form={form} setSection={setSection} />
          )}
          {active === "knowledge" && (
            <KnowledgeSection form={form} set={set} />
          )}
          {active === "contacts" && (
            <ListSection
              title="Contacts"
              description="Additional contact persons for this candidate"
              items={form.contacts}
              onChange={(v) => set("contacts", v)}
              empty={emptyContact}
              fields={[
                { key: "name", label: "Name" },
                { key: "relation", label: "Relation" },
                { key: "phone", label: "Phone" },
                { key: "email", label: "Email" },
              ]}
            />
          )}
          {active === "identification" && (
            <IdentificationSection form={form} set={set} setSection={setSection} />
          )}
          {active === "criminal" && (
            <CriminalSection form={form} set={set} />
          )}
        </section>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject candidate</DialogTitle>
            <DialogDescription>
              Provide a reason. The candidate can be resubmitted for review after edits.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={statusBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitReject} disabled={statusBusy}>
              {statusBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-500/15 text-slate-600",
    pending: "bg-amber-500/15 text-amber-600",
    approved: "bg-emerald-500/15 text-emerald-600",
    rejected: "bg-rose-500/15 text-rose-600",
  };
  return (
    <Badge className={`border-0 font-semibold capitalize ${map[status] ?? "bg-secondary text-foreground"}`}>
      {status || "—"}
    </Badge>
  );
}

/* ---------- Section components ---------- */

function BasicSection({ form }: { form: any }) {
  return (
    <div>
      <SectionHeader title="Basic Info" desc="Read-only. Edit via the candidate wizard." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Candidate Code"><Input value={form.candidate_code || "—"} readOnly className="font-mono" /></Field>
        <Field label="Full Name"><Input value={form.full_name || ""} readOnly /></Field>
        <Field label="Mobile"><Input value={form.mobile || ""} readOnly /></Field>
        <Field label="Email"><Input value={form.email || ""} readOnly /></Field>
        <Field label="DOB"><Input value={form.date_of_birth || ""} readOnly /></Field>
        <Field label="Gender"><Input value={form.gender || ""} readOnly /></Field>
        <Field label="Aadhaar"><Input value={form.aadhaar_number || ""} readOnly /></Field>
      </div>
    </div>
  );
}

