import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Factory,
  Truck,
  Warehouse,
  ShoppingBag,
  ClipboardList,
  UserCheck,
  Shield,
  ArrowRight,
  ArrowDown,
  X,
  Sparkles,
  CheckCircle2,
  FileText,
  Inbox,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/inventory/workflows")({
  component: InventoryWorkflowsPage,
});

type Node = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  who: string;
  action: string;
  doc?: string;
  tone: "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet" | "slate";
};

type Workflow = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  trigger: string;
  outcome: string;
  accent: string; // tailwind gradient
  badge: string;
  nodes: Node[];
};

const WORKFLOWS: Workflow[] = [
  {
    id: "hq-procure",
    code: "WF-01",
    title: "Headquarters Procurement",
    subtitle: "HQ raises a PO → vendor supplies → central warehouse → onward distribution.",
    trigger: "HQ identifies a stocking need (replenishment / new product)",
    outcome: "Stock lands at the Central Warehouse, ready to fulfil branch & FO demands.",
    accent: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    badge: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    nodes: [
      { icon: Factory, title: "HQ Inventory Desk", who: "Inventory Manager", action: "Plans replenishment / new SKU and raises a Purchase Order against an approved vendor & rate card.", doc: "Purchase Order", tone: "indigo" },
      { icon: ShoppingBag, title: "Vendor", who: "External supplier", action: "Accepts PO, ships goods with vendor invoice & challan.", doc: "Vendor Invoice", tone: "slate" },
      { icon: Truck, title: "Inbound Logistics", who: "Carrier", action: "Transports against PO reference. Tracked till receipt.", tone: "amber" },
      { icon: ClipboardList, title: "Delivery Challan (GRN)", who: "Central Warehouse", action: "Goods received, inspected & posted against PO. Invoice attached, stock booked into bin.", doc: "GRN + Invoice", tone: "emerald" },
      { icon: Warehouse, title: "Central Warehouse", who: "Warehouse Keeper", action: "Stock available in master ledger — visible to all downstream nodes.", tone: "sky" },
    ],
  },
  {
    id: "branch-demand",
    code: "WF-02",
    title: "Branch Office → HQ Demand",
    subtitle: "Branch raises a demand. HQ fulfils via transfer or fresh PO.",
    trigger: "Branch Manager spots low stock or upcoming deployment need.",
    outcome: "Branch warehouse receives stock and is ready to issue downstream.",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    nodes: [
      { icon: Building2, title: "Branch Office", who: "Branch Manager", action: "Raises a Demand to HQ with item, qty, target date & justification.", doc: "Demand Note", tone: "emerald" },
      { icon: Inbox, title: "HQ Review", who: "Inventory Manager", action: "Approves demand. Decides: ship from stock (transfer) OR raise a fresh PO.", tone: "indigo" },
      { icon: Truck, title: "Transfer / Procurement", who: "HQ Warehouse", action: "If stock available → Stock Transfer to branch.  If not → Purchase Order → GRN → Transfer.", doc: "Transfer / PO", tone: "amber" },
      { icon: PackageCheck, title: "Branch GRN", who: "Branch Manager", action: "Confirms receipt at branch. Stock booked into branch ledger.", doc: "Branch GRN", tone: "emerald" },
      { icon: Warehouse, title: "Branch Warehouse", who: "Branch", action: "Stock now sits with the branch — ready to issue to FOs / units.", tone: "sky" },
    ],
  },
  {
    id: "fo-to-branch",
    code: "WF-03",
    title: "Field Officer → Branch Demand",
    subtitle: "FO requests stock from their parent Branch.",
    trigger: "FO needs inventory for a guard, post or unit under their charge.",
    outcome: "FO receives stock from branch and can issue to security guard.",
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
    badge: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    nodes: [
      { icon: UserCheck, title: "Field Officer", who: "FO", action: "Raises a Demand on their Branch Office for guards / post requirement.", doc: "Demand Note", tone: "amber" },
      { icon: Building2, title: "Branch Office", who: "Branch Manager", action: "Reviews demand against branch stock. Approves & dispatches.", tone: "emerald" },
      { icon: Truck, title: "Issuance to FO", who: "Branch → FO", action: "Stock issued from branch warehouse to FO custody. Movement logged.", doc: "Issuance Slip", tone: "amber" },
      { icon: PackageCheck, title: "FO Acknowledgement", who: "FO", action: "Confirms receipt. Stock now sits on FO ledger (in-field custody).", tone: "sky" },
      { icon: Shield, title: "Issue to Guard", who: "FO → Security Guard", action: "FO issues uniform / kit to the guard on duty. Tracked per guard.", doc: "Guard Issuance", tone: "violet" },
      { icon: RotateCcw, title: "Collections (on return)", who: "FO", action: "When guard exits, FO runs a Collection — items return to FO stock.", doc: "Collection Note", tone: "rose" },
    ],
  },
  {
    id: "fo-to-hq",
    code: "WF-04",
    title: "Field Officer → Headquarters Demand",
    subtitle: "FO escalates a demand directly to HQ (bypassing branch).",
    trigger: "Urgent / specialised requirement that the branch cannot fulfil.",
    outcome: "HQ ships directly to FO; downstream issuance to guard continues normally.",
    accent: "from-rose-500/20 via-rose-500/5 to-transparent",
    badge: "bg-rose-500/10 text-rose-600 border-rose-500/20",
    nodes: [
      { icon: UserCheck, title: "Field Officer", who: "FO", action: "Raises a Demand directly on HQ (with reason for bypassing branch).", doc: "Demand Note", tone: "amber" },
      { icon: Factory, title: "HQ Review", who: "Inventory Manager", action: "Validates urgency. Approves & decides fulfilment route — direct transfer or fresh PO.", tone: "indigo" },
      { icon: Truck, title: "Direct Dispatch", who: "HQ → FO", action: "Stock shipped directly to FO custody. Branch is notified for visibility.", doc: "Transfer / Issuance", tone: "amber" },
      { icon: PackageCheck, title: "FO Acknowledgement", who: "FO", action: "Confirms receipt. Stock sits on FO ledger.", tone: "sky" },
      { icon: Shield, title: "Issue to Guard", who: "FO → Security Guard", action: "FO issues kit to guard on post.", doc: "Guard Issuance", tone: "violet" },
      { icon: RotateCcw, title: "Collections (on return)", who: "FO", action: "On guard exit, items collected back to FO stock.", doc: "Collection Note", tone: "rose" },
    ],
  },
];

