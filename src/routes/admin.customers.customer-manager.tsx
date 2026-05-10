import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ComingSoonCard, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/customers/customer-manager")({
  component: CustomerManagerPage,
});

function CustomerManagerPage() {
  return (
    <div>
      <PageHeader
        title="Customer Manager"
        description="Onboard and manage customers serviced by Radiant Guard."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "Customer Manager" },
        ]}
      />
      <ComingSoonCard
        icon={Users}
        title="Customer management module coming soon"
        message="Onboard customers and link them to states, branches, and units."
      />
    </div>
  );
}
