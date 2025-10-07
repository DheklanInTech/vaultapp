Backend API — Email Setup

Welcome emails are sent after successful user registration. Email sending is optional and only activates when SMTP environment variables are configured.

Environment variables (backend/.env):

- `SMTP_HOST` — SMTP server hostname
- `SMTP_PORT` — SMTP server port (587 recommended; 465 for secure)
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password
- `SMTP_SECURE` — `true` to force TLS (defaults to true when port is 465)
- `EMAIL_FROM` — Default From header, e.g. `Vault <no-reply@yourdomain.com>`

Behavior:

- If SMTP is not configured, registration still succeeds and the app logs a message indicating that email sending was skipped.
- When configured, a welcome email is sent to the new user asynchronously.

Implementation details:

- Mailer: `backend/utils/email.js` using Nodemailer
- Trigger: `backend/controllers/authController.js` inside `register()` after user creation

Install deps (from backend/):

```
npm install
```

Nodemailer is declared in `backend/package.json` and will be installed with the backend dependencies.

