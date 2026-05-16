import { Plus, Trash2 } from "lucide-react";
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

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const ID_PROOF_TYPES = ["Driving License", "Passport", "Voter ID", "Ration Card", "Other"];

export function emptyDoc() {
  return { id: crypto.randomUUID(), name: "", type: "", url: "", notes: "" };
}
export function emptyProof() {
  return { id: crypto.randomUUID(), type: "", number: "", issued_by: "", valid_until: "", url: "" };
}
export function emptyContact() {
  return { id: crypto.randomUUID(), name: "", relation: "", phone: "", email: "" };
}
export function emptyIncident() {
  return { id: crypto.randomUUID(), date: "", description: "", status: "" };
}
export function emptyActivity() {
  return { id: crypto.randomUUID(), activity: "", level: "", year: "" };
}
export function emptyNominee() {
  return {
    id: crypto.randomUUID(),
    name: "",
    relation: "",
    dob: "",
    share_percent: "",
    aadhaar: "",
  };
}

export function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6 border-b pb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

type SetSection = (k: string, v: any) => void;
type SetField = (k: string, v: any) => void;

export function PhysicalSection({ form, setSection }: { form: any; setSection: SetSection }) {
  const ph = form.physical_health ?? {};
  return (
    <div>
      <SectionHeader title="Physical & Health" desc="Fill the Physical and Health details" />
      <h3 className="mb-3 text-sm font-medium">Physical Info</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ["Height (in cm)", "height"],
          ["Weight (in kg)", "weight"],
          ["Chest (in cm)", "chest"],
          ["Waist (in cm)", "waist"],
          ["Shoe (in cm)", "shoe"],
        ].map(([label, key]) => (
          <Field key={key} label={label}>
            <Input
              type="number"
              value={ph[key] ?? ""}
              onChange={(e) => setSection("physical_health", { [key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Blood Group">
          <Select
            value={ph.blood_group ?? ""}
            onValueChange={(v) => setSection("physical_health", { blood_group: v })}
          >
            <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
            <SelectContent>
              {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Identification Marks">
          <Textarea
            rows={2}
            value={ph.identification_marks ?? ""}
            onChange={(e) => setSection("physical_health", { identification_marks: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Known Allergies">
          <Textarea rows={2} value={ph.allergies ?? ""} onChange={(e) => setSection("physical_health", { allergies: e.target.value })} />
        </Field>
        <Field label="Chronic Conditions / Medications">
          <Textarea rows={2} value={ph.conditions ?? ""} onChange={(e) => setSection("physical_health", { conditions: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

export function ComplianceSection({ form, setSection }: { form: any; setSection: SetSection }) {
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
          <Select value={c.aadhaar_linked_pf ?? ""} onValueChange={(v) => setSection("compliance", { aadhaar_linked_pf: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="na">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="International Worker">
          <Select value={c.international_worker ?? "no"} onValueChange={(v) => setSection("compliance", { international_worker: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Disability Status">
          <Select value={c.disability ?? "none"} onValueChange={(v) => setSection("compliance", { disability: v })}>
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

export function KnowledgeSection({ form, set }: { form: any; set: SetField }) {
  const educations = Array.isArray(form.educations) ? form.educations : [];
  const experiences = Array.isArray(form.experiences) ? form.experiences : [];
  return (
    <div>
      <SectionHeader title="Knowledge & Experience" desc="Education and work history" />
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium">Education</h3>
          <Button size="sm" variant="outline" onClick={() => set("educations", [...educations, { id: crypto.randomUUID(), qualification: "", institute: "", year: "", percentage: "" }])}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        {educations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No education records</p>
        ) : (
          <div className="space-y-3">
            {educations.map((ed: any, i: number) => (
              <div key={ed.id ?? i} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-5">
                {["qualification", "institute", "year", "percentage"].map((k) => (
                  <Input
                    key={k}
                    placeholder={k === "percentage" ? "Percentage / Grade" : k.charAt(0).toUpperCase() + k.slice(1)}
                    value={ed[k] ?? ""}
                    onChange={(e) => {
                      const copy = [...educations];
                      copy[i] = { ...copy[i], [k]: e.target.value };
                      set("educations", copy);
                    }}
                  />
                ))}
                <Button variant="ghost" size="icon" className="justify-self-end text-rose-500" onClick={() => set("educations", educations.filter((_: any, j: number) => j !== i))}>
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
          <Button size="sm" variant="outline" onClick={() => set("experiences", [...experiences, { id: crypto.randomUUID(), company: "", designation: "", location: "", from: "", to: "", reason: "" }])}>
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
                  {["company", "designation", "location"].map((k) => (
                    <Input
                      key={k}
                      placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                      value={ex[k] ?? ""}
                      onChange={(e) => {
                        const copy = [...experiences];
                        copy[i] = { ...copy[i], [k]: e.target.value };
                        set("experiences", copy);
                      }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input type="date" value={ex.from ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], from: e.target.value }; set("experiences", copy); }} />
                  <Input type="date" value={ex.to ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], to: e.target.value }; set("experiences", copy); }} />
                  <Input placeholder="Reason for leaving" value={ex.reason ?? ""} onChange={(e) => { const copy = [...experiences]; copy[i] = { ...copy[i], reason: e.target.value }; set("experiences", copy); }} />
                </div>
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => set("experiences", experiences.filter((_: any, j: number) => j !== i))}>
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

export function CriminalSection({ form, set }: { form: any; set: SetField }) {
  const ch = form.criminal_history ?? { has_history: false, incidents: [] };
  const incidents = Array.isArray(ch.incidents) ? ch.incidents : [];
  return (
    <div>
      <SectionHeader title="Criminal History" desc="Declarations and incidents" />
      <div className="mb-4 flex items-center gap-3 rounded-md border p-3">
        <Switch checked={!!ch.has_history} onCheckedChange={(v) => set("criminal_history", { ...ch, has_history: v })} />
        <div>
          <p className="text-sm font-medium">Candidate has criminal history</p>
          <p className="text-xs text-muted-foreground">Toggle on to record incident details below</p>
        </div>
      </div>
      {ch.has_history && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Incidents</h3>
            <Button size="sm" variant="outline" onClick={() => set("criminal_history", { ...ch, incidents: [...incidents, emptyIncident()] })}>
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </div>
          {incidents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No incidents recorded</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc: any, i: number) => (
                <div key={inc.id ?? i} className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-[140px_1fr_160px_40px]">
                  <Input type="date" value={inc.date ?? ""} onChange={(e) => { const copy = [...incidents]; copy[i] = { ...copy[i], date: e.target.value }; set("criminal_history", { ...ch, incidents: copy }); }} />
                  <Input placeholder="Description" value={inc.description ?? ""} onChange={(e) => { const copy = [...incidents]; copy[i] = { ...copy[i], description: e.target.value }; set("criminal_history", { ...ch, incidents: copy }); }} />
                  <Input placeholder="Status (closed / pending)" value={inc.status ?? ""} onChange={(e) => { const copy = [...incidents]; copy[i] = { ...copy[i], status: e.target.value }; set("criminal_history", { ...ch, incidents: copy }); }} />
                  <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => set("criminal_history", { ...ch, incidents: incidents.filter((_: any, j: number) => j !== i) })}>
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

export function OtherSection({ form, setSection }: { form: any; setSection: SetSection }) {
  const o = form.other_info ?? {};
  return (
    <div>
      <SectionHeader title="Other Info" desc="Additional candidate-related notes" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Marital Anniversary"><Input type="date" value={o.anniversary ?? ""} onChange={(e) => setSection("other_info", { anniversary: e.target.value })} /></Field>
        <Field label="Spouse Name"><Input value={o.spouse_name ?? ""} onChange={(e) => setSection("other_info", { spouse_name: e.target.value })} /></Field>
        <Field label="Father's Name"><Input value={o.father_name ?? ""} onChange={(e) => setSection("other_info", { father_name: e.target.value })} /></Field>
        <Field label="Mother's Name"><Input value={o.mother_name ?? ""} onChange={(e) => setSection("other_info", { mother_name: e.target.value })} /></Field>
        <Field label="Vehicle Number"><Input value={o.vehicle_number ?? ""} onChange={(e) => setSection("other_info", { vehicle_number: e.target.value })} /></Field>
        <Field label="Driving License"><Input value={o.driving_license ?? ""} onChange={(e) => setSection("other_info", { driving_license: e.target.value })} /></Field>
      </div>
      <div className="mt-4">
        <Field label="Additional Notes"><Textarea rows={4} value={o.notes ?? ""} onChange={(e) => setSection("other_info", { notes: e.target.value })} /></Field>
      </div>
    </div>
  );
}

export function ListSection({
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
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>
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

export function IdentificationSection({ form, set, setSection }: { form: any; set: SetField; setSection: SetSection }) {
  const proofs: any[] = Array.isArray(form.identification_proofs) ? form.identification_proofs : [];
  const weapon = form.other_info?.weapon_license ?? { has_weapon: false, number: "", valid_until: "", valid_area: "" };
  const uploaded = [
    { label: "Photo", url: form.photo_url },
    { label: "Aadhaar Card", url: form.aadhaar_image_url, number: form.aadhaar_number },
    { label: "PAN Card", url: form.pan_image_url, number: form.pan_number },
    { label: "Signature", url: form.signature_url },
  ];
  return (
    <div>
      <SectionHeader title="Identification Proofs" desc="Uploaded documents, additional proofs and weapon license" />
      <h3 className="mb-3 text-sm font-medium">Uploaded Documents</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {uploaded.map((u) => (
          <div key={u.label} className="rounded-md border p-3 text-center">
            {u.url ? (
              <a href={u.url} target="_blank" rel="noreferrer" className="block">
                <img src={u.url} alt={u.label} className="mx-auto h-24 w-full rounded object-contain" />
              </a>
            ) : (
              <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">Not uploaded</div>
            )}
            <p className="mt-2 text-xs font-medium">{u.label}</p>
            {u.number && <p className="text-[10px] text-muted-foreground">{u.number}</p>}
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Additional Identification Documents</h3>
        <Button size="sm" variant="outline" onClick={() => set("identification_proofs", [...proofs, emptyProof()])}>
          <Plus className="mr-1 h-3 w-3" /> Add Another Document
        </Button>
      </div>
      {proofs.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No additional documents. Click "Add Another Document" to add Driving License, Passport, Voter ID, etc.
        </p>
      ) : (
        <div className="space-y-3">
          {proofs.map((p, i) => (
            <div key={p.id ?? i} className="rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Document Type">
                  <Select value={p.type ?? ""} onValueChange={(v) => { const copy = [...proofs]; copy[i] = { ...copy[i], type: v }; set("identification_proofs", copy); }}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {ID_PROOF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Document Number">
                  <Input value={p.number ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], number: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <Field label="Issued By">
                  <Input value={p.issued_by ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], issued_by: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <Field label="Valid Until">
                  <Input type="date" value={p.valid_until ?? ""} onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], valid_until: e.target.value }; set("identification_proofs", copy); }} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="File URL">
                    <Input value={p.url ?? ""} placeholder="https://..." onChange={(e) => { const copy = [...proofs]; copy[i] = { ...copy[i], url: e.target.value }; set("identification_proofs", copy); }} />
                  </Field>
                </div>
              </div>
              <div className="mt-2 text-right">
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => set("identification_proofs", proofs.filter((_, j) => j !== i))}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium">Weapon License</h3>
        <div className="mb-3 flex items-center gap-3 rounded-md border p-3">
          <Switch checked={!!weapon.has_weapon} onCheckedChange={(v) => setSection("other_info", { weapon_license: { ...weapon, has_weapon: v } })} />
          <div>
            <p className="text-sm font-medium">Candidate holds a weapon license</p>
            <p className="text-xs text-muted-foreground">Toggle on to record license details</p>
          </div>
        </div>
        {weapon.has_weapon && (
          <div className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-3">
            <Field label="License Number"><Input value={weapon.number ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, number: e.target.value } })} /></Field>
            <Field label="Valid Until"><Input type="date" value={weapon.valid_until ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, valid_until: e.target.value } })} /></Field>
            <Field label="Valid Area"><Input placeholder="e.g. Delhi NCR" value={weapon.valid_area ?? ""} onChange={(e) => setSection("other_info", { weapon_license: { ...weapon, valid_area: e.target.value } })} /></Field>
          </div>
        )}
      </div>
    </div>
  );
}
