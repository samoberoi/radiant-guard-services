import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/ConfirmProvider";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Radiant Guard Services" },
      { name: "description", content: "Secure portal for Radiant Guard Services Pvt. Ltd." },
      { name: "author", content: "Radiant Guard Services" },
      { property: "og:title", content: "Radiant Guard Services" },
      { property: "og:description", content: "Secure portal for Radiant Guard Services Pvt. Ltd." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@HyperRevamp" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Promote any [title] into a styled floating pill via [data-tip],
  // and suppress the slow native browser tooltip.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const promote = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>("[title]").forEach((el) => {
        const t = el.getAttribute("title");
        if (!t) return;
        el.setAttribute("data-tip", t);
        el.removeAttribute("title");
      });
    };
    promote(document.body);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) promote(n as Element);
        });
        if (m.type === "attributes" && m.target.nodeType === 1) {
          const el = m.target as HTMLElement;
          const t = el.getAttribute("title");
          if (t) {
            el.setAttribute("data-tip", t);
            el.removeAttribute("title");
          }
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    return () => obs.disconnect();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Outlet />
        <Toaster />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

