import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp, DEMO_OTP_HINT } from "@/lib/auth";
import logo from "@/assets/radiant-logo-v2.png";
import loginBg from "@/assets/login-bg.jpg.asset.json";

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
  const verifyInFlightRef = useRef(false);

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
      {/* Background image — soft wavy blur, dialed back so text stays crisp */}
      <img
        src={loginBg.url}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
      />
      {/* Soft scrim to separate the busy background from the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-white/30"
      />
      {/* Ambient overlay — soft mesh + orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 15% 15%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 85%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%), radial-gradient(ellipse 40% 35% at 50% 100%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)",
        }}
      />
      {/* floating orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full opacity-50 blur-3xl animate-[pulse_8s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 45%, transparent), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-0 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl animate-[pulse_10s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%)" }}
      />
      {/* fine grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      {/* Reveal overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 origin-bottom bg-background transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      {/* Centered glass card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[440px]">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-[22px] bg-white shadow-[0_20px_50px_-15px_color-mix(in_oklab,var(--primary)_35%,transparent)] ring-1 ring-black/5">
              <img src={logo} alt="Radiant" className="h-14 w-14 object-contain" />
            </div>
            <div>
              <div className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                Radiant Guard
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Services Pvt. Ltd.
              </div>
            </div>
          </div>

          {/* Glass card */}
          <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-7 shadow-[0_30px_80px_-20px_color-mix(in_oklab,var(--primary)_30%,transparent)] backdrop-blur-2xl sm:p-9">
            {/* inner highlight */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
              }}
            />
            {/* soft accent halo inside card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 50%, transparent), transparent 70%)" }}
            />

            <div className="relative">
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
                {step === "phone" ? (
                  <><Sparkles className="h-3.5 w-3.5 text-accent" /> Welcome back</>
                ) : (
                  <><ShieldCheck className="h-3.5 w-3.5 text-accent" /> Almost there</>
                )}
              </div>
              <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight text-foreground">
                {step === "phone" ? "Sign in to continue" : "Verify your number"}
              </h1>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                {step === "phone"
                  ? "Enter your mobile number to receive a one-time code."
                  : `We sent a 6-digit code to +91 ••• ••• ${phone.slice(-4)}.`}
              </p>

              <div className="mt-6">
                {step === "phone" ? (
                  <form onSubmit={sendOtp} className="space-y-4">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Mobile number
                      </span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-muted-foreground">
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
                          className="h-14 w-full rounded-2xl border border-border/70 bg-white/70 pl-14 pr-5 text-[15px] font-medium tracking-wide text-foreground placeholder:text-muted-foreground/60 backdrop-blur transition-all focus:border-accent focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15"
                        />
                      </div>
                    </label>

                    <Button
                      type="submit"
                      disabled={!phoneValid || sending}
                      className="group h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition-all hover:bg-primary/90 hover:shadow-[0_22px_44px_-12px_color-mix(in_oklab,var(--primary)_70%,transparent)] disabled:opacity-50"
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
                              className="h-14 w-full rounded-2xl border border-border/70 bg-white/70 text-xl font-semibold tabular-nums text-foreground backdrop-blur first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:border-accent data-[active=true]:bg-white data-[active=true]:ring-4 data-[active=true]:ring-accent/15"
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
                      className="h-14 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:bg-primary/90 disabled:opacity-50"
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
              </div>

              {/* trust row */}
              <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-white/50 px-3 py-2.5 text-[11px] text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                <span>Encrypted end-to-end · No password required</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>Radiant Ops Portal</span>
            <span className="inline-flex items-center gap-1.5">
              Powered by
              <span className="rounded-md border border-border bg-white/60 px-1.5 py-0.5 backdrop-blur">
                HyperRevamp
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
