// =============================================================================
// AuthScreen.tsx
// =============================================================================
// Production version of the auth flow. Differences from the prototype:
//   - No client-side OTP generation. Code is sent by Supabase Auth via real email.
//   - No autofill button (real codes go to the user's inbox).
//   - "Resend" button calls /api/auth/send-otp again.
//   - Errors come from the API, not from local string-equality checks.
// =============================================================================

import { useState } from "react";
import { Shield, ChevronRight, Sparkles, Lock, Check } from "lucide-react";
import { auth, ApiError } from "../lib/api";
import { isValidEmail } from "@commonality/shared/validation";
import AgreeRow from "../components/AgreeRow";
import TosBlock from "../components/TosBlock";

type Step = "landing" | "login" | "signup" | "tos" | "tosView" | "otp" | "mod";
type Mode = "login" | "signup";

interface Props {
  onAuthed: () => void;
  showToast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export default function AuthScreen({ onAuthed, showToast }: Props) {
  const [step, setStep] = useState<Step>("landing");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [modCode, setModCode] = useState("");
  const [loading, setLoading] = useState(false);

  // TOS gates
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [houseRulesAgreed, setHouseRulesAgreed] = useState(false);
  const [tosAgreed, setTosAgreed] = useState(false);
  const allAgreed = ageConfirmed && houseRulesAgreed && tosAgreed;

  const sendOtp = async (forMode: Mode) => {
    if (!isValidEmail(email)) {
      showToast("Enter a valid email", "error");
      return;
    }
    setLoading(true);
    try {
      await auth.sendOtp(email.trim().toLowerCase(), forMode);
      setMode(forMode);
      setStep("otp");
      showToast("Code sent — check your inbox", "success");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "no_account") {
          showToast("No account found. Create one instead.", "error");
        } else if (e.code === "account_exists") {
          showToast("Account exists — log in instead.", "error");
          setMode("login");
          setStep("login");
        } else {
          showToast(e.message, "error");
        }
      } else {
        showToast("Could not send code", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      await auth.verifyOtp(email, otp, mode, mode === "signup" ? allAgreed : false);
      onAuthed();
    } catch (e) {
      if (e instanceof ApiError) showToast(e.message, "error");
      else showToast("Verification failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const modLogin = async () => {
    setLoading(true);
    try {
      await auth.modLogin(modCode);
      onAuthed();
    } catch (e) {
      if (e instanceof ApiError) showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ---------- LANDING ----------
  if (step === "landing") {
    return (
      <div className="px-6 pt-16 pb-8 min-h-screen flex flex-col">
        <div className="mb-auto">
          <div className="font-display text-5xl tracking-tight leading-none" style={{ color: "var(--sage)" }}>
            Commonality
          </div>
          <div className="text-base mt-3 leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 320 }}>
            Meet through what you share.
            <br />
            Then talk about one thing you don't.
          </div>

          <div className="mt-10 space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {["Conversations are anonymous to other users", "One difference at a time, only after trust is built", "You can leave any conversation at any time"].map((line) => (
              <div key={line} className="flex items-start gap-2.5">
                <div className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "var(--sage-mid)" }} />
                <div>{line}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 mt-12">
          <button
            onClick={() => { setMode("signup"); setStep("signup"); }}
            className="w-full py-3.5 rounded-xl font-medium text-white transition hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: "var(--sage)" }}
          >
            <Sparkles size={15} /> Create an account
          </button>
          <button
            onClick={() => { setMode("login"); setStep("login"); }}
            className="w-full py-3.5 rounded-xl font-medium transition"
            style={{ background: "var(--bg-soft)", color: "var(--text-primary)" }}
          >
            I already have an account
          </button>
        </div>

        <button
          onClick={() => setStep("mod")}
          className="mt-6 text-xs flex items-center gap-1.5 self-center hover:opacity-70"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Shield size={12} /> Moderator access
        </button>
      </div>
    );
  }

  // ---------- LOGIN ----------
  if (step === "login") {
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col">
        <BackBtn onClick={() => setStep("landing")} />
        <div className="mb-10">
          <div className="font-display text-3xl" style={{ color: "var(--sage)" }}>Welcome back</div>
          <div className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
            Enter your email to receive a sign-in code.
          </div>
        </div>
        <Label>Email</Label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendOtp("login")}
          placeholder="you@example.com"
          autoFocus
          className="w-full px-4 py-3 rounded-xl outline-none"
          style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)", fontSize: 15, color: "var(--text-primary)" }}
        />
        <PrimaryBtn onClick={() => sendOtp("login")} disabled={loading} className="mt-6">
          {loading ? "Sending…" : "Send sign-in code"}
        </PrimaryBtn>
        <div className="text-xs mt-4 text-center" style={{ color: "var(--text-tertiary)" }}>
          New here?{" "}
          <button onClick={() => { setMode("signup"); setStep("signup"); }} className="underline" style={{ color: "var(--sage-mid)" }}>
            Create an account
          </button>
        </div>
      </div>
    );
  }

