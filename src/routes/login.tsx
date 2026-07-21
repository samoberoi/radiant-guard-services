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
import { useAuth, verifyOtp } from "@/lib/auth";
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
    toast.success(`OTP sent to +91 ••• ••• ${phone.slice(-4)}`);
  }

  async function handleVerify(value?: string) {
    const code = value ?? otp;
    if (code.length !== 6 || verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setVerifying(true);
    if (!verifyOtp(code)) {
      verifyInFlightRef.current = false;
      setVerifying(false);
      setError("Incorrect code. Please check your SMS and try again.");
      setOtp("");
      return;
    }
    try {
      await login(`+91${phone}`);
      toast.success("Signed in");
      setRevealing(true);
      // Wait for the slide-up animation to play before navigating.
      setTimeout(() => navigate({ to: "/", replace: true }), 640);
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
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-95"
      />
      {/* Dark vignette so white/black text above the card remains readable */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 35%, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.12) 45%, transparent 70%), linear-gradient(to bottom, rgba(15,23,42,0.45) 0%, transparent 35%, transparent 70%, rgba(15,23,42,0.35) 100%)",
        }}
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
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent 80%)",
        }}
      />

      {/* Content wrapper — slides up on successful sign-in to reveal the CRM */}
      <div className={revealing ? "animate-slide-out-up" : ""}>

      {/* Centered glass card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">

        <div className="w-full max-w-[440px]">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.35)] ring-1 ring-white/30">
              <img src={logo} alt="Radiant" className="h-14 w-14 object-contain" />
            </div>
            <div>
              <div
                className="font-display text-[18px] font-semibold tracking-tight text-white"
                style={{ textShadow: "0 2px 10px rgba(15,23,42,0.35)" }}
              >
                Radiant Guard
              </div>
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85"
                style={{ textShadow: "0 1px 6px rgba(15,23,42,0.35)" }}
              >
                Services Pvt. Ltd.
              </div>
            </div>
          </div>

          {/* Glass card */}
          <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/[0.96] p-7 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] backdrop-blur-2xl sm:p-9">
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

              <div className="mt-7">
                {step === "phone" ? (
                  <form onSubmit={sendOtp} className="space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Mobile number
                      </span>
                      <div className="flex h-14 w-full items-center overflow-hidden rounded-2xl border border-border/70 bg-white/85 backdrop-blur transition-all focus-within:border-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-accent/15">
                        <div className="flex items-center gap-3 pl-5 pr-3">
                          <span className="text-[15px] font-semibold text-foreground">
                            +91
                          </span>
                          <span className="h-6 w-px bg-border" />
                        </div>
                        <input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="98765 43210"
                          value={phone}
                          onChange={(e) =>
                            setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                          }
                          className="h-full flex-1 bg-transparent pr-5 text-[16px] font-medium tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
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
                              className="h-14 w-full rounded-2xl border border-border/70 bg-white/85 text-xl font-semibold tabular-nums text-foreground backdrop-blur first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:border-accent data-[active=true]:bg-white data-[active=true]:ring-4 data-[active=true]:ring-accent/15"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>

                      {error ? (
                        <p className="mt-3 text-center text-sm font-medium text-destructive">
                          {error}
                        </p>
                      ) : (
                        <p className="mt-3 text-center text-[13px] text-muted-foreground">
                          Enter the 6-digit code sent to your phone
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={() => handleVerify()}
                      disabled={otp.length !== 6 || verifying}
                      className="h-14 w-full rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--primary)_60%,transparent)] hover:bg-primary/90 disabled:opacity-50"
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
              <div className="mt-7 flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 text-[12px] text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <span>Encrypted end-to-end · Secure OTP verification</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="mt-8 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85"
            style={{ textShadow: "0 1px 6px rgba(15,23,42,0.35)" }}
          >
            <span>Radiant Ops Portal</span>
            <span className="inline-flex items-center gap-1.5">
              Powered by
              <span className="rounded-md border border-white/30 bg-white/20 px-1.5 py-0.5 text-white backdrop-blur">
                HyperRevamp
              </span>
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
