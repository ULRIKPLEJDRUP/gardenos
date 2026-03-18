// ---------------------------------------------------------------------------
// GardenOS – Email Helper (Nodemailer)
// ---------------------------------------------------------------------------
// Konfigurér SMTP via environment variables (se .env.example).
// Hvis SMTP ikke er konfigureret, returnerer sendInviteEmail false
// og admin kan kopiere login-detaljer manuelt.
// ---------------------------------------------------------------------------
import nodemailer from "nodemailer";

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: (process.env.SMTP_PORT || "587") === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        },
      })
    : null;

/**
 * Send an invitation email to a new user.
 * Returns true if the email was sent successfully, false otherwise.
 */
export async function sendInviteEmail(opts: {
  to: string;
  name?: string;
  password: string;
  loginUrl: string;
}): Promise<boolean> {
  if (!transporter) return false;

  const from =
    process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@gardenos.dk";

  const greeting = opts.name ? `Hej ${opts.name}!` : "Hej!";

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: "🌱 Du er inviteret til GardenOS!",
      html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faf6; border-radius: 16px; border: 1px solid #e5e7eb;">
  <h1 style="font-size: 22px; color: #1a1a1a; margin: 0 0 8px;">${greeting}</h1>
  <p style="color: #555; line-height: 1.6; margin: 0 0 24px; font-size: 15px;">
    Du er blevet inviteret til <strong>GardenOS</strong> 🌱 – din digitale haveplanlægger,
    hvor du kan kortlægge din have, holde styr på dine planter og få overblik over sæsonens opgaver.
  </p>

  <div style="background: white; border: 1px solid #d1d5db; border-radius: 10px; padding: 20px; margin: 0 0 24px;">
    <p style="margin: 0 0 12px; color: #333; font-size: 14px;">
      <strong>📧 Email:</strong> ${opts.to}
    </p>
    <p style="margin: 0; color: #333; font-size: 14px;">
      <strong>🔑 Adgangskode:</strong>
      <code style="background: #f3f4f6; padding: 3px 8px; border-radius: 4px; font-size: 15px; letter-spacing: 1px; font-weight: 600;">${opts.password}</code>
    </p>
  </div>

  <div style="text-align: center; margin: 0 0 24px;">
    <a href="${opts.loginUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
      Log ind her →
    </a>
  </div>

  <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
    Vi anbefaler at du ændrer din adgangskode efter første login.<br/>
    Spørgsmål? Svar på denne mail, så hjælper vi dig.
  </p>
</div>
      `.trim(),
      text: `${greeting}\n\nDu er blevet inviteret til GardenOS 🌱 – din digitale haveplanlægger, hvor du kan kortlægge din have, holde styr på dine planter og få overblik over sæsonens opgaver.\n\nLog ind med:\n📧 Email: ${opts.to}\n🔑 Adgangskode: ${opts.password}\n\n👉 Log ind her: ${opts.loginUrl}\n\nVi anbefaler at ændre din adgangskode efter første login.`,
    });
    return true;
  } catch (err) {
    console.error("Failed to send invite email:", err);
    return false;
  }
}
