import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp, DEMO_OTP_HINT } from "@/lib/auth";
import logo from "@/assets/radiant-logo-v2.png";

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

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(now);
  return {
    ist: fmt("Asia/Kolkata"),
    bst: fmt("Europe/London"),
    edt: fmt("America/New_York"),
  };
}

function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const verifyInFlightRef = useRef(false);
  const clock = useClock();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (user && !revealing) navigate({ to: "/", replace: true });
  }, [user, navigate, revealing]);

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
    await new Promise((r) => setTimeout(r, 500));
    setSending(false);
    setStep("otp");
    setResendIn(30);
    setOtp("");
    setError(null);
    toast.success(`OTP sent to +91 ••• ••• ${phone.slice(-4)}`, {
      description: `Use ${DEMO_OTP_HINT} for this demo.`,
    });
  }

  async function handleVerify(value?: string) {
    const code = value ?? otp;
    if (code.length !== 6 || verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setVerifying(true);
    if (!verifyOtp(code)) {
      verifyInFlightRef.current = false;
      setVerifying(false);
      setError(`Incorrect code. Try ${DEMO_OTP_HINT} for the demo.`);
      setOtp("");
      return;
    }
    try {
      await login(`+91${phone}`);
      toast.success("Signed in");
      setRevealing(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 700);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start session. Try again.",
      );
      setOtp("");
    } finally {
      verifyInFlightRef.current = false;
      setVerifying(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Reveal overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 origin-bottom bg-background transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      {/* Full-bleed split */}
      <div className="relative grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT — brand canvas */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 xl:p-14 lg:flex bg-primary text-primary-foreground">
          {/* accent wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--accent) 70%, transparent), transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 bottom-0 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--accent) 90%, transparent), transparent 70%)",
            }}
          />
          {/* dot grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <ShieldCheck
            aria-hidden
            className="absolute -right-16 top-1/2 h-[460px] w-[460px] -translate-y-1/2 text-primary-foreground/[0.05]"
            strokeWidth={1}
          />

          {/* Brand */}
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-foreground shadow-lg">
              <img src={logo} alt="Radiant" className="h-8 w-8 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold tracking-tight">
                Radiant Guard
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] opacity-60">
                Services Pvt. Ltd.
              </div>
            </div>
          </div>

          {/* Hero */}
          <div className="relative max-w-lg">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-90 backdrop-blur">
              Operations portal
            </div>
            <h1 className="font-display text-[clamp(2.25rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-tight">
              Command your<br />Guard Force.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed opacity-70">
              Sign in to manage employees, units, attendance, payroll and
              compliance — all in one place.
            </p>
          </div>

          {/* Footer row: clock */}
          <div className="relative flex items-center justify-between text-[11px] uppercase tracking-[0.22em] opacity-70">
            <div className="flex items-center gap-3">
              <div className="relative h-4 w-4">
                <div className="absolute inset-0 rounded-full border border-primary-foreground/60" />
                <div
                  className="absolute inset-0 origin-center animate-spin rounded-full border border-transparent border-t-primary-foreground"
                  style={{ animationDuration: "6s" }}
                />
              </div>
              <span>Real-time</span>
            </div>
            <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono normal-case tracking-normal tabular-nums">
              <span>{clock.ist}</span><span className="opacity-60">IST</span>
              <span>{clock.bst}</span><span className="opacity-60">BST</span>
              <span>{clock.edt}</span><span className="opacity-60">EDT</span>
            </div>
          </div>
        </div>

        {/* RIGHT — form */}
        <div className="relative flex min-h-screen items-center justify-center bg-background px-5 py-12 sm:px-10 lg:px-14">
          <div className="w-full max-w-[440px]">
            {/* mobile brand */}
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary">
                <img src={logo} alt="Radiant" className="h-7 w-7 object-contain" />
              </div>
              <div className="leading-tight">
                <div className="font-display text-base font-semibold tracking-tight text-foreground">
                  Radiant Guard
                </div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Services Pvt. Ltd.
                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {step === "phone" ? "Welcome back" : "Almost there"}
              </div>
              <h2 className="font-display text-[clamp(2rem,5vw,2.5rem)] font-semibold leading-[1.05] tracking-tight text-foreground">
                {step === "phone" ? "Sign in" : "Verify OTP"}
              </h2>
              <p className="mt-2 text-[14px] text-muted-foreground">
                {step === "phone"
                  ? "Enter your mobile number to receive a one-time code."
                  : `We sent a 6-digit code to +91 ••• ••• ${phone.slice(-4)}.`}
              </p>
            </div>

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Mobile number
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted-foreground">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      className="h-14 w-full rounded-2xl border border-border bg-secondary pl-14 pr-5 text-[15px] font-medium tracking-wide text-foreground placeholder:text-muted-foreground/60 transition-all focus:border-accent focus:bg-card focus:outline-none focus:ring-4 focus:ring-accent/15"
                    />
                  </div>
                </label>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="group h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary/90 disabled:opacity-50"
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

                <p className="pt-1 text-center text-[12.5px] text-muted-foreground">
                  No password required — we'll text you a code.
                </p>
              </form>
            ) : (
              <div className="space-y-5">
                <div className={error ? "animate-shake" : ""}>
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
                    <InputOTPGroup className="flex w-full justify-between gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-14 w-12 rounded-2xl border border-border bg-secondary text-xl font-semibold tabular-nums text-foreground first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:border-accent data-[active=true]:bg-card data-[active=true]:ring-4 data-[active=true]:ring-accent/15"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  {error ? (
                    <p className="mt-3 text-center text-sm font-medium text-destructive">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
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
                  className="h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:bg-primary/90 disabled:opacity-50"
                >
                  {verifying ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Verify & sign in"
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
                    className="font-medium text-muted-foreground hover:text-foreground"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || sending}
                    onClick={() => sendOtp()}
                    className="font-semibold text-accent hover:opacity-80 disabled:cursor-not-allowed disabled:text-muted-foreground"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}

            {step === "phone" && (
              <p className="mt-10 text-center text-[12px] leading-relaxed text-muted-foreground">
                By signing in you agree to Radiant's{" "}
                <span className="font-semibold text-foreground">Terms of Service</span>{" "}
                and{" "}
                <span className="font-semibold text-foreground">Privacy Policy</span>.
              </p>
            )}

            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span>Powered by</span>
              <span className="rounded-md border border-border px-2 py-0.5">
                HyperRevamp
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
