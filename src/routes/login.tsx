import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { BrandMark } from "@/components/BrandMark";
import { useAuth, verifyOtp, DEMO_OTP_HINT } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Radiant Guard Services" },
      {
        name: "description",
        content:
          "Sign in to Radiant Guard Services with your phone number and OTP.",
      },
    ],
  }),
  component: LoginPage,
});

type Step = "phone" | "otp";

function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (user) navigate({ to: "/admin/customers", replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneValid = /^\d{10}$/.test(phone);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneValid) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    setStep("otp");
    setResendIn(30);
    setOtp("");
    setError(null);
    const masked = `••• ••• ${phone.slice(-4)}`;
    toast.success(`OTP sent to ${masked}`, {
      description: `Use ${DEMO_OTP_HINT} for this demo.`,
    });
  }

  async function handleVerify(value?: string) {
    const code = value ?? otp;
    if (code.length !== 6) return;
    setVerifying(true);
    await new Promise((r) => setTimeout(r, 400));
    setVerifying(false);
    if (verifyOtp(code)) {
      login(`+91${phone}`);
      toast.success("Signed in");
      navigate({ to: "/admin/customers", replace: true });
    } else {
      setError(`Incorrect code. Try ${DEMO_OTP_HINT} for the demo.`);
      setOtp("");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="ambient-glow pointer-events-none absolute inset-0" />
      <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[60vh]" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
          <div className="dot-pattern pointer-events-none absolute inset-0 opacity-40" />
          <div
            className="pointer-events-none absolute -left-32 top-1/3 h-[480px] w-[480px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--accent) 35%, transparent) 0%, transparent 70%)",
            }}
          />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg">
              <ShieldCheck className="h-6 w-6" strokeWidth={2.4} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight">
                Radiant Guard
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary-foreground/70">
                Services Pvt. Ltd.
              </div>
            </div>
          </div>

          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              <Sparkles className="h-3 w-3" /> Secure portal
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight xl:text-5xl">
              Vigilance, <span className="text-gradient-accent">elevated.</span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/75">
              Sign in to manage deployments, monitor sites, and coordinate your
              guarding operations across India — all from one command center.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-4 text-primary-foreground/80">
            {[
              { k: "20+", v: "Years" },
              { k: "12K", v: "Guards" },
              { k: "350+", v: "Clients" },
            ].map((s) => (
              <div key={s.v} className="border-l border-accent/30 pl-3">
                <div className="font-display text-2xl font-bold text-primary-foreground">
                  {s.k}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/60">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Form panel */}
        <main className="relative flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <BrandMark />
            </div>

            <div className="glass glow-accent rounded-3xl p-7 sm:p-9">
              <div className="mb-7">
                <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
                  {step === "phone" ? "Step 1 of 2" : "Step 2 of 2"}
                </div>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
                  {step === "phone" ? "Sign in" : "Enter OTP"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step === "phone"
                    ? "We'll send a one-time code to verify your number."
                    : `Sent to +91 ••• ••• ${phone.slice(-4)}`}
                </p>
              </div>

              {step === "phone" ? (
                <form onSubmit={sendOtp} className="space-y-5">
                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      Mobile number
                    </label>
                    <div className="flex items-stretch overflow-hidden rounded-xl border border-input bg-background focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                      <span className="flex items-center gap-1 border-r border-input bg-secondary px-4 text-sm font-semibold text-foreground">
                        <span className="text-base">🇮🇳</span> +91
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) =>
                          setPhone(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        className="h-12 flex-1 rounded-none border-0 bg-transparent text-base tracking-wider shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={!phoneValid || sending}
                    className="group h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-[0_10px_40px_-10px_color-mix(in_oklab,var(--accent)_50%,transparent)]"
                  >
                    {sending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Send OTP
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    By continuing, you agree to our{" "}
                    <span className="font-medium text-foreground">Terms</span>{" "}
                    and{" "}
                    <span className="font-medium text-foreground">
                      Privacy Policy
                    </span>
                    .
                  </p>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className={error ? "animate-shake" : ""}>
                    <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      6-digit code
                    </label>
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(v) => {
                        setOtp(v);
                        setError(null);
                        if (v.length === 6) handleVerify(v);
                      }}
                      containerClassName="justify-between gap-2"
                    >
                      <InputOTPGroup className="w-full justify-between gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="h-14 w-12 rounded-xl border border-input bg-background text-xl font-bold shadow-sm first:rounded-l-xl last:rounded-r-xl data-[active=true]:border-accent data-[active=true]:ring-2 data-[active=true]:ring-accent/30"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>

                    {error ? (
                      <p className="mt-3 text-sm font-medium text-destructive">
                        {error}
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Demo code:{" "}
                        <span className="font-mono font-semibold text-foreground">
                          {DEMO_OTP_HINT}
                        </span>
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleVerify()}
                    disabled={otp.length !== 6 || verifying}
                    className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90"
                  >
                    {verifying ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      "Verify & continue"
                    )}
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("phone");
                        setOtp("");
                        setError(null);
                      }}
                      className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      ← Change number
                    </button>
                    <button
                      type="button"
                      disabled={resendIn > 0 || sending}
                      onClick={() => sendOtp()}
                      className="font-semibold text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-muted-foreground"
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Need help?{" "}
              <Link to="/login" className="font-semibold text-foreground">
                Contact support
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
