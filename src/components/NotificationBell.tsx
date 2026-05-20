import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listMyNotifications,
  markAllRead,
  markNotificationRead,
} from "@/lib/notifications";

const NQK = ["notifications", "mine"] as const;

export function NotificationBell() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: NQK,
    queryFn: listMyNotifications,
    refetchInterval: 10_000,
  });
  const unread = items.filter((n) => !n.readAt).length;
  const top = items.slice(0, 8);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={async () => {
              await markAllRead();
              qc.invalidateQueries({ queryKey: NQK });
            }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-accent disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {top.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            top.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={async () => {
                  if (!n.readAt) {
                    await markNotificationRead(n.id);
                    qc.invalidateQueries({ queryKey: NQK });
                  }
                  if (n.link && typeof window !== "undefined") {
                    window.location.href = n.link;
                  }
                }}
                className={cn(
                  "block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50",
                  !n.readAt && "bg-accent/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-semibold text-foreground">
                    {n.title}
                  </div>
                  {!n.readAt && (
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                </div>
                {n.message && (
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.message}
                  </div>
                )}
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-center">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/admin/notifications">Open Notification Center</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
