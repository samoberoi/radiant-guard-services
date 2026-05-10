import { createFileRoute } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";
import { ComingSoonCard, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/customers/unit-manager")({
  component: UnitManagerPage,
});

function UnitManagerPage() {
  return (
    <div>
      <PageHeader
        title="Unit Manager"
        description="Track operational units deployed across branches."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "Unit Manager" },
        ]}
      />
      <ComingSoonCard
        icon={Warehouse}
        title="Unit management module coming soon"
        message="Maintain detailed records of every operational unit."
      />
    </div>
  );
}
