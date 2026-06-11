import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, MapPin, Users, Sparkles } from "lucide-react";
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0b0f1a]">
      {/* Ambient aurora */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 18% 20%, rgba(37,99,235,0.28), transparent 60%), radial-gradient(ellipse 50% 40% at 90% 85%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(ellipse 40% 30% at 50% 50%, rgba(56,189,248,0.10), transparent 70%)",
        }}
      />
      {/* dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Reveal overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 origin-bottom bg-white transition-transform duration-[850ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      <div className="relative grid min-h-screen w-full overflow-hidden bg-white/[0.02] backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* LEFT — brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-8 xl:p-12 lg:flex">
          {/* gradient backdrop */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(160deg, #0b1220 0%, #0f1d36 45%, #1a3a6e 100%)",
            }}
          />
          {/* aurora blobs */}
          <div
            aria-hidden
            className="aurora-blob absolute -left-20 -top-20 h-80 w-80 rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(circle, #2563eb, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="aurora-blob absolute -right-24 bottom-0 h-96 w-96 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, #38bdf8, transparent 70%)" }}
          />
          {/* subtle shield watermark */}
          <ShieldCheck
            aria-hidden
            className="absolute -right-10 top-1/2 h-[420px] w-[420px] -translate-y-1/2 text-white/[0.04]"
            strokeWidth={1}
          />

          {/* Logo top-left */}
          <div className="relative flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/95 shadow-lg">
              <img src={logo} alt="Radiant Guard" className="h-9 w-9 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold tracking-tight text-white">
                Radiant Guard
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                Services Pvt. Ltd.
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="relative max-w-md">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              <Sparkles className="h-3 w-3" /> Operations portal
            </div>
            <h1 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-[1.04] tracking-tight text-white">
              Command your<br />
              <span className="text-gradient-accent bg-gradient-to-r from-sky-300 to-indigo-200 bg-clip-text text-transparent">
                guard force.
              </span>
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
              Sign in to manage employees, units, attendance, payroll and
              compliance — all in one place.
            </p>
          </div>

          {/* floating glass pills */}
          <div className="relative space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur-xl">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/20 text-emerald-300">
                <Users className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">12 guards on duty</div>
                <div className="text-[11px] text-white/60">Live across 3 units</div>
              </div>
              <span className="ml-auto inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            </div>
            <div className="ml-8 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur-xl">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-400/20 text-sky-300">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">Aurora Tower · Sector 21</div>
                <div className="text-[11px] text-white/60">Patrol Route A · on schedule</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — white form card */}
        <div className="relative flex min-h-screen items-center justify-center bg-white px-5 py-10 sm:px-10 lg:px-12">
          <div className="w-full max-w-[420px]">
            {/* mobile logo */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b1220]">
                <img src={logo} alt="Radiant" className="h-7 w-7 object-contain" />
              </div>
              <div className="leading-tight">
                <div className="font-display text-base font-bold tracking-tight text-neutral-900">
                  Radiant Guard
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Services Pvt. Ltd.
                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#0b1220]/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1220]/70">
                {step === "phone" ? "Welcome back" : "Almost there"}
              </div>
              <h2 className="font-display text-[38px] font-extrabold leading-[1.05] tracking-tight text-neutral-900">
                {step === "phone" ? "Sign in" : "Verify OTP"}
              </h2>
              <p className="mt-2 text-[14px] text-neutral-500">
                {step === "phone"
                  ? "Enter your mobile number to receive a one-time code."
                  : `We sent a 6-digit code to +91 ••• ••• ${phone.slice(-4)}.`}
              </p>
            </div>

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                    Mobile number
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-neutral-400">
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
                      className="h-14 w-full rounded-2xl border border-neutral-200 bg-neutral-50 pl-14 pr-5 text-[15px] font-medium tracking-wide text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-[#2563eb] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2563eb]/12"
                    />
                  </div>
                </label>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="group h-14 w-full rounded-2xl bg-[#0b1220] text-[15px] font-semibold text-white shadow-[0_18px_40px_-12px_rgba(11,18,32,0.55)] transition-all hover:bg-[#111a30] hover:shadow-[0_22px_44px_-12px_rgba(11,18,32,0.65)] disabled:opacity-50"
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

                <p className="pt-1 text-center text-[12.5px] text-neutral-500">
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
                          className="h-14 w-12 rounded-2xl border border-neutral-200 bg-neutral-50 text-xl font-bold tabular-nums text-neutral-900 first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:border-[#2563eb] data-[active=true]:bg-white data-[active=true]:ring-4 data-[active=true]:ring-[#2563eb]/12"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  {error ? (
                    <p className="mt-3 text-center text-sm font-medium text-red-500">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-3 text-center text-xs text-neutral-500">
                      Demo code:{" "}
                      <span className="font-mono font-semibold text-neutral-900">
                        {DEMO_OTP_HINT}
                      </span>
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => handleVerify()}
                  disabled={otp.length !== 6 || verifying}
                  className="h-14 w-full rounded-2xl bg-[#0b1220] text-[15px] font-semibold text-white shadow-[0_18px_40px_-12px_rgba(11,18,32,0.55)] hover:bg-[#111a30] disabled:opacity-50"
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
                    className="font-medium text-neutral-500 hover:text-neutral-900"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || sending}
                    onClick={() => sendOtp()}
                    className="font-semibold text-[#2563eb] hover:opacity-80 disabled:cursor-not-allowed disabled:text-neutral-400"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}

            {step === "phone" && (
              <p className="mt-10 text-center text-[12px] leading-relaxed text-neutral-500">
                By signing in you agree to Radiant's{" "}
                <span className="font-semibold text-neutral-700">Terms of Service</span>{" "}
                and{" "}
                <span className="font-semibold text-neutral-700">Privacy Policy</span>.
              </p>
            )}

            {/* Powered by slot — replace with RevdInfo logo when provided */}
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
              <span>Powered by</span>
              <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-neutral-600">
                RevdInfo
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
