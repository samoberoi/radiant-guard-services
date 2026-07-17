import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, RotateCw, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { listMyNotifications, markAllRead, markNotificationRead } from "@/lib/notifications";

const NQK = ["notifications", "mine"] as const;

/**
 * Right-rail "Live Feed" panel used on every dashboard.
 * Mirrors the reference portal's activity column — notification stream
 * rendered as timeline pills with soft icon chips and timestamps.
 */
export function LiveFeed({ className }: { className?: string }) {
  const qc = useQueryClient();
  const { data: items = [], isFetching, refetch } = useQuery({
    queryKey: NQK,
    queryFn: listMyNotifications,
    refetchInterval: 15_000,
  });
  const unread = items.filter((n) => !n.readAt).length;
  const top = items.slice(0, 12);

  return (
    <aside
      className={cn(
        "flex h-fit max-h-[380px] flex-col overflow-hidden rounded-[24px] border border-border/60 bg-card/70 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_24px_60px_-30px_rgba(15,23,42,0.22)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-b from-card/80 to-card/40 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Live feed
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-foreground leading-tight">Recent activity</h3>
            {unread > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh"
            className="grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-card/80 text-muted-foreground transition hover:text-foreground"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            disabled={unread === 0}
            onClick={async () => {
              await markAllRead();
              qc.invalidateQueries({ queryKey: NQK });
            }}
            aria-label="Mark all read"
            className="grid h-8 w-8 place-items-center rounded-full border border-border/70 bg-card/80 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {top.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-foreground">You're all caught up</div>
            <div className="text-xs text-muted-foreground">
              New updates from your team will appear here.
            </div>
          </div>
        ) : (
          <ol className="relative space-y-1.5">
            {top.map((n) => {
              const time = formatDistanceToNow(new Date(n.createdAt), { addSuffix: true });
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!n.readAt) {
                        await markNotificationRead(n.id);
                        qc.invalidateQueries({ queryKey: NQK });
                      }
                      if (n.link && typeof window !== "undefined") window.location.href = n.link;
                    }}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-all hover:bg-card",
                      !n.readAt && "bg-accent/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
                        !n.readAt
                          ? "bg-accent text-accent-foreground ring-accent/30 shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
                          : "bg-secondary text-muted-foreground ring-border",
                      )}
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                          {n.title}
                        </div>
                        {!n.readAt && (
                          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        )}
                      </div>
                      {n.message && (
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                          {n.message}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                        {time}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t border-border/50 bg-card/50 px-4 py-2.5 text-center">
        <Link
          to="/admin/notifications"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
        >
          Open Notification Center →
        </Link>
      </div>
    </aside>
  );
}

/**
 * Dashboard 2-column shell — main content + sticky right-side Live Feed.
 * Collapses to single column below `lg`.
 */
export function DashboardShell({
  children,
  rightExtras,
}: {
  children: React.ReactNode;
  rightExtras?: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">{children}</div>
      <div className="hidden lg:flex lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-3rem)] lg:flex-col lg:gap-3 lg:overflow-y-auto lg:pr-1">
        <LiveFeed />
        {rightExtras}
      </div>
      {rightExtras && <div className="lg:hidden space-y-3">{rightExtras}</div>}
    </div>
  );
}
