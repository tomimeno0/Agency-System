import nodemailer from "nodemailer";
import { env } from "@/lib/env";

function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP no configurado");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export async function sendResetPasswordEmail(params: { to: string; resetToken: string }) {
  const transporter = getTransporter();
  const resetUrl = `${env.NEXTAUTH_URL}/reset-password/confirm?token=${encodeURIComponent(params.resetToken)}`;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: "Recuperación de contraseña - EDITEX STUDIO",
    text: `Recibimos una solicitud para restablecer tu contraseña.\n\nUsa este enlace: ${resetUrl}\n\nSi no fuiste vos, ignorá este mensaje.`,
    html: `
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Restablecer contraseña</a></p>
      <p>Si no fuiste vos, ignorá este mensaje.</p>
    `,
  });
}

export function smtpConfigured() {
  return isSmtpConfigured();
}
