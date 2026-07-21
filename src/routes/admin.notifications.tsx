import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2, ExternalLink, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  markAllRead,
  markNotificationRead,
  type Notification,
} from "@/lib/notifications";
import { shouldRedirect } from "@/lib/notification-routing";
import { NotificationDetailDialog } from "@/components/NotificationDetailDialog";

export const Route = createFileRoute("/admin/notifications")({
  component: NotificationCenter,
});

const NQK = ["notifications", "mine"] as const;

function NotificationCenter() {
  const qc = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [detail, setDetail] = useState<Notification | null>(null);
  const { data: items = [] } = useQuery({
    queryKey: NQK,
    queryFn: listMyNotifications,
    refetchInterval: 30_000,
  });

  const filtered = filter === "unread" ? items.filter((n) => !n.readAt) : items;
  const unread = items.filter((n) => !n.readAt).length;

  const openLink = (target: string) => {
    if (!target) return;
    if (target.startsWith("/")) router.history.push(target);
    else if (typeof window !== "undefined") window.location.href = target;
  };


  return (
    <div>
      <PageHeader
        title="Notification Center"
        description="All notifications routed to your account."
        crumbs={[{ label: "Notification Center" }]}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs font-semibold">
          {(["all", "unread"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                filter === k
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "all" ? `All (${items.length})` : `Unread (${unread})`}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unread === 0}
          onClick={async () => {
            await markAllRead();
            qc.invalidateQueries({ queryKey: NQK });
          }}
        >
          <CheckCheck className="mr-1.5 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-sm text-muted-foreground">
            <Bell className="mb-2 h-6 w-6 opacity-50" />
            No notifications.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-4",
                  !n.readAt && "bg-accent/5",
                )}
              >
                <div className="mt-1">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      n.readAt ? "bg-muted" : "bg-accent",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">
                      {n.title}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  {n.message && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {n.message}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {n.link && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (typeof window !== "undefined")
                            window.location.href = n.link;
                        }}
                      >
                        Open
                      </Button>
                    )}
                    {!n.readAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={async () => {
                          await markNotificationRead(n.id);
                          qc.invalidateQueries({ queryKey: NQK });
                        }}
                      >
                        Mark read
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        await supabase
                          .from("notifications" as never)
                          .delete()
                          .eq("id", n.id);
                        qc.invalidateQueries({ queryKey: NQK });
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
