import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { ComingSoonCard, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/customers/state-manager")({
  component: StateManagerPage,
});

function StateManagerPage() {
  return (
    <div>
      <PageHeader
        title="State Manager"
        description="Manage the list of states served by Radiant Guard."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "State Manager" },
        ]}
      />
      <ComingSoonCard
        icon={MapPin}
        title="State management module coming soon"
        message="You'll be able to add, edit, and organise states from here."
      />
    </div>
  );
}
