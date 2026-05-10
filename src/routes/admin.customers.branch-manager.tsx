import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { ComingSoonCard, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/customers/branch-manager")({
  component: BranchManagerPage,
});

function BranchManagerPage() {
  return (
    <div>
      <PageHeader
        title="Branch Manager"
        description="Organise regional branches under each state."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "Branch Manager" },
        ]}
      />
      <ComingSoonCard
        icon={Building2}
        title="Branch management module coming soon"
        message="Create and assign branches across regions from a single view."
      />
    </div>
  );
}
