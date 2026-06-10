import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    await new Promise((r) => setTimeout(r, 600));
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
      // Trigger reveal animation, then navigate
      setRevealing(true);
      setTimeout(() => navigate({ to: "/", replace: true }), 900);
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
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.14_0.04_265)] text-white">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="aurora-blob absolute -left-32 -top-40 h-[620px] w-[620px] rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.55 0.22 262 / 0.65) 0%, transparent 70%)",
          }}
        />
        <div
          className="aurora-blob absolute -right-40 top-1/4 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl"
          style={{
            animationDelay: "-6s",
            background:
              "radial-gradient(circle, oklch(0.7 0.18 200 / 0.55) 0%, transparent 70%)",
          }}
        />
        <div
          className="aurora-blob absolute -bottom-40 left-1/3 h-[640px] w-[640px] rounded-full opacity-55 blur-3xl"
          style={{
            animationDelay: "-12s",
            background:
              "radial-gradient(circle, oklch(0.6 0.2 310 / 0.5) 0%, transparent 70%)",
          }}
        />
        {/* Subtle stars */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "120px 120px",
          }}
        />
      </div>

      {/* Reveal overlay — covers screen on successful login then navigates */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 origin-bottom bg-white transition-transform duration-[850ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {/* Brand pill above card */}
          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur-xl">
              <ShieldCheck className="h-3.5 w-3.5" /> Radiant Guard Portal
            </div>
          </div>

          {/* Glass card */}
          <div className="rounded-[28px] border border-white/20 bg-white/10 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl backdrop-saturate-150 sm:p-9">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl">
                <BrandMark variant="inverse" compact />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {step === "phone" ? "Welcome back" : "Verify it's you"}
              </h1>
              <p className="mt-2 text-sm text-white/70">
                {step === "phone"
                  ? "Sign in to access your command center"
                  : `We sent a 6-digit code to +91 ••• ••• ${phone.slice(-4)}`}
              </p>
            </div>

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-5">
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"
                  >
                    Mobile number
                  </label>
                  <div className="group flex items-stretch overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl transition focus-within:border-white/50 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-white/20">
                    <span className="flex items-center gap-1.5 border-r border-white/15 bg-white/5 px-4 text-sm font-semibold text-white">
                      <span className="text-base">🇮🇳</span> +91
                    </span>
                    <div className="relative flex-1">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                      <input
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
                        className="h-13 w-full bg-transparent py-3.5 pl-9 pr-3 text-base tracking-wider text-white placeholder:text-white/40 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="group h-12 w-full rounded-2xl bg-white text-base font-semibold text-[oklch(0.14_0.04_265)] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] transition-all hover:bg-white/90 hover:shadow-[0_14px_44px_-10px_rgba(255,255,255,0.55)] disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-white/55">
                  By continuing, you agree to our{" "}
                  <span className="font-medium text-white/80">Terms</span>{" "}
                  and{" "}
                  <span className="font-medium text-white/80">Privacy Policy</span>.
                </p>
              </form>
            ) : (
              <div className="space-y-5">
                <div className={error ? "animate-shake" : ""}>
                  <label className="mb-3 block text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                    Enter 6-digit code
                  </label>
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(v) => {
                      setOtp(v);
                      setError(null);
                      if (v.length === 6) handleVerify(v);
                    }}
                    containerClassName="justify-center gap-2"
                  >
                    <InputOTPGroup className="justify-center gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-14 w-12 rounded-xl border border-white/20 bg-white/10 text-xl font-bold text-white backdrop-blur-xl first:rounded-l-xl last:rounded-r-xl data-[active=true]:border-white/60 data-[active=true]:bg-white/20 data-[active=true]:ring-2 data-[active=true]:ring-white/30"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  {error ? (
                    <p className="mt-3 text-center text-sm font-medium text-red-300">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-xs text-white/55">
                      Demo code:{" "}
                      <span className="font-mono font-semibold text-white/90">
                        {DEMO_OTP_HINT}
                      </span>
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => handleVerify()}
                  disabled={otp.length !== 6 || verifying}
                  className="h-12 w-full rounded-2xl bg-white text-base font-semibold text-[oklch(0.14_0.04_265)] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] hover:bg-white/90 disabled:opacity-50"
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
                    className="font-medium text-white/60 transition-colors hover:text-white"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || sending}
                    onClick={() => sendOtp()}
                    className="font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-white/40"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-white/50">
            Need help? <span className="font-semibold text-white/80">Contact support</span>
          </p>
        </div>
      </div>
    </div>
  );
}
