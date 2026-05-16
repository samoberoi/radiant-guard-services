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
  const [active, setActive] = useState<SectionId>("physical");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(null);

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
  }, [data]);

  const set = (path: string, value: any) =>
    setForm((prev: any) => ({ ...prev, [path]: value }));
  const setSection = (key: string, value: any) =>
    setForm((prev: any) => ({ ...prev, [key]: { ...(prev?.[key] ?? {}), ...value } }));

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
            <h1 className="text-xl font-semibold">Edit Candidate</h1>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="rounded-lg border bg-card p-2">
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
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
        </aside>

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
    </div>
  );
}

/* ---------- Section components ---------- */

function BasicSection({ form }: { form: any }) {
  return (
    <div>
      <SectionHeader title="Basic Info" desc="Read-only. Edit via the candidate wizard." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

