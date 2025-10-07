import nodemailer from 'nodemailer';

let transporter = null;

function emailEnabled() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

async function getTransporter() {
  if (!emailEnabled()) return null;
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

export async function sendEmail({ to, subject, text, html, from }) {
  const t = await getTransporter();
  if (!t) {
    console.log('[email] Not configured. Skipping send.', { to, subject });
    return { skipped: true };
  }
  const info = await t.sendMail({
    from: from || process.env.EMAIL_FROM || 'Vault <no-reply@vault.local>',
    to,
    subject,
    text,
    html,
  });
  return info;
}

export async function sendWelcomeEmail(to, username) {
  const safeName = String(username || '').trim() || 'there';
  const subject = 'Welcome to Vault';
  const text = `Hi ${safeName},\n\nWelcome to Vault! Your account has been created successfully.\n\nIf you didn\'t sign up, please contact support.\n\n— The Vault Team`;
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2 style="margin: 0 0 16px;">Welcome to Vault</h2>
      <p>Hi <strong>${safeName}</strong>,</p>
      <p>Thanks for signing up. Your account has been created successfully.</p>
      <p>If you didn\u2019t sign up, please contact support.</p>
      <p style="margin-top: 24px;">— The Vault Team</p>
    </div>
  `;
  return sendEmail({ to, subject, text, html });
}

