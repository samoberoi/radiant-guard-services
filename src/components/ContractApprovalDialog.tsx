import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileSignature } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import {
  createNotification,
  currentUserId,
} from "@/lib/notifications";

export type ApprovalMode = "approve" | "reject";

export type ApprovalContract = {
  id: string;
  prospectCode: string;
  contractCode: string;
  createdBy: string | null;
};

function nextContractCode(existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = code?.match(/CON(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CON${String(max + 1).padStart(5, "0")}`;
}

export function ContractApprovalDialog({
  open,
  onOpenChange,
  mode,
  contract,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: ApprovalMode;
  contract: ApprovalContract | null;
  onDone: () => void;
}) {
  const [signature, setSignature] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSignature("");
      setReason("");
      setSaving(false);
    }
  }, [open, contract?.id]);

  if (!contract) return null;

  const label = contract.contractCode || contract.prospectCode;

  async function notifyCreator(
    type: "contract_approved" | "contract_rejected",
    title: string,
    message: string,
  ) {
    const recipient = contract!.createdBy ?? (await currentUserId());
    if (!recipient) return;
    try {
      await createNotification({
        userId: recipient,
        type,
        title,
        message,
        link: "/admin/contracts/client-contracts",
        entityType: "client_contracts",
        entityId: contract!.id,
      });
    } catch (e) {
      console.warn("Notification dispatch failed", e);
    }
  }

  async function handleApprove() {
    if (!signature) {
      toast.error("Please add your signature before approving.");
      return;
    }
    setSaving(true);
    try {
      const uid = await currentUserId();
      const nowIso = new Date().toISOString();

      // Generate next contract code by inspecting existing CONxxxxx values.
      const { data: codeRows, error: codeErr } = await supabase
        .from("client_contracts" as never)
        .select("contract_code")
        .not("contract_code", "is", null);
      if (codeErr) throw codeErr;
      const existing = ((codeRows as unknown as Record<string, unknown>[]) ?? [])
        .map((r) => String(r.contract_code ?? ""))
        .filter(Boolean);
      const newContractCode = nextContractCode(existing);

      const { error } = await supabase
        .from("client_contracts" as never)
        .update({
          approval_status: "approved",
          approved_by: uid,
          approved_at: nowIso,
          signed_at: nowIso,
          company_signature_data: signature,
          status: "active",
          rejection_reason: "",
          record_type: "client",
          promoted_at: nowIso,
          contract_code: newContractCode,
        } as never)
        .eq("id", contract!.id);
      if (error) throw error;
      void logActivity({
        module: "Client Contracts",
        action: "approve",
        entityType: "client_contracts",
        entityId: contract!.id,
        entityLabel: newContractCode,
        details: { prospectCode: contract!.prospectCode, contractCode: newContractCode },
      });
      await notifyCreator(
        "contract_approved",
        `Prospect ${contract!.prospectCode} approved`,
        `Promoted to client contract ${newContractCode} and signed.`,
      );
      toast.success(
        `Prospect ${contract!.prospectCode} approved → Client ${newContractCode}`,
      );
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (reason.trim().length < 10) {
      toast.error("Please provide a rejection reason (min 10 characters).");
      return;
    }
    setSaving(true);
    try {
      const uid = await currentUserId();
      const { error } = await supabase
        .from("client_contracts" as never)
        .update({
          approval_status: "rejected",
          rejected_by: uid,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
          status: "inactive",
        } as never)
        .eq("id", contract!.id);
      if (error) throw error;
      void logActivity({
        module: "Client Contracts",
        action: "reject",
        entityType: "client_contracts",
        entityId: contract!.id,
        entityLabel: label,
        details: { reason: reason.trim() },
      });
      await notifyCreator(
        "contract_rejected",
        `Prospect ${label} rejected`,
        reason.trim(),
      );
      toast.success(`Prospect ${label} rejected`);
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rejection failed");
    } finally {
      setSaving(false);
    }
  }

  const isApprove = mode === "approve";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve & sign prospect" : "Reject prospect"}
          </DialogTitle>
          <DialogDescription>
            Prospect{" "}
            <span className="font-mono font-semibold text-foreground">
              {label}
            </span>
            {isApprove
              ? " — sign below to approve, promote it to a client and issue a contract ID."
              : " — capture a clear reason; the creator will be notified."}
          </DialogDescription>
        </DialogHeader>

        {isApprove ? (
          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Authorised Signatory Signature
            </Label>
            <SignaturePad value={signature} onChange={setSignature} height={180} />
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <Label className="text-xs font-semibold text-muted-foreground">
              Rejection Reason
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Explain why this prospect is being rejected…"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={isApprove ? handleApprove : handleReject}
            className={
              isApprove
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isApprove ? (
              <>
                <FileSignature className="mr-1.5 h-4 w-4" />
                Approve, Promote & Sign
              </>
            ) : (
              "Reject Prospect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
