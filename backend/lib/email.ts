// =============================================================================
// EMAIL SENDER
// =============================================================================
// For OTP delivery, we lean on Supabase Auth's built-in email infrastructure.
// supabase.auth.signInWithOtp({ email }) will send a 6-digit code to the user
// using Supabase's transactional email service (or your configured SMTP).
//
// You can:
//   1. Use Supabase Auth's default email (free, but rate-limited and uses
//      Supabase's "no-reply@..." sender — fine for development).
//   2. Configure custom SMTP in the Supabase dashboard (Auth → Providers →
//      Email → Custom SMTP). Plug in Resend, Postmark, SES, etc. credentials
//      there. After that, signInWithOtp uses your sender automatically.
//   3. (Advanced) Send the email yourself via Resend below, but you'd then
//      have to generate, store, and verify the OTP yourself rather than using
//      Supabase Auth. We don't recommend this for MVP — too much surface area
//      for security mistakes.
//
// The Resend client below is here for non-auth emails: account deletion
// confirmations, moderation notices, weekly digests, etc.
// =============================================================================

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Commonality <auth@commonality.app>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — email not sent. To:", to, "Subject:", subject);
    return { ok: false, reason: "no_provider" as const };
  }
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error("[email] send failed:", result.error);
      return { ok: false, reason: "provider_error" as const, error: result.error };
    }
    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.error("[email] threw:", e);
    return { ok: false, reason: "exception" as const };
  }
}

// -----------------------------------------------------------------------------
// TEMPLATES
// -----------------------------------------------------------------------------

export function accountDeletedEmail(handle: string) {
  return {
    subject: "Your Commonality account has been deleted",
    html: `<p>Hi ${handle},</p>
<p>Your Commonality account and all of its data have been permanently deleted.
We're sorry to see you go. If you change your mind, you're welcome to sign up again with the same email.</p>
<p>— The Commonality team</p>`,
    text: `Your Commonality account has been deleted. We're sorry to see you go.`,
  };
}

export function suspensionNoticeEmail(handle: string, reason: string) {
  return {
    subject: "Your Commonality account has been suspended",
    html: `<p>Hi ${handle},</p>
<p>Your account has been suspended following moderator review of a report
related to: <strong>${reason}</strong>.</p>
<p>If you believe this was in error, you can appeal by replying to this email.</p>
<p>— Commonality moderation</p>`,
  };
}

export function reinstatementEmail(handle: string) {
  return {
    subject: "Your Commonality account has been reinstated",
    html: `<p>Hi ${handle},</p>
<p>Your account has been reviewed and reinstated. You can sign in again
whenever you're ready.</p>
<p>— Commonality moderation</p>`,
  };
}
