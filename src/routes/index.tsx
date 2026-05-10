import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    navigate({ to: user ? "/admin/customers" : "/login", replace: true });
  }, [user, navigate]);

  return <div className="min-h-screen bg-background" />;
}