const TONE: Record<Node["tone"], string> = {
  indigo: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  rose: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  sky: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  violet: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  slate: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
};

function InventoryWorkflowsPage() {
  const [active, setActive] = useState<Workflow | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Workflows"
        description="The four end-to-end paths inventory takes — from supplier all the way to the guard on duty."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Workflows" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {WORKFLOWS.map((wf) => (
          <button
            key={wf.id}
            onClick={() => setActive(wf)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-card p-6 text-left",
              "transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-foreground/20",
            )}
          >
            <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity", wf.accent)} />
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", wf.badge)}>
                  <Sparkles className="h-3 w-3" /> {wf.code}
                </span>
                <span className="text-xs text-muted-foreground">{wf.nodes.length} steps</span>
              </div>

              <div>
                <h3 className="text-xl font-semibold tracking-tight">{wf.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{wf.subtitle}</p>
              </div>

              {/* mini chain preview */}
              <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                {wf.nodes.slice(0, 5).map((n, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg ring-1", TONE[n.tone])}>
                      <n.icon className="h-3.5 w-3.5" />
                    </span>
                    {i < Math.min(4, wf.nodes.length - 1) && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
                  </div>
                ))}
                {wf.nodes.length > 5 && (
                  <span className="text-xs text-muted-foreground ml-1">+{wf.nodes.length - 5}</span>
                )}
              </div>

              <div className="pt-2 flex items-center gap-1 text-xs font-medium text-foreground/70 group-hover:text-foreground transition-colors">
                Zoom into workflow <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {active && <WorkflowDetail wf={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function WorkflowDetail({ wf, onClose }: { wf: Workflow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 backdrop-blur-sm p-0 md:p-6 animate-in fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-5xl rounded-none md:rounded-2xl bg-background shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className={cn("relative px-6 py-5 border-b bg-gradient-to-br", wf.accent)}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-lg p-2 hover:bg-foreground/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", wf.badge)}>
              <Sparkles className="h-3 w-3" /> {wf.code}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{wf.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{wf.subtitle}</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-background/70 backdrop-blur px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Trigger</div>
              <div className="text-sm mt-0.5">{wf.trigger}</div>
            </div>
            <div className="rounded-xl border bg-background/70 backdrop-blur px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Outcome</div>
              <div className="text-sm mt-0.5 flex items-start gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> {wf.outcome}
              </div>
            </div>
          </div>
        </div>

        {/* tree */}
        <div className="overflow-y-auto px-6 py-8 flex-1">
          <ol className="relative space-y-4 max-w-3xl mx-auto">
            {wf.nodes.map((n, i) => (
              <li key={i} className="relative">
                <div className="flex gap-4">
                  {/* rail */}
                  <div className="flex flex-col items-center">
                    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-2 ring-offset-2 ring-offset-background shadow-sm", TONE[n.tone])}>
                      <n.icon className="h-5 w-5" />
                    </div>
                    {i < wf.nodes.length - 1 && (
                      <div className="flex-1 w-px bg-gradient-to-b from-border via-border to-transparent my-2 min-h-[28px]" />
                    )}
                  </div>

                  {/* card */}
                  <div className="flex-1 pb-4">
                    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm hover:shadow transition-shadow">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Step {i + 1} · {n.who}</div>
                          <h4 className="text-base font-semibold mt-0.5">{n.title}</h4>
                        </div>
                        {n.doc && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            <FileText className="h-3 w-3" /> {n.doc}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{n.action}</p>
                    </div>
                    {i < wf.nodes.length - 1 && (
                      <div className="flex items-center gap-1.5 mt-2 ml-2 text-[11px] text-muted-foreground/70">
                        <ArrowDown className="h-3 w-3" /> next
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
