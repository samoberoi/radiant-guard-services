import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Fuel, MapPin, Plus, Trash2, Upload, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVehicleOptions, fmtDate } from "@/lib/vehicle-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/vehicles/fuel-manager")({
  component: FuelManagerPage,
});

const MODULE = "Fuel Manager";
const ENTITY = "vehicle_fuel_entries";
const QK = ["admin", "vehicle-fuel-entries"] as const;
const BUCKET = "vehicle-fuel-proofs";

const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric"] as const;
const PAYMENT_MODES = ["Fuel Card", "Cash", "UPI", "Other"] as const;

type FuelEntry = {
  id: string;
  vehicle_id: string;
  entry_date: string;
  entry_time: string | null;
  fuel_type: string;
  odometer_km: number;
  quantity: number;
  rate: number;
  amount: number;
  payment_mode: string;
  location_text: string;
  geo_lat: number | null;
  geo_lng: number | null;
  odometer_photo_url: string;
  pump_photo_url: string;
  receipt_photo_url: string;
  notes: string;
  created_at: string;
};

function rowToEntry(r: Record<string, unknown>): FuelEntry {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    entry_date: String(r.entry_date ?? ""),
    entry_time: (r.entry_time as string | null) ?? null,
    fuel_type: String(r.fuel_type ?? ""),
    odometer_km: Number(r.odometer_km ?? 0),
    quantity: Number(r.quantity ?? 0),
    rate: Number(r.rate ?? 0),
    amount: Number(r.amount ?? 0),
    payment_mode: String(r.payment_mode ?? ""),
    location_text: String(r.location_text ?? ""),
    geo_lat: r.geo_lat == null ? null : Number(r.geo_lat),
    geo_lng: r.geo_lng == null ? null : Number(r.geo_lng),
    odometer_photo_url: String(r.odometer_photo_url ?? ""),
    pump_photo_url: String(r.pump_photo_url ?? ""),
    receipt_photo_url: String(r.receipt_photo_url ?? ""),
    notes: String(r.notes ?? ""),
    created_at: String(r.created_at ?? ""),
  };
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function FuelManagerPage() {
  const qc = useQueryClient();
  const vehOptsQ = useVehicleOptions();
  const vehicles = vehOptsQ.data ?? [];
  const vehMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(v.id, v.vehicle_number);
    return m;
  }, [vehicles]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<FuelEntry[]> => {
      const { data, error } = await supabase
        .from(ENTITY as never)
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToEntry);
    },
  });

  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (vehicleFilter !== "all" && e.vehicle_id !== vehicleFilter) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    });
  }, [entries, vehicleFilter, from, to]);

  const stats = useMemo(() => {
    const totalSpend = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    const byFuel: Record<string, number> = { Petrol: 0, Diesel: 0, CNG: 0 };
    const byPayment: Record<string, number> = {};
    for (const e of filtered) {
      if (e.fuel_type in byFuel) byFuel[e.fuel_type] += e.amount || 0;
      byPayment[e.payment_mode] = (byPayment[e.payment_mode] ?? 0) + (e.amount || 0);
    }
    return { totalSpend, entries: filtered.length, byFuel, byPayment };
  }, [filtered]);

  const [open, setOpen] = useState(false);

  const delMut = useMutation({
    mutationFn: async (e: FuelEntry) => {
      const { error } = await supabase.from(ENTITY as never).delete().eq("id", e.id);
      if (error) throw error;
      await logActivity({
        module: MODULE, action: "delete", entityType: ENTITY, entityId: e.id,
        entityLabel: `${vehMap.get(e.vehicle_id) ?? "Vehicle"} • ${fmtDate(e.entry_date)} • ${inr(e.amount)}`,
        before: e as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      toast.success("Fuel entry deleted");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  async function handleDelete(e: FuelEntry) {
    const ok = await confirmAction({
      title: "Delete fuel entry?",
      description: `${vehMap.get(e.vehicle_id) ?? "Vehicle"} • ${fmtDate(e.entry_date)} • ${inr(e.amount)}`,
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) delMut.mutate(e);
  }

  return (
    <div>
      <PageHeader
        title="Fuel Manager"
        description="Log every fuel top-up with proof photos. Track spend and mileage per vehicle."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Fuel Manager" }]}
      />

      {/* Payment mode breakdown chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment mix</span>
        {(["Fuel Card", "Cash", "UPI", "Other"] as const).map((pm) => {
          const v = stats.byPayment[pm] ?? 0;
          const pct = stats.totalSpend > 0 ? Math.round((v / stats.totalSpend) * 100) : 0;
          return (
            <div key={pm} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
              <span className="font-medium">{pm}</span>
              <span className="tabular-nums text-muted-foreground">{inr(v)}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{pct}%</span>
            </div>
          );
        })}
        <div className="ml-auto rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs">
          <span className="font-medium text-accent">Total Spend</span>
          <span className="ml-2 tabular-nums font-semibold">{inr(stats.totalSpend)}</span>
          <span className="ml-2 text-muted-foreground">· {stats.entries} entries</span>
        </div>
      </div>

      {/* Fuel-type circular meters */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <FuelMeter label="Petrol" amount={stats.byFuel.Petrol} total={stats.totalSpend} color="hsl(35 92% 55%)" />
        <FuelMeter label="Diesel" amount={stats.byFuel.Diesel} total={stats.totalSpend} color="hsl(220 70% 55%)" />
        <FuelMeter label="CNG"    amount={stats.byFuel.CNG}    total={stats.totalSpend} color="hsl(150 65% 45%)" />
      </div>


      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Vehicle</Label>
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.vehicle_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "fuel-entries.csv",
                filtered.map((e) => ({
                  date: fmtDate(e.entry_date),
                  time: e.entry_time ?? "",
                  vehicle: vehMap.get(e.vehicle_id) ?? "",
                  fuel_type: e.fuel_type,
                  odometer_km: e.odometer_km,
                  quantity: e.quantity,
                  rate: e.rate,
                  amount: e.amount,
                  payment_mode: e.payment_mode,
                  location: e.location_text,
                  geo: e.geo_lat && e.geo_lng ? `${e.geo_lat},${e.geo_lng}` : "",
                  odometer_photo: e.odometer_photo_url,
                  pump_photo: e.pump_photo_url,
                  receipt_photo: e.receipt_photo_url,
                  notes: e.notes,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Vehicle</th>
                <th className="px-3 py-3 text-left">Fuel</th>
                <th className="px-3 py-3 text-right">Odometer</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-left">Payment</th>
                <th className="px-3 py-3 text-left">Location</th>
                <th className="px-3 py-3 text-center">Proofs</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  <Fuel className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No fuel entries in this range. Click <strong>Add Entry</strong> to log one.
                </td></tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-medium">{fmtDate(e.entry_date)}</div>
                    {e.entry_time && <div className="text-xs text-muted-foreground">{e.entry_time.slice(0, 5)}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{vehMap.get(e.vehicle_id) ?? "—"}</td>
                  <td className="px-3 py-2.5">{e.fuel_type}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.odometer_km.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{e.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{inr(e.amount)}</td>
                  <td className="px-3 py-2.5 text-xs">{e.payment_mode}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {e.geo_lat && e.geo_lng ? (
                      <a
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                        href={`https://www.google.com/maps?q=${e.geo_lat},${e.geo_lng}`}
                        target="_blank" rel="noreferrer"
                      >
                        <MapPin className="h-3 w-3" />
                        {e.location_text || "View map"}
                      </a>
                    ) : (e.location_text || "—")}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <ProofThumb url={e.odometer_photo_url} label="Odometer" />
                      <ProofThumb url={e.pump_photo_url} label="Pump" />
                      <ProofThumb url={e.receipt_photo_url} label="Receipt" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(e)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddEntryDialog
        open={open}
        onOpenChange={setOpen}
        vehicles={vehicles}
        onSaved={() => qc.invalidateQueries({ queryKey: QK })}
      />
    </div>
  );
}

function ProofThumb({ url, label }: { url: string; label: string }) {
  if (!url) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-border text-muted-foreground" title={`No ${label}`}>
        <ImageIcon className="h-3.5 w-3.5 opacity-40" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={label}>
      <img src={url} alt={label} className="h-9 w-9 rounded border border-border object-cover" />
    </a>
  );
}

/* ------------------------- Add Entry Dialog ------------------------- */

type Vehicle = { id: string; vehicle_number: string; name: string };

function AddEntryDialog({
  open, onOpenChange, vehicles, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicles: Vehicle[];
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryTime, setEntryTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [fuelType, setFuelType] = useState<string>("Petrol");
  const [odometer, setOdometer] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("Fuel Card");
  const [locationText, setLocationText] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [odoFile, setOdoFile] = useState<File | null>(null);
  const [pumpFile, setPumpFile] = useState<File | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-amount when qty + rate set
  function recalcAmount(q: string, r: string) {
    const qn = Number(q); const rn = Number(r);
    if (!Number.isNaN(qn) && !Number.isNaN(rn) && qn > 0 && rn > 0) {
      setAmount((qn * rn).toFixed(2));
    }
  }

  function reset() {
    setVehicleId(""); setOdometer(""); setQuantity(""); setRate(""); setAmount("");
    setLocationText(""); setGeo(null); setNotes("");
    setOdoFile(null); setPumpFile(null); setReceiptFile(null);
  }

  function captureLocation() {
    if (!navigator.geolocation) { toast.error("Geolocation not available"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        toast.success("Location captured");
      },
      () => toast.error("Could not get location — enter manually"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function uploadProof(file: File | null, label: string): Promise<string> {
    if (!file) return "";
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${vehicleId || "unknown"}/${entryDate}/${label}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave() {
    if (!vehicleId) { toast.error("Select a vehicle"); return; }
    if (!odometer) { toast.error("Enter odometer reading"); return; }
    if (!amount) { toast.error("Enter amount"); return; }
    if (!odoFile || !pumpFile || !receiptFile) { toast.error("Upload all 3 proof photos (odometer, pump, receipt)"); return; }
    setBusy(true);
    try {
      const [odoUrl, pumpUrl, receiptUrl] = await Promise.all([
        uploadProof(odoFile, "odometer"),
        uploadProof(pumpFile, "pump"),
        uploadProof(receiptFile, "receipt"),
      ]);
      const payload = {
        vehicle_id: vehicleId,
        entry_date: entryDate,
        entry_time: entryTime || null,
        fuel_type: fuelType,
        odometer_km: Number(odometer) || 0,
        quantity: Number(quantity) || 0,
        rate: Number(rate) || 0,
        amount: Number(amount) || 0,
        payment_mode: paymentMode,
        location_text: locationText,
        geo_lat: geo?.lat ?? null,
        geo_lng: geo?.lng ?? null,
        odometer_photo_url: odoUrl,
        pump_photo_url: pumpUrl,
        receipt_photo_url: receiptUrl,
        notes,
      };
      const { data, error } = await supabase
        .from(ENTITY as never)
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      const veh = vehicles.find((v) => v.id === vehicleId);
      await logActivity({
        module: MODULE, action: "create", entityType: ENTITY,
        entityId: String((data as { id: string }).id),
        entityLabel: `${veh?.vehicle_number ?? "Vehicle"} • ${fmtDate(entryDate)} • ${inr(Number(amount))}`,
        after: payload as unknown as Record<string, unknown>,
      });
      toast.success("Fuel entry added");
      onSaved();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Fuel Entry</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Vehicle *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.vehicle_number}{v.name ? ` — ${v.name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fuel Type</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
            </div>
            <div>
              <Label>Odometer (km) *</Label>
              <Input type="number" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="e.g. 43250" />
            </div>
            <div>
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity ({fuelType === "CNG" ? "kg" : "L"})</Label>
              <Input type="number" inputMode="decimal" value={quantity}
                onChange={(e) => { setQuantity(e.target.value); recalcAmount(e.target.value, rate); }}
                placeholder="0.00" />
            </div>
            <div>
              <Label>Rate (₹ per unit)</Label>
              <Input type="number" inputMode="decimal" value={rate}
                onChange={(e) => { setRate(e.target.value); recalcAmount(quantity, e.target.value); }}
                placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="Pump name / area" />
              <Button type="button" variant="outline" onClick={captureLocation}>
                <MapPin className="mr-2 h-4 w-4" /> Geo-tag
              </Button>
            </div>
            {geo && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {geo.lat}, {geo.lng}
                <button type="button" className="ml-1 text-destructive" onClick={() => setGeo(null)}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FileTile label="Odometer photo *" file={odoFile} onChange={setOdoFile} />
            <FileTile label="Pump / units photo *" file={pumpFile} onChange={setPumpFile} />
            <FileTile label="Receipt photo *" file={receiptFile} onChange={setReceiptFile} />
          </div>


          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileTile({
  label, file, onChange,
}: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2">
      <Label className="text-xs">{label}</Label>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="mt-2 flex items-center gap-2">
          <img src={previewUrl} alt={label} className="h-14 w-14 rounded object-cover border border-border" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs">{file.name}</div>
            <button type="button" className="text-xs text-destructive hover:underline" onClick={() => onChange(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn(
            "mt-2 flex h-14 w-full items-center justify-center gap-2 rounded border border-border bg-card text-xs text-muted-foreground hover:bg-accent/5",
          )}
        >
          <Upload className="h-4 w-4" /> Upload / Capture
        </button>
      )}
    </div>
  );
}
