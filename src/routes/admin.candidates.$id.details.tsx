import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Activity,
  ShieldCheck,
  GraduationCap,
  Heart,
  Phone,
  FileBadge,
  Gavel,
  Trophy,
  Info,
  FileText,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const MODULE = "Candidate Details";

const SECTIONS = [
  { id: "basic", label: "Basic Info", icon: Activity },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "knowledge", label: "Knowledge & Experience", icon: GraduationCap },
  { id: "physical", label: "Physical & Health", icon: Heart },
  { id: "contacts", label: "Contacts", icon: Phone },
  { id: "identification", label: "Identification Proofs", icon: FileBadge },
  { id: "criminal", label: "Criminal History", icon: Gavel },
  { id: "extra", label: "Extra Curricular", icon: Trophy },
  { id: "other", label: "Other Info", icon: Info },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "nominations", label: "Nominations", icon: Users },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/admin/candidates/$id/details")({
  component: CandidateDetailsPage,
});

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function emptyDoc() {
  return { id: crypto.randomUUID(), name: "", type: "", url: "", notes: "" };
}
function emptyProof() {
  return { id: crypto.randomUUID(), type: "", number: "", issued_by: "", url: "" };
}
function emptyContact() {
  return { id: crypto.randomUUID(), name: "", relation: "", phone: "", email: "" };
}
function emptyIncident() {
  return { id: crypto.randomUUID(), date: "", description: "", status: "" };
}
function emptyActivity() {
  return { id: crypto.randomUUID(), activity: "", level: "", year: "" };
}
function emptyNominee() {
  return {
    id: crypto.randomUUID(),
    name: "",
    relation: "",
    dob: "",
    share_percent: "",
    aadhaar: "",
  };
}

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
        entity_type: "candidate",
        entity_id: id,
        entity_label: form.full_name || id,
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
            <ListSection
              title="Identification Proofs"
              description="Driving license, voter id, passport, etc."
              items={form.identification_proofs}
              onChange={(v) => set("identification_proofs", v)}
              empty={emptyProof}
              fields={[
                { key: "type", label: "Document Type" },
                { key: "number", label: "Document Number" },
                { key: "issued_by", label: "Issued By" },
                { key: "url", label: "File URL" },
              ]}
            />
          )}
          {active === "criminal" && (
            <CriminalSection form={form} set={set} />
          )}
          {active === "extra" && (
            <ListSection
              title="Extra Curricular Activities"
              description="Sports, hobbies, achievements"
              items={form.extra_curricular}
              onChange={(v) => set("extra_curricular", v)}
              empty={emptyActivity}
              fields={[
                { key: "activity", label: "Activity" },
                { key: "level", label: "Level" },
                { key: "year", label: "Year" },
              ]}
            />
          )}
          {active === "other" && (
            <OtherSection form={form} setSection={setSection} />
          )}
          {active === "documents" && (
            <ListSection
              title="Documents"
              description="Supporting files for this candidate"
              items={form.documents}
              onChange={(v) => set("documents", v)}
              empty={emptyDoc}
              fields={[
                { key: "name", label: "Document Name" },
                { key: "type", label: "Type" },
                { key: "url", label: "File URL" },
                { key: "notes", label: "Notes" },
              ]}
            />
          )}
          {active === "nominations" && (
            <ListSection
              title="Nominations"
              description="Nominee details for PF / Gratuity / Insurance"
              items={form.nominations}
              onChange={(v) => set("nominations", v)}
              empty={emptyNominee}
              fields={[
                { key: "name", label: "Nominee Name" },
                { key: "relation", label: "Relation" },
                { key: "dob", label: "Date of Birth", type: "date" },
                { key: "share_percent", label: "Share %" },
                { key: "aadhaar", label: "Aadhaar" },
              ]}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------- Section components ---------- */

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6 border-b pb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

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

function PhysicalSection({
  form,
  setSection,
}: {
  form: any;
  setSection: (k: string, v: any) => void;
}) {
  const ph = form.physical_health ?? {};
  return (
    <div>
      <SectionHeader title="Physical & Health" desc="Fill the Physical and Health details" />

      <h3 className="mb-3 text-sm font-medium">Physical Info</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Height (in cm)">
          <Input
            type="number"
            value={ph.height ?? ""}
            onChange={(e) => setSection("physical_health", { height: e.target.value })}
          />
        </Field>
        <Field label="Weight (in kg)">
          <Input
            type="number"
            value={ph.weight ?? ""}
            onChange={(e) => setSection("physical_health", { weight: e.target.value })}
          />
        </Field>
        <Field label="Chest (in cm)">
          <Input
            type="number"
            value={ph.chest ?? ""}
            onChange={(e) => setSection("physical_health", { chest: e.target.value })}
          />
        </Field>
        <Field label="Waist (in cm)">
          <Input
            type="number"
            value={ph.waist ?? ""}
            onChange={(e) => setSection("physical_health", { waist: e.target.value })}
          />
        </Field>
        <Field label="Shoe (in cm)">
          <Input
            type="number"
            value={ph.shoe ?? ""}
            onChange={(e) => setSection("physical_health", { shoe: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-medium">Blood Group</h3>
          <Field label="Blood Group">
            <Select
              value={ph.blood_group ?? ""}
              onValueChange={(v) => setSection("physical_health", { blood_group: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
              <SelectContent>
                {BLOOD_GROUPS.map((bg) => (
                  <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-medium">Identification Mark</h3>
          <Field label="Identification Marks">
            <Textarea
              rows={2}
              value={ph.identification_marks ?? ""}
              onChange={(e) =>
                setSection("physical_health", { identification_marks: e.target.value })
              }
            />
          </Field>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium">Medical</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Known Allergies">
            <Textarea
              rows={2}
              value={ph.allergies ?? ""}
              onChange={(e) => setSection("physical_health", { allergies: e.target.value })}
            />
          </Field>
          <Field label="Chronic Conditions / Medications">
            <Textarea
              rows={2}
              value={ph.conditions ?? ""}
              onChange={(e) => setSection("physical_health", { conditions: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function ComplianceSection({
  form,
  setSection,
}: {
  form: any;
  setSection: (k: string, v: any) => void;
}) {
  const c = form.compliance ?? {};
  return (
    <div>
      <SectionHeader title="Compliance" desc="Statutory identifiers & compliance details" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="UAN (Universal Account Number)">
          <Input value={c.uan ?? ""} onChange={(e) => setSection("compliance", { uan: e.target.value })} />
        </Field>
        <Field label="PF Number">
          <Input value={c.pf_number ?? ""} onChange={(e) => setSection("compliance", { pf_number: e.target.value })} />
        </Field>
        <Field label="ESIC Number">
          <Input value={c.esic_number ?? ""} onChange={(e) => setSection("compliance", { esic_number: e.target.value })} />
        </Field>
        <Field label="ESIC Dispensary">
          <Input value={c.esic_dispensary ?? ""} onChange={(e) => setSection("compliance", { esic_dispensary: e.target.value })} />
        </Field>
        <Field label="PRAN (NPS)">
          <Input value={c.pran ?? ""} onChange={(e) => setSection("compliance", { pran: e.target.value })} />
        </Field>
        <Field label="Aadhaar Linked with PF">
          <Select
            value={c.aadhaar_linked_pf ?? ""}
            onValueChange={(v) => setSection("compliance", { aadhaar_linked_pf: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="na">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="International Worker">
          <Select
            value={c.international_worker ?? "no"}
            onValueChange={(v) => setSection("compliance", { international_worker: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Disability Status">
          <Select
            value={c.disability ?? "none"}
            onValueChange={(v) => setSection("compliance", { disability: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="physical">Physical</SelectItem>
              <SelectItem value="visual">Visual</SelectItem>
              <SelectItem value="hearing">Hearing</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function KnowledgeSection({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const educations = Array.isArray(form.educations) ? form.educations : [];
  const experiences = Array.isArray(form.experiences) ? form.experiences : [];

  return (
    <div>
      <SectionHeader title="Knowledge & Experience" desc="Education and work history" />

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Education</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set("educations", [
                ...educations,
                { id: crypto.randomUUID(), qualification: "", institute: "", year: "", percentage: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        {educations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No education records</p>
        ) : (
          <div className="space-y-3">
            {educations.map((ed: any, i: number) => (
              <div key={ed.id ?? i} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-5">
                <Input
                  placeholder="Qualification"
                  value={ed.qualification ?? ""}
                  onChange={(e) => {
                    const copy = [...educations];
                    copy[i] = { ...copy[i], qualification: e.target.value };
                    set("educations", copy);
                  }}
                />
                <Input
                  placeholder="Institute"
                  value={ed.institute ?? ""}
                  onChange={(e) => {
                    const copy = [...educations];
                    copy[i] = { ...copy[i], institute: e.target.value };
                    set("educations", copy);
                  }}
                />
                <Input
                  placeholder="Year"
                  value={ed.year ?? ""}
                  onChange={(e) => {
                    const copy = [...educations];
                    copy[i] = { ...copy[i], year: e.target.value };
                    set("educations", copy);
                  }}
                />
                <Input
                  placeholder="Percentage / Grade"
                  value={ed.percentage ?? ""}
                  onChange={(e) => {
                    const copy = [...educations];
                    copy[i] = { ...copy[i], percentage: e.target.value };
                    set("educations", copy);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="justify-self-end text-rose-500"
                  onClick={() => set("educations", educations.filter((_: any, j: number) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Experience</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set("experiences", [
                ...experiences,
                { id: crypto.randomUUID(), company: "", designation: "", location: "", from: "", to: "", reason: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        {experiences.length === 0 ? (
          <p className="text-xs text-muted-foreground">No experience records</p>
        ) : (
          <div className="space-y-3">
            {experiences.map((ex: any, i: number) => (
              <div key={ex.id ?? i} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input
                    placeholder="Company"
                    value={ex.company ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], company: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                  <Input
                    placeholder="Designation"
                    value={ex.designation ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], designation: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                  <Input
                    placeholder="Location"
                    value={ex.location ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], location: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input
                    type="date"
                    value={ex.from ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], from: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                  <Input
                    type="date"
                    value={ex.to ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], to: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                  <Input
                    placeholder="Reason for leaving"
                    value={ex.reason ?? ""}
                    onChange={(e) => {
                      const copy = [...experiences];
                      copy[i] = { ...copy[i], reason: e.target.value };
                      set("experiences", copy);
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-500"
                  onClick={() => set("experiences", experiences.filter((_: any, j: number) => j !== i))}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CriminalSection({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const ch = form.criminal_history ?? { has_history: false, incidents: [] };
  const incidents = Array.isArray(ch.incidents) ? ch.incidents : [];
  return (
    <div>
      <SectionHeader title="Criminal History" desc="Declarations and incidents" />
      <div className="mb-4 flex items-center gap-3 rounded-md border p-3">
        <Switch
          checked={!!ch.has_history}
          onCheckedChange={(v) => set("criminal_history", { ...ch, has_history: v })}
        />
        <div>
          <p className="text-sm font-medium">Candidate has criminal history</p>
          <p className="text-xs text-muted-foreground">Toggle on to record incident details below</p>
        </div>
      </div>

      {ch.has_history && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Incidents</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("criminal_history", { ...ch, incidents: [...incidents, emptyIncident()] })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </div>
          {incidents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No incidents recorded</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc: any, i: number) => (
                <div key={inc.id ?? i} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-[140px_1fr_160px_40px]">
                  <Input
                    type="date"
                    value={inc.date ?? ""}
                    onChange={(e) => {
                      const copy = [...incidents];
                      copy[i] = { ...copy[i], date: e.target.value };
                      set("criminal_history", { ...ch, incidents: copy });
                    }}
                  />
                  <Input
                    placeholder="Description"
                    value={inc.description ?? ""}
                    onChange={(e) => {
                      const copy = [...incidents];
                      copy[i] = { ...copy[i], description: e.target.value };
                      set("criminal_history", { ...ch, incidents: copy });
                    }}
                  />
                  <Input
                    placeholder="Status (closed / pending)"
                    value={inc.status ?? ""}
                    onChange={(e) => {
                      const copy = [...incidents];
                      copy[i] = { ...copy[i], status: e.target.value };
                      set("criminal_history", { ...ch, incidents: copy });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-rose-500"
                    onClick={() =>
                      set("criminal_history", {
                        ...ch,
                        incidents: incidents.filter((_: any, j: number) => j !== i),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OtherSection({
  form,
  setSection,
}: {
  form: any;
  setSection: (k: string, v: any) => void;
}) {
  const o = form.other_info ?? {};
  return (
    <div>
      <SectionHeader title="Other Info" desc="Additional candidate-related notes" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Marital Anniversary">
          <Input type="date" value={o.anniversary ?? ""} onChange={(e) => setSection("other_info", { anniversary: e.target.value })} />
        </Field>
        <Field label="Spouse Name">
          <Input value={o.spouse_name ?? ""} onChange={(e) => setSection("other_info", { spouse_name: e.target.value })} />
        </Field>
        <Field label="Father's Name">
          <Input value={o.father_name ?? ""} onChange={(e) => setSection("other_info", { father_name: e.target.value })} />
        </Field>
        <Field label="Mother's Name">
          <Input value={o.mother_name ?? ""} onChange={(e) => setSection("other_info", { mother_name: e.target.value })} />
        </Field>
        <Field label="Vehicle Number">
          <Input value={o.vehicle_number ?? ""} onChange={(e) => setSection("other_info", { vehicle_number: e.target.value })} />
        </Field>
        <Field label="Driving License">
          <Input value={o.driving_license ?? ""} onChange={(e) => setSection("other_info", { driving_license: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Additional Notes">
          <Textarea rows={4} value={o.notes ?? ""} onChange={(e) => setSection("other_info", { notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function ListSection({
  title,
  description,
  items,
  onChange,
  empty,
  fields,
}: {
  title: string;
  description?: string;
  items: any[];
  onChange: (next: any[]) => void;
  empty: () => any;
  fields: { key: string; label: string; type?: string }[];
}) {
  return (
    <div>
      <SectionHeader title={title} desc={description} />
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{items.length} item(s)</p>
        <Button size="sm" variant="outline" onClick={() => onChange([...items, empty()])}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
          No records yet. Click Add to create one.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.id ?? i} className="rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {fields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      type={f.type ?? "text"}
                      value={item[f.key] ?? ""}
                      onChange={(e) => {
                        const copy = [...items];
                        copy[i] = { ...copy[i], [f.key]: e.target.value };
                        onChange(copy);
                      }}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-2 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-500"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
