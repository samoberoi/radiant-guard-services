import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/inventory/demands")({
  component: DemandsPage,
});

function DemandsPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Demands</h1>
        <p className="mt-2 text-muted-foreground">Coming Up Shortly</p>
      </div>
    </div>
  );
}
