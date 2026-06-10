import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth, verifyOtp, DEMO_OTP_HINT } from "@/lib/auth";
import characterImage from "@/assets/login-character.jpg";

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

const BRAND = "#7ec242";
const BRAND_DARK = "#5fa028";

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
    <div className="relative min-h-screen overflow-hidden bg-[#0d1f12] p-3 sm:p-6">
      {/* Reveal overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 origin-bottom bg-white transition-transform duration-[850ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          revealing ? "translate-y-0" : "translate-y-full"
        }`}
      />

      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1280px] overflow-hidden rounded-[28px] bg-[#c6e8b3] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.4)] md:grid-cols-[1.05fr_1fr]">
        {/* LEFT — illustration */}
        <div className="relative hidden min-h-[560px] md:block">
          <img
            src={characterImage}
            alt="Radiant Guard mascot"
            className="absolute inset-0 h-full w-full object-cover"
            width={1024}
            height={1280}
          />
        </div>

        {/* RIGHT — white form card */}
        <div className="relative flex items-center justify-center bg-white p-6 sm:p-10 md:rounded-l-[28px]">
          <div className="w-full max-w-[420px]">
            {/* Logo */}
            <div className="mb-8 flex items-center justify-center gap-2">
              <span
                className="grid h-9 w-9 place-items-center rounded-lg text-white"
                style={{ background: BRAND }}
              >
                <Shield className="h-5 w-5" />
              </span>
              <span className="font-display text-2xl font-bold tracking-tight text-neutral-900">
                radiant
              </span>
            </div>

            {/* Heading */}
            <h1 className="mb-10 text-center font-display text-[44px] font-extrabold leading-[1.05] tracking-tight text-neutral-900 sm:text-[52px]">
              {step === "phone" ? (
                <>
                  Sign
                  <br />
                  in
                </>
              ) : (
                <>Verify OTP</>
              )}
            </h1>

            {step === "phone" ? (
              <form onSubmit={sendOtp} className="space-y-4">
                <div className="relative">
                  <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[15px] font-medium text-neutral-400">
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
                    className="h-14 w-full rounded-full border border-neutral-200 bg-white pl-16 pr-5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:border-[color:var(--brand)] focus:outline-none focus:ring-4 focus:ring-[color:var(--brand)]/15"
                    style={{ ["--brand" as any]: BRAND }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!phoneValid || sending}
                  className="group h-14 w-full rounded-full text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(126,194,66,0.55)] transition-all hover:opacity-95 disabled:opacity-50"
                  style={{ background: BRAND }}
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

                <p className="pt-2 text-center text-[13px] text-neutral-500">
                  We'll text a 6-digit code — no password needed
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
                          className="h-14 w-12 rounded-2xl border border-neutral-200 bg-white text-xl font-bold text-neutral-900 first:rounded-l-2xl last:rounded-r-2xl"
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
                  className="h-14 w-full rounded-full text-[15px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
                  style={{ background: BRAND }}
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
                    className="font-semibold hover:opacity-80 disabled:cursor-not-allowed disabled:text-neutral-400"
                    style={{ color: BRAND_DARK }}
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}

            {step === "phone" && (
              <p className="mt-10 text-center text-[13px] text-neutral-500">
                By signing in you agree to Radiant's{" "}
                <span
                  className="font-semibold"
                  style={{ color: BRAND_DARK }}
                >
                  Terms of Service
                </span>{" "}
                and{" "}
                <span
                  className="font-semibold"
                  style={{ color: BRAND_DARK }}
                >
                  Privacy Policy
                </span>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
