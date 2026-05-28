import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Briefcase,
  Camera,
  Download,
  FileSignature,
  GraduationCap,
  Heart,
  IdCard,
  Languages as LanguagesIcon,
  Mail,
  MapPin,
  Phone as PhoneIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  UserCheck,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { computeWages, fmtINR, type ContractResourceLike } from "@/lib/payroll-calc";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  DOC_TYPE_LABELS,
  generateDocumentPdf,
  downloadBlob,
  type DocType,
} from "@/lib/company-documents";
import { logActivity } from "@/lib/activity-log";

export const Route = createFileRoute("/admin/profile")({
  component: ProfilePage,
});

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setReady(false);
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e: any) {
        setError(e?.message || "Camera not available");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onOpenChange(false);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={snap} disabled={!ready || !!error}>
            <Camera className="mr-1.5 h-4 w-4" /> Capture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProfileData = {
  id: string;
  full_name: string;
  employee_code: string;
  candidate_code: string;
  status: string;
  role_key: string;
  photo_url: string;
  aadhaar_image_url: string;
  pan_image_url: string;
  signature_url: string;
  aadhaar_number: string;
  pan_number: string;
  mobile: string;
  email: string;
  date_of_birth: string | null;
  gender: string;
  marital_status: string;
  blood_group?: string;
  present_address1: string;
  present_address2: string;
  present_city: string;
  present_state: string;
  present_pincode: string;
  permanent_address1: string;
  permanent_city: string;
  permanent_state: string;
  permanent_pincode: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  preferred_joining_date: string | null;
  approved_at: string | null;
  unit_id: string | null;
  designation_id: string | null;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_mobile: string;
  bank_account_type: string;
  documents: Array<{ name?: string; url?: string; type?: string }>;
  identification_proofs: Array<{ type?: string; number?: string; url?: string }>;
  assigned_asset_ids: string[];
  contacts: Array<{ name?: string; relation?: string; mobile?: string; occupation?: string; alive?: boolean }>;
  nominations: Array<{ name?: string; relation?: string; share?: number; dob?: string; aadhaar?: string }>;
  references: Array<{ name?: string; relation?: string; mobile?: string; email?: string; address?: string }>;
  languages: Array<{ name?: string; read?: boolean; write?: boolean; speak?: boolean }>;
  experiences: Array<{ company?: string; designation?: string; from?: string; to?: string; salary?: string; reason_for_leaving?: string }>;
  educations: Array<{ qualification?: string; institution?: string; year?: string; percentage?: string }>;
  extra_curricular: Array<{ activity?: string; level?: string; year?: string }>;
  criminal_history: { has_history?: boolean; incidents?: Array<{ description?: string; year?: string }> };
  physical_health_full: Record<string, string>;
  other_info: Record<string, string>;
};

type LookupRow = { id: string; name: string };
type UnitRow = { id: string; name: string; city?: string };
type SignedDocRow = {
  id: string;
  doc_type: string;
  version: number;
  signed_at: string | null;
  rendered_body: string;
  employee_signature_data: string;
  company_signature_data: string;
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const phone = useMemo(
    () => (user?.phone ?? "").replace(/\D/g, "").slice(-10),
    [user?.phone],
  );

  const profileQ = useQuery({
    queryKey: ["my-profile", phone],
    enabled: !!phone,
    queryFn: async (): Promise<ProfileData | null> => {
      const { data, error } = await supabase
        .from("candidates")
        .select(
          "id,full_name,employee_code,candidate_code,status,role_key,photo_url,aadhaar_image_url,pan_image_url,signature_url,aadhaar_number,pan_number,mobile,email,date_of_birth,gender,marital_status,present_address1,present_address2,present_city,present_state,present_pincode,permanent_address1,permanent_city,permanent_state,permanent_pincode,bank_account_holder,bank_account_number,bank_ifsc,bank_name,bank_branch,bank_account_type,emergency_contact_name,emergency_contact_relation,emergency_contact_mobile,preferred_joining_date,approved_at,unit_id,designation_id,documents,identification_proofs,assigned_asset_ids,physical_health,contacts,nominations,references,languages,experiences,educations,extra_curricular,criminal_history,other_info",
        )
        .eq("mobile", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as any;
      const arr = (v: any) => (Array.isArray(v) ? v : []);
      return {
        ...row,
        blood_group: row.physical_health?.blood_group ?? "",
        physical_health_full: row.physical_health ?? {},
        other_info: row.other_info ?? {},
        documents: arr(row.documents),
        identification_proofs: arr(row.identification_proofs),
        assigned_asset_ids: arr(row.assigned_asset_ids),
        contacts: arr(row.contacts),
        nominations: arr(row.nominations),
        references: arr(row.references),
        languages: arr(row.languages),
        experiences: arr(row.experiences),
        educations: arr(row.educations),
        extra_curricular: arr(row.extra_curricular),
        criminal_history: row.criminal_history ?? { has_history: false, incidents: [] },
      } as ProfileData;
    },
  });

  const profile = profileQ.data ?? null;

  const lookupsQ = useQuery({
    queryKey: ["my-profile-lookups", profile?.unit_id, profile?.designation_id, profile?.role_key],
    enabled: !!profile,
    queryFn: async () => {
      const [unitRes, desigRes, roleRes, assetRes] = await Promise.all([
        profile?.unit_id
          ? supabase.from("units").select("id,name,city").eq("id", profile.unit_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        profile?.designation_id
          ? supabase
              .from("designations")
              .select("id,name")
              .eq("id", profile.designation_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        profile?.role_key
          ? supabase.from("roles").select("key,name").eq("key", profile.role_key).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        profile?.assigned_asset_ids?.length
          ? supabase.from("assets").select("id,name").in("id", profile.assigned_asset_ids)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      return {
        unit: (unitRes.data as UnitRow | null) ?? null,
        designation: (desigRes.data as LookupRow | null) ?? null,
        role: (roleRes.data as { key: string; name: string } | null) ?? null,
        assets: (assetRes.data as LookupRow[] | null) ?? [],
      };
    },
  });

  const docsQ = useQuery({
    queryKey: ["my-signed-docs", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<SignedDocRow[]> => {
      const { data, error } = await supabase
        .from("employee_signed_documents")
        .select(
          "id,doc_type,version,signed_at,rendered_body,employee_signature_data,company_signature_data",
        )
        .eq("candidate_id", profile!.id)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SignedDocRow[];
    },
  });

  async function handlePhoto(file: File) {
    if (!profile) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `photo/${profile.aadhaar_number || profile.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("candidate-files")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("candidate-files").getPublicUrl(path);
      const url = pub.publicUrl;
      const upd = await supabase
        .from("candidates")
        .update({ photo_url: url })
        .eq("id", profile.id);
      if (upd.error) throw upd.error;
      void logActivity({
        module: "My Profile",
        action: "update",
        entityType: "candidates",
        entityId: profile.id,
        entityLabel: profile.full_name,
        details: { field: "photo_url" },
      });
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["my-profile", phone] });
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDownloadSigned(row: SignedDocRow) {
    if (!profile) return;
    setDownloadingDoc(row.id);
    try {
      const label = DOC_TYPE_LABELS[row.doc_type as DocType] ?? row.doc_type;
      const blob = await generateDocumentPdf({
        title: label,
        body: row.rendered_body,
        employeeSignatureDataUrl: row.employee_signature_data || undefined,
        companySignatureDataUrl: row.company_signature_data || undefined,
        employeeName: profile.full_name,
        employeeCode: profile.employee_code,
        signedAt: row.signed_at,
      });
      const filename = `${label.replace(/\s+/g, "_")}-${profile.employee_code || profile.candidate_code || "doc"}.pdf`;
      downloadBlob(blob, filename);
    } catch (e: any) {
      toast.error(e?.message || "Could not generate PDF");
    } finally {
      setDownloadingDoc(null);
    }
  }

  if (!phone) {
    return (
      <div>
        <PageHeader title="My Profile" crumbs={[{ label: "My Profile" }]} />
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Sign in to view your profile.
        </div>
      </div>
    );
  }

  if (profileQ.isLoading) {
    return (
      <div>
        <PageHeader title="My Profile" crumbs={[{ label: "My Profile" }]} />
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeader title="My Profile" crumbs={[{ label: "My Profile" }]} />
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No employee record is linked to your phone number ({phone}). Please contact your admin.
        </div>
      </div>
    );
  }

  const lookups = lookupsQ.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Profile"
        description="Your personal record, role, documents, and uploads."
        crumbs={[{ label: "My Profile" }]}
      />

      {/* Hero card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="block h-28 w-28 overflow-hidden rounded-2xl border border-border bg-secondary"
              title="Change photo"
            >
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={profile.full_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
                  {(profile.full_name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  className="absolute -bottom-2 -right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                  title="Change photo"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCameraOpen(true)}>
                  <Camera className="mr-2 h-4 w-4" /> Take photo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(f);
              }}
            />
            <CameraCaptureDialog
              open={cameraOpen}
              onOpenChange={setCameraOpen}
              onCapture={handlePhoto}
            />
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {profile.full_name || "Unnamed"}
              </h1>
              <Badge variant="outline" className="capitalize">
                {profile.status}
              </Badge>
              {lookups?.role?.name && (
                <Badge className="bg-accent/15 text-accent">{lookups.role.name}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {lookups?.designation?.name || "—"}
              {lookups?.unit ? ` · ${lookups.unit.name}` : ""}
              {lookups?.unit?.city ? ` (${lookups.unit.city})` : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <InfoRow label="Employee Code" value={profile.employee_code || "—"} />
              <InfoRow
                label="Date of Joining"
                value={
                  profile.approved_at?.slice(0, 10) ??
                  profile.preferred_joining_date ??
                  "—"
                }
              />
              <InfoRow label="Status" value={profile.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Contact" icon={PhoneIcon}>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Mobile" value={profile.mobile} />
            <InfoRow label="Email" value={profile.email} />
            <InfoRow
              label="Date of Birth"
              value={profile.date_of_birth ?? "—"}
            />
            <InfoRow label="Gender" value={profile.gender} />
            <InfoRow label="Marital Status" value={profile.marital_status} />
            <InfoRow label="Blood Group" value={profile.blood_group} />
          </div>
        </Section>

        <Section title="Addresses" icon={MapPin}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Present
              </div>
              <p className="text-sm">
                {[
                  profile.present_address1,
                  profile.present_address2,
                  profile.present_city,
                  profile.present_state,
                  profile.present_pincode,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Permanent
              </div>
              <p className="text-sm">
                {[
                  profile.permanent_address1,
                  profile.permanent_city,
                  profile.permanent_state,
                  profile.permanent_pincode,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Identification" icon={IdCard}>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Aadhaar" value={profile.aadhaar_number} />
            <InfoRow label="PAN" value={profile.pan_number} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Photo", url: profile.photo_url },
              { label: "Aadhaar", url: profile.aadhaar_image_url },
              { label: "PAN", url: profile.pan_image_url },
              { label: "Signature", url: profile.signature_url },
              ...profile.identification_proofs.map((p, i) => ({
                label: p.type || `Proof ${i + 1}`,
                url: p.url || "",
              })),
            ].map((p, i) => (
              <a
                key={`${p.label}-${i}`}
                href={p.url || "#"}
                target="_blank"
                rel="noreferrer"
                className={
                  "flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium " +
                  (p.url
                    ? "hover:border-accent hover:text-accent"
                    : "cursor-not-allowed opacity-50")
                }
                onClick={(e) => {
                  if (!p.url) e.preventDefault();
                }}
              >
                <span>{p.label}</span>
                <Download className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </Section>

        <Section title="Bank" icon={ShieldCheck}>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Account Holder" value={profile.bank_account_holder} />
            <InfoRow label="Account Number" value={profile.bank_account_number} />
            <InfoRow label="IFSC" value={profile.bank_ifsc} />
            <InfoRow label="Bank" value={profile.bank_name} />
            <InfoRow label="Branch" value={profile.bank_branch} />
            <InfoRow label="Account Type" value={profile.bank_account_type} />
          </div>
        </Section>

        <Section title="Emergency Contact" icon={ShieldAlert}>
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoRow label="Name" value={profile.emergency_contact_name} />
            <InfoRow label="Relation" value={profile.emergency_contact_relation} />
            <InfoRow label="Mobile" value={profile.emergency_contact_mobile} />
          </div>
        </Section>

        <Section title="Family & Contacts" icon={Users}>
          {profile.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No family contacts on file.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.contacts.map((c, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 py-2 text-sm sm:grid-cols-4">
                  <span className="font-medium">{c.name || "—"}</span>
                  <span className="text-muted-foreground">{c.relation || "—"}</span>
                  <span className="font-mono text-xs">{c.mobile || "—"}</span>
                  <span className="text-muted-foreground">{c.occupation || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Nominees" icon={UserCheck}>
          {profile.nominations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nominees added.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.nominations.map((n, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 py-2 text-sm sm:grid-cols-4">
                  <span className="font-medium">{n.name || "—"}</span>
                  <span className="text-muted-foreground">{n.relation || "—"}</span>
                  <span className="text-muted-foreground">DOB: {n.dob || "—"}</span>
                  <span className="font-semibold text-accent">{n.share ?? "—"}%</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="References" icon={UserCheck}>
          {profile.references.length === 0 ? (
            <p className="text-sm text-muted-foreground">No references provided.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.references.map((r, i) => (
                <li key={i} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name || "—"}</span>
                    <span className="text-xs text-muted-foreground">· {r.relation || "—"}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {r.mobile && <span className="font-mono">{r.mobile}</span>}
                    {r.email && <span>{r.email}</span>}
                    {r.address && <span>{r.address}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Languages" icon={LanguagesIcon}>
          {profile.languages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No languages listed.</p>
          ) : (
            <ul className="space-y-2">
              {profile.languages.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{l.name || "—"}</span>
                  <span className="flex gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                    {l.read && <Badge variant="outline">Read</Badge>}
                    {l.write && <Badge variant="outline">Write</Badge>}
                    {l.speak && <Badge variant="outline">Speak</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Work Experience" icon={Briefcase}>
          {profile.experiences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No previous experience recorded.</p>
          ) : (
            <ul className="space-y-3">
              {profile.experiences.map((e, i) => (
                <li key={i} className="rounded-lg border border-border/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{e.company || "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.from || "?"} → {e.to || "Present"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {e.designation || "—"}
                    {e.salary ? ` · ₹${e.salary}` : ""}
                  </div>
                  {e.reason_for_leaving && (
                    <div className="mt-1 text-xs italic text-muted-foreground">
                      Left: {e.reason_for_leaving}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Education" icon={GraduationCap}>
          {profile.educations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No education records.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.educations.map((ed, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 py-2 text-sm sm:grid-cols-4">
                  <span className="font-medium">{ed.qualification || "—"}</span>
                  <span className="text-muted-foreground">{ed.institution || "—"}</span>
                  <span className="text-muted-foreground">{ed.year || "—"}</span>
                  <span className="font-semibold">{ed.percentage ? `${ed.percentage}%` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Physical Health" icon={Heart}>
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoRow label="Height" value={profile.physical_health_full.height_cm ? `${profile.physical_health_full.height_cm} cm` : ""} />
            <InfoRow label="Weight" value={profile.physical_health_full.weight_kg ? `${profile.physical_health_full.weight_kg} kg` : ""} />
            <InfoRow label="Blood Group" value={profile.blood_group} />
            <InfoRow label="Identification Marks" value={profile.physical_health_full.identification_marks} />
            <InfoRow label="Disabilities" value={profile.physical_health_full.disabilities} />
            <InfoRow label="Allergies" value={profile.physical_health_full.allergies} />
          </div>
        </Section>

        <Section title="Extra Curricular" icon={Activity}>
          {profile.extra_curricular.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {profile.extra_curricular.map((x, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="font-medium">{x.activity || "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {x.level || "—"}{x.year ? ` · ${x.year}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Other Info" icon={Sparkles}>
          {Object.keys(profile.other_info || {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No additional info.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(profile.other_info).map(([k, v]) => (
                <InfoRow
                  key={k}
                  label={k.replace(/_/g, " ")}
                  value={String(v ?? "")}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Criminal History" icon={ShieldAlert}>
          {profile.criminal_history?.has_history ? (
            <ul className="space-y-2 text-sm">
              {(profile.criminal_history.incidents ?? []).map((inc, i) => (
                <li key={i} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <div className="font-medium">{inc.description || "—"}</div>
                  <div className="text-xs text-muted-foreground">{inc.year || ""}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No criminal history declared.</p>
          )}
        </Section>

        <Section title="Assigned Assets" icon={Mail}>
          {(lookups?.assets?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No assets assigned.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {lookups!.assets.map((a) => (
                <li
                  key={a.id}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold"
                >
                  {a.name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Other Documents" icon={Upload}>
          {profile.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No additional documents uploaded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.documents.map((d, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate">{d.name || `Document ${i + 1}`}</span>
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" /> Open
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Signed Documents" icon={FileSignature}>
        {docsQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (docsQ.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven't signed any company documents yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {docsQ.data!.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="text-sm font-semibold">
                    {DOC_TYPE_LABELS[d.doc_type as DocType] ?? d.doc_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    v{d.version}
                    {d.signed_at
                      ? ` · Signed ${new Date(d.signed_at).toLocaleDateString()}`
                      : " · Unsigned"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={downloadingDoc === d.id}
                  onClick={() => handleDownloadSigned(d)}
                >
                  {downloadingDoc === d.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Download PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
