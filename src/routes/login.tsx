import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0d0d10]">
      {/* Reveal overlay */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 origin-bottom bg-[#0d0d10] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      {/* Full-bleed stage */}
      <div className="relative grid min-h-screen w-full overflow-hidden bg-[#0d0d10] lg:grid-cols-[1.35fr_1fr]">
        {/* LEFT — hero canvas */}
        <div className="relative flex min-h-[420px] flex-col justify-between overflow-hidden p-6 sm:p-10 lg:p-14">
          {/* fabric-like warm gradient */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 90% 70% at 70% 55%, #f2913a 0%, #c85422 35%, #6b1f18 65%, #2a0e12 90%), linear-gradient(115deg, #2a1830 0%, transparent 55%)",
            }}
          />
          {/* woven texture */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.15) 0 1px, transparent 1px 3px)",
            }}
          />
          {/* violet bleed */}
          <div
            aria-hidden
            className="absolute -left-24 top-1/4 h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, #4b1e5a, transparent 70%)" }}
          />

          {/* top-left brand */}
          <div className="relative flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#f3e6d0]">
              <img src={logo} alt="Radiant" className="h-6 w-6 object-contain" />
            </div>
            <div className="leading-tight text-[#f3e6d0]">
              <div className="text-[13px] font-semibold tracking-tight">
                radiant<span className="opacity-60">.</span>
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.2em] opacity-60">
                guard services
              </div>
            </div>
          </div>

          {/* bottom hero row */}
          <div className="relative flex flex-wrap items-end justify-between gap-6 text-[#f3e6d0]">
            <div className="font-display text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-tight">
              RGS
            </div>

            {/* clock cluster */}
            <div className="flex items-center gap-3">
              <div className="relative h-6 w-6">
                <div className="absolute inset-0 rounded-full border border-[#f3e6d0]/60" />
                <div
                  className="absolute inset-0 origin-center animate-spin rounded-full border border-transparent border-t-[#f3e6d0]"
                  style={{ animationDuration: "6s" }}
                />
              </div>
              <div className="grid grid-cols-[auto_auto] gap-x-2 font-mono text-[11px] leading-[1.35] tabular-nums opacity-90">
                <span>{clock.ist}</span><span className="opacity-60">IST</span>
                <span>{clock.bst}</span><span className="opacity-60">BST</span>
                <span>{clock.edt}</span><span className="opacity-60">EDT</span>
              </div>
            </div>

            <div className="font-display text-[clamp(2rem,5.5vw,4.25rem)] font-semibold leading-[0.9] tracking-tight">
              REAL<span className="opacity-70">:</span>TIME
            </div>
          </div>
        </div>

        {/* RIGHT — stacked floating panels */}
        <div className="relative flex flex-col gap-3 p-4 sm:p-6 lg:p-5">
          {/* INFO pill */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0d0d10] px-5 py-3.5 text-[#f3e6d0]">
            <span className="text-[13px] font-semibold tracking-wide">INFO</span>
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* SIGN IN panel — primary */}
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] p-6 text-[#f3e6d0]">
            {/* subtle amber wash */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -bottom-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(circle, #f2913a, transparent 70%)" }}
            />

            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-[15px] font-semibold tracking-wide">
                  {step === "phone" ? "SIGN IN" : "VERIFY OTP"}
                </div>
                <ArrowRight className="mt-1.5 h-4 w-4" />
              </div>
              <div className="grid h-5 w-5 place-items-center rounded-full border border-[#f3e6d0]/40 text-[10px] leading-none">−</div>
            </div>

            <div className="mt-6 border-t border-[#f3e6d0]/10 pt-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] opacity-60">
                {step === "phone" ? "Mobile" : `Code sent to +91 ••• ${phone.slice(-4)}`}
              </div>

              {step === "phone" ? (
                <form onSubmit={sendOtp} className="space-y-3">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[#f3e6d0]/60">
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
                      className="h-12 w-full rounded-xl border border-[#f3e6d0]/15 bg-black/40 pl-12 pr-4 font-mono text-[14px] tracking-wide text-[#f3e6d0] placeholder:text-[#f3e6d0]/30 focus:border-[#f2913a] focus:outline-none focus:ring-2 focus:ring-[#f2913a]/30"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!phoneValid || sending}
                    className="group h-12 w-full rounded-xl bg-[#f3e6d0] text-[13px] font-semibold tracking-wide text-[#0d0d10] hover:bg-white disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        SEND OTP
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className={error ? "animate-shake" : ""}>
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={(v) => {
                        setOtp(v);
                        setError(null);
                        if (v.length === 6) handleVerify(v);
                      }}
                      containerClassName="justify-between gap-1.5"
                    >
                      <InputOTPGroup className="flex w-full justify-between gap-1.5">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="h-12 w-full rounded-lg border border-[#f3e6d0]/15 bg-black/40 font-mono text-[16px] font-semibold tabular-nums text-[#f3e6d0] first:rounded-l-lg last:rounded-r-lg data-[active=true]:border-[#f2913a] data-[active=true]:ring-2 data-[active=true]:ring-[#f2913a]/30"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button
                    onClick={() => handleVerify()}
                    disabled={otp.length !== 6 || verifying}
                    className="h-12 w-full rounded-xl bg-[#f3e6d0] text-[13px] font-semibold tracking-wide text-[#0d0d10] hover:bg-white disabled:opacity-40"
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "VERIFY & SIGN IN"
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* progress hairline */}
            <div className="relative mt-5">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#f3e6d0]/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: step === "phone" ? "50%" : "100%",
                    background: "linear-gradient(90deg, #b23a1a, #f2913a, #f3e6d0)",
                  }}
                />
              </div>
            </div>

            {/* footer row */}
            <div className="relative mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] opacity-70">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-[#f2913a] shadow-[0_0_10px_#f2913a]" />
                <span>Secure session</span>
              </div>
              {step === "otp" && (
                <button
                  type="button"
                  disabled={resendIn > 0 || sending}
                  onClick={() => sendOtp()}
                  className="font-semibold tracking-[0.18em] text-[#f2913a] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resendIn > 0 ? `Resend ${resendIn}s` : "Resend"}
                </button>
              )}
            </div>
          </div>

          {/* STATUS panel */}
          <div className="rounded-2xl border border-white/10 bg-[#0d0d10] p-5 text-[#f3e6d0]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[13px] font-semibold tracking-wide">
                  {step === "phone" ? "WELCOME" : "ALMOST THERE"}
                </div>
                <ArrowRight className="mt-1 h-3.5 w-3.5" />
              </div>
              <div className="grid h-5 w-5 place-items-center rounded-full border border-[#f3e6d0]/40 text-[10px] leading-none">−</div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#f3e6d0]/10 pt-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-60">
                Demo Code
              </div>
              <div className="font-mono text-[11px] tabular-nums opacity-80">
                {DEMO_OTP_HINT}
              </div>
            </div>
            {step === "otp" && (
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setError(null);
                }}
                className="mt-3 text-[10px] uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
              >
                ← Change number
              </button>
            )}
            {error && (
              <div className="mt-3 text-[11px] text-[#f2913a]">{error}</div>
            )}
          </div>

          {/* powered-by chip */}
          <div className="flex items-center justify-between px-1 text-[9px] font-medium uppercase tracking-[0.22em] text-[#f3e6d0]/50">
            <span>Radiant Ops Portal</span>
            <span>Powered · HyperRevamp</span>
          </div>
        </div>
      </div>
    </div>
  );
}
