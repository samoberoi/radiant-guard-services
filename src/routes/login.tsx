import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Phone, Home, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp, DEMO_OTP_HINT } from "@/lib/auth";
import heroImage from "@/assets/login-hero.jpg";

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
    <div
      className="relative min-h-screen overflow-hidden bg-cover bg-center px-4 py-8 sm:px-8 sm:py-12"
      style={{ backgroundImage: `url(${heroImage})` }}
    >
      <div className="absolute inset-0 bg-black/30" />

      {/* Reveal overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 origin-bottom bg-white transition-transform duration-[850ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[32px] bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] md:grid-cols-2">
          {/* LEFT — form */}
          <div className="flex flex-col px-6 py-10 sm:px-12 sm:py-14">
            <div className="mb-8 text-center">
              <div className="font-display text-xl font-semibold tracking-tight text-[#2f6b53]">
                radiant
              </div>
            </div>

            <div className="mb-8 text-center">
              <h1 className="font-display text-[34px] font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-[42px]">
                {step === "phone" ? (
                  <>Start your<br />perfect shift</>
                ) : (
                  <>Verify it's<br />really you</>
                )}
              </h1>
            </div>

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-4">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <span className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-500">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="Mobile number"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    className="h-14 w-full rounded-full bg-neutral-100 pl-[5.25rem] pr-5 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-[#2f6b53]/30"
                  />
                </div>

                <div className="rounded-full bg-neutral-100 px-5 py-3.5 text-[13px] text-neutral-500">
                  We'll text a 6-digit code — no password needed
                </div>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="group h-14 w-full rounded-full bg-[#2f6b53] text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(47,107,83,0.6)] transition-all hover:bg-[#275a46] disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Start
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>

                <p className="pt-2 text-center text-[13px] text-neutral-500">
                  New here?{" "}
                  <span className="font-semibold text-neutral-900">Request access</span>
                </p>
              </form>
            ) : (
              <div className="space-y-5">
                <p className="text-center text-sm text-neutral-500">
                  Code sent to +91 ••• ••• {phone.slice(-4)}
                </p>
                <div className={error ? "animate-shake" : ""}>
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
                          className="h-14 w-12 rounded-2xl border-0 bg-neutral-100 text-xl font-bold text-neutral-900 first:rounded-l-2xl last:rounded-r-2xl data-[active=true]:bg-neutral-50 data-[active=true]:ring-2 data-[active=true]:ring-[#2f6b53]/40"
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
                  className="h-14 w-full rounded-full bg-[#2f6b53] text-[15px] font-semibold text-white hover:bg-[#275a46] disabled:opacity-50"
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
                    className="font-semibold text-[#2f6b53] hover:opacity-80 disabled:cursor-not-allowed disabled:text-neutral-400"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — hero image with floating pills */}
          <div className="relative hidden min-h-[560px] overflow-hidden md:block">
            <img
              src={heroImage}
              alt="Mountain trail"
              className="absolute inset-0 h-full w-full object-cover"
              width={1024}
              height={1280}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/20" />

            {/* Pill: Site */}
            <div className="absolute left-8 top-12 flex items-center gap-2 rounded-full bg-white/25 px-3 py-2 pr-4 text-white shadow-lg backdrop-blur-md">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/30">
                <Home className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <div className="text-[10px] opacity-80">Sector 21</div>
                <div className="text-sm font-semibold">Aurora Tower</div>
              </div>
            </div>

            {/* Pill: Stats */}
            <div className="absolute right-8 top-1/3 rounded-2xl bg-white/25 px-4 py-3 text-white shadow-lg backdrop-blur-md">
              <div className="text-base font-bold leading-none">12 guards</div>
              <div className="mt-1 text-[11px] leading-tight opacity-85">
                on duty
                <br />right now
              </div>
            </div>

            {/* Pill: Route label */}
            <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg">
              <MapPin className="h-3.5 w-3.5 text-[#2f6b53]" />
              Patrol Route A
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