  // ---------- SIGNUP step 1 ----------
  if (step === "signup") {
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg, var(--sage-bg) 0%, var(--bg-app) 40%)" }}>
        <BackBtn onClick={() => setStep("landing")} />
        <StepLabel>Step 1 of 3</StepLabel>
        <div className="font-display text-3xl leading-tight" style={{ color: "var(--sage)" }}>
          Let's start with your email
        </div>
        <div className="text-sm mt-3 leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          We use it only to sign you in. Other users will never see it.
        </div>

        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-mid)" }}>
          <Label>Email address</Label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.trim() && setStep("tos")}
            placeholder="you@example.com"
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg outline-none"
            style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-input)", fontSize: 15, color: "var(--text-primary)" }}
          />
          <div className="mt-4 pt-4 space-y-2 text-xs" style={{ borderTop: "0.5px solid var(--border-soft)", color: "var(--text-secondary)" }}>
            <div className="flex items-start gap-2">
              <Lock size={11} className="mt-0.5 shrink-0" style={{ color: "var(--sage-mid)" }} />
              <span>Your email stays on the server. Other users see only your anonymous handle.</span>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles size={11} className="mt-0.5 shrink-0" style={{ color: "var(--sage-mid)" }} />
              <span>You'll get a randomly generated handle. You can change it any time.</span>
            </div>
          </div>
        </div>

        <PrimaryBtn
          onClick={() => {
            if (!isValidEmail(email)) { showToast("Enter a valid email", "error"); return; }
            setStep("tos");
          }}
          disabled={!email.trim()}
        >
          Continue <ChevronRight size={15} />
        </PrimaryBtn>

        <div className="text-xs mt-4 text-center" style={{ color: "var(--text-tertiary)" }}>
          Already have an account?{" "}
          <button onClick={() => { setMode("login"); setStep("login"); }} className="underline" style={{ color: "var(--sage-mid)" }}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  // ---------- TOS ----------
  if (step === "tos") {
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col">
        <BackBtn onClick={() => setStep("signup")} />
        <StepLabel>Step 2 of 3</StepLabel>
        <div className="font-display text-3xl leading-tight" style={{ color: "var(--sage)" }}>
          Before we go further
        </div>
        <div className="text-sm mt-3 leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
          Commonality only works if everyone agrees to a few things. Please read carefully.
        </div>

        <div className="space-y-3 mb-6">
          <AgreeRow checked={ageConfirmed} onChange={setAgeConfirmed}
            title="I am 18 or older"
            body="This service is not intended for minors. False age confirmation is grounds for account termination." />
          <AgreeRow checked={houseRulesAgreed} onChange={setHouseRulesAgreed}
            title="I will follow the house rules"
            body={
              <ul className="space-y-1 mt-1.5">
                <li>· Conversation, not debate</li>
                <li>· No hate speech, harassment, or threats</li>
                <li>· No real names, locations, workplaces, or contact info</li>
                <li>· No illegal content, no NSFW content</li>
                <li>· One difference at a time — don't pry</li>
              </ul>
            } />
          <AgreeRow checked={tosAgreed} onChange={setTosAgreed}
            title="I agree to the Terms and Privacy Policy"
            body={
              <span>
                I understand my email is stored privately, my conversations are subject to moderation review when reported, and I can delete my account at any time.{" "}
                <button onClick={() => setStep("tosView")} className="underline" style={{ color: "var(--sage-mid)" }}>Read the full terms</button>
              </span>
            } />
        </div>

        <PrimaryBtn onClick={() => sendOtp("signup")} disabled={!allAgreed || loading}>
          {loading ? "Sending…" : allAgreed ? <>Agree & continue <ChevronRight size={15} /></> : "Check all boxes to continue"}
        </PrimaryBtn>
      </div>
    );
  }

  // ---------- TOS FULL VIEW ----------
  if (step === "tosView") {
    return (
      <div className="px-6 pt-8 pb-8 min-h-screen flex flex-col">
        <BackBtn onClick={() => setStep("tos")} label="Back to agreements" />
        <div className="font-display text-2xl mb-1" style={{ color: "var(--sage)" }}>Terms & Privacy</div>
        <div className="text-xs mb-6" style={{ color: "var(--text-tertiary)" }}>
          Version 1.0 · Last updated {new Date().toLocaleDateString()}
        </div>
        <div className="space-y-5 text-sm leading-relaxed pb-4" style={{ color: "var(--text-secondary)" }}>
          <TosBlock title="What this app is">Commonality is a conversation app that pairs you anonymously with other users based on shared traits, then surfaces one difference once a conversation has built some trust. It is not a dating app, debate platform, or social network.</TosBlock>
          <TosBlock title="Anonymity">Other users see only your randomly generated handle and the profile traits you opt in to share. They never see your email, login provider, real name, or any other identifying information. The platform retains your email for sign-in and abuse prevention.</TosBlock>
          <TosBlock title="What you agree not to do">Don't post hate speech, slurs, threats, harassment, or content sexualizing minors. Don't share other users' personal information. Don't use the app to recruit, market, scam, or solicit. Don't try to identify other users outside the app. Don't share your account with others.</TosBlock>
          <TosBlock title="Moderation">Reported messages are reviewed by human moderators. Moderators see only the content needed for enforcement (the reported user's recent messages, conversation context, severity, and reason) — not your email, login provider, or full profile.</TosBlock>
          <TosBlock title="Data we keep">Your email, anonymous handle, account creation date, profile fields you fill in, conversations you participate in, blocks you create, and reports filed by or against you. We keep this until you delete your account, at which point all of the above is permanently removed.</TosBlock>
          <TosBlock title="Data we don't keep">We don't track your location beyond what you optionally enter as a region type. We don't sell your data. We don't show third-party ads.</TosBlock>
          <TosBlock title="Your rights">Delete your account at any time from Settings. Export your data on request. Withdraw consent for sensitive profile fields field-by-field. Contact us at privacy@commonality.app.</TosBlock>
          <TosBlock title="Changes">If we materially change these terms, you'll be asked to re-agree on next sign-in.</TosBlock>
        </div>
      </div>
    );
  }

  // ---------- OTP ----------
  if (step === "otp") {
    const isSignup = mode === "signup";
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col">
        <BackBtn onClick={() => { setStep(isSignup ? "tos" : "login"); setOtp(""); }} />
        {isSignup && <StepLabel>Step 3 of 3</StepLabel>}
        <div className="font-display text-3xl mb-2" style={{ color: "var(--sage)" }}>
          {isSignup ? "Confirm your email" : "Check your email"}
        </div>
        <div className="text-sm mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          We sent a 6-digit code to <span className="font-medium" style={{ color: "var(--text-primary)" }}>{email}</span>
        </div>

        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && verifyOtp()}
          placeholder="000000"
          inputMode="numeric"
          autoFocus
          className="w-full px-4 py-3 rounded-xl outline-none text-center font-mono tracking-[0.5em] text-lg"
          style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        <PrimaryBtn onClick={verifyOtp} disabled={otp.length !== 6 || loading} className="mt-6">
          {loading ? "Verifying…" : isSignup ? "Verify & finish setup" : "Verify"}
        </PrimaryBtn>
        <button
          onClick={() => sendOtp(mode)}
          className="mt-3 text-xs hover:underline self-center"
          style={{ color: "var(--text-tertiary)" }}
        >
          Didn't get a code? Resend
        </button>
      </div>
    );
  }

  // ---------- MOD LOGIN ----------
  if (step === "mod") {
    return (
      <div className="px-6 pt-12 pb-8 min-h-screen flex flex-col">
        <BackBtn onClick={() => setStep("landing")} />
        <div className="flex items-center gap-2 mb-2">
          <Shield size={16} style={{ color: "var(--amber)" }} />
          <div className="font-medium">Moderator login</div>
        </div>
        <div className="text-xs mb-6" style={{ color: "var(--text-secondary)" }}>
          Moderators have read-only access to reported conversations. They cannot post as users or view personal account details beyond what is required for enforcement.
        </div>
        <input
          type="password"
          value={modCode}
          onChange={(e) => setModCode(e.target.value)}
          placeholder="Moderator access code"
          className="w-full px-4 py-3 rounded-xl outline-none"
          style={{ border: "0.5px solid var(--border-mid)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        <button onClick={modLogin} disabled={loading} className="mt-6 w-full py-3.5 rounded-xl font-medium text-white" style={{ background: "var(--amber)" }}>
          {loading ? "Signing in…" : "Enter dashboard"}
        </button>
      </div>
    );
  }

  return null;
}

// ---------- mini helpers ----------
const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs uppercase tracking-wider mb-2 font-medium block" style={{ color: "var(--text-tertiary)" }}>{children}</label>
);

const StepLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs uppercase tracking-[0.15em] mb-2 font-medium" style={{ color: "var(--sage-mid)" }}>{children}</div>
);

const PrimaryBtn = ({
  onClick, disabled, children, className = "",
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string }) => (
  <button onClick={onClick} disabled={disabled}
    className={`w-full py-3.5 rounded-xl font-medium text-white transition hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 ${className}`}
    style={{ background: "var(--sage)" }}>
    {children}
  </button>
);

const BackBtn = ({ onClick, label = "Back" }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick} className="text-sm flex items-center gap-1 self-start mb-6 hover:opacity-70" style={{ color: "var(--text-tertiary)" }}>
    <ChevronRight size={14} className="rotate-180" /> {label}
  </button>
);
