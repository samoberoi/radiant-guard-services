import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { logInv } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/settings")({
  component: SettingsPage,
});

type Setting = { key: string; value: Record<string, unknown>; description: string };

function SettingsPage() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["inv-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_settings" as never).select("*");
      if (error) throw error;
      return (data as unknown as Setting[]) ?? [];
    },
  });

  const get = (k: string) => settingsQ.data?.find((s) => s.key === k)?.value ?? {};
  const [poAmt, setPoAmt] = useState(50000);
  const [woAmt, setWoAmt] = useState(5000);
  const [lowStock, setLowStock] = useState(true);

  useEffect(() => {
    if (!settingsQ.data) return;
    const t = get("approval_thresholds") as { po_amount?: number; writeoff_amount?: number };
    const ls = get("low_stock_alert") as { enabled?: boolean };
    setPoAmt(Number(t.po_amount ?? 50000));
    setWoAmt(Number(t.writeoff_amount ?? 5000));
    setLowStock(Boolean(ls.enabled ?? true));
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "approval_thresholds", value: { po_amount: poAmt, writeoff_amount: woAmt }, description: "Amounts at/above which manual owner approval is required" },
        { key: "low_stock_alert", value: { enabled: lowStock }, description: "Whether to surface low-stock notifications" },
      ];
      const { error } = await supabase.from("inv_settings" as never).upsert(upserts as never, { onConflict: "key" } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      logInv("Inventory Settings", "update", "inv_settings", "thresholds", "Approval thresholds & alerts", { po_amount: poAmt, writeoff_amount: woAmt, low_stock_enabled: lowStock });
      qc.invalidateQueries({ queryKey: ["inv-settings"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error("Save failed: " + String(e)),
  });

  return (
    <div>
      <PageHeader
        title="Inventory Settings"
        description="Approval thresholds and alert preferences."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Settings" }]}
      />

      <div className="grid max-w-2xl gap-6">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-sm font-bold tracking-tight">Approval Thresholds</h2>
          <p className="mb-4 text-xs text-muted-foreground">Above these amounts, documents require manual approval before posting.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Purchase Order amount (₹)</Label>
              <Input type="number" value={poAmt} onChange={(e) => setPoAmt(Number(e.target.value))} />
            </div>
            <div>
              <Label>Write-off amount (₹)</Label>
              <Input type="number" value={woAmt} onChange={(e) => setWoAmt(Number(e.target.value))} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-sm font-bold tracking-tight">Alerts</h2>
          <div className="mt-4 flex items-center gap-3">
            <Switch checked={lowStock} onCheckedChange={setLowStock} />
            <Label>Low-stock notifications enabled</Label>
          </div>
        </section>

        <div>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}><Save className="mr-1 h-4 w-4" />Save Settings</Button>
        </div>
      </div>
    </div>
  );
}
