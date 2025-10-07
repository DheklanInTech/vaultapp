import { sql } from '../config/db.js';
import { signToken } from '../utils/token.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { sendWelcomeEmail } from '../utils/email.js';

// Helpers for Google OAuth
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function encodeState(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function decodeState(state) {
  try {
    return JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8')) || {};
  } catch {
    return {};
  }
}

export async function register(req, res) {
  try {
    let { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    username = String(username).trim();
    email = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email' });
    }
    const existing = await sql`SELECT id FROM users WHERE lower(email) = ${email} OR username = ${username} LIMIT 1`;
    if (existing.length) return res.status(409).json({ message: 'User already exists' });

    const password_hash = hashPassword(password);
    const role = 'user';
    const rows = await sql`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (${username}, ${email}, ${password_hash}, ${role})
      RETURNING id, username, email, role
    `;
    const user = rows[0];
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    // Record login via Google
    try {
      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim() || null;
      const ua = (req.get('user-agent') || '').trim() || null;
      await sql`INSERT INTO login_stamps (user_id, ip_addr, user_agent) VALUES (${user.id}, ${ip}, ${ua})`;
    } catch {}

    // Fire-and-forget welcome email (does not block registration)
    Promise.resolve()
      .then(() => sendWelcomeEmail(user.email, user.username))
      .catch((err) => {
        console.log('Failed to send welcome email', err?.message || err);
      });

    return res.status(201).json({ token, user });
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({ message: 'User already exists' });
    }
    console.log('Error registering user', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function login(req, res) {
  try {
    const { emailusername, password } = req.body || {};
    if (!emailusername || !password) {
      return res.status(400).json({ message: 'Email/Username and password required' });
    }
    const id = String(emailusername).trim();
    const rows = await sql`SELECT id, username, email, role, password_hash FROM users WHERE lower(email) = ${id.toLowerCase()} OR username = ${id} LIMIT 1`;
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken({ sub: user.id, username: user.username, role: user.role });

    // Record login stamp (best-effort)
    try {
      const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim() || null;
      const ua = (req.get('user-agent') || '').trim() || null;
      await sql`INSERT INTO login_stamps (user_id, ip_addr, user_agent) VALUES (${user.id}, ${ip}, ${ua})`;
    } catch (e) {
      // non-fatal
      console.log('Failed to record login stamp', e?.message || e);
    }

    return res.status(200).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (e) {
    console.log('Error logging in', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function me(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const rows = await sql`SELECT id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at FROM users WHERE id = ${userId} LIMIT 1`;
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user });
  } catch (e) {
    console.log('Error fetching profile', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function updateMe(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { username, email } = req.body || {};
    if (!username && !email) return res.status(400).json({ message: 'Nothing to update' });
    const currentRows = await sql`SELECT id FROM users WHERE (email = ${email} AND ${email} IS NOT NULL) OR (username = ${username} AND ${username} IS NOT NULL) AND id <> ${userId} LIMIT 1`;
    if (currentRows.length) return res.status(409).json({ message: 'Username or email already in use' });
    const rows = await sql`
      UPDATE users SET
        username = COALESCE(${username}, username),
        email = COALESCE(${email}, email),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
    `;
    const user = rows[0];
    return res.status(200).json({ user });
  } catch (e) {
    console.log('Error updating profile', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function listLoginStamps(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const limitRaw = String(req.query?.limit ?? '20');
    const limit = Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 20));
    const rows = await sql`
      SELECT id, ip_addr, user_agent, created_at
      FROM login_stamps
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return res.status(200).json({ logins: rows });
  } catch (e) {
    console.log('Error listing login stamps', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// --- Google OAuth: start ---
export async function googleAuthStart(req, res) {
  try {
    const baseUrl = getBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/auth/google/callback`;
    const appRedirect = String(req.query.redirect_uri || '') || `${baseUrl}`;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: 'Google client ID not configured' });
    }

    const state = encodeState({ appRedirect });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    });
    const url = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
    return res.redirect(url);
  } catch (e) {
    console.log('Error starting Google OAuth', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// --- Google OAuth: callback ---
export async function googleAuthCallback(req, res) {
  try {
    const code = String(req.query.code || '');
    const stateRaw = req.query.state || '';
    const { appRedirect } = decodeState(stateRaw);
    const baseUrl = getBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/auth/google/callback`;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send('Google OAuth not configured');
    }

    if (!code) return res.status(400).send('Missing code');

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.log('Google token exchange failed', tokenJson);
      return res.status(400).send('Failed to authenticate with Google');
    }

    const accessToken = tokenJson.access_token;
    if (!accessToken) return res.status(400).send('No access token');

    // Fetch user profile
    const profileRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok) {
      console.log('Google userinfo failed', profile);
      return res.status(400).send('Failed to retrieve Google profile');
    }

    const email = String(profile.email || '').toLowerCase();
    const name = String(profile.name || '').trim();
    if (!email) return res.status(400).send('Email not available from Google');

    // Find or create local user
    let existing = await sql`SELECT id, username, email, role FROM users WHERE lower(email) = ${email} LIMIT 1`;
    let user = existing[0];
    if (!user) {
      // Create a username from email local part or name
      const local = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
      let candidate = local;
      let n = 1;
      // ensure unique username
      while ((await sql`SELECT 1 FROM users WHERE username = ${candidate} LIMIT 1`).length) {
        n += 1;
        candidate = `${local}${n}`.slice(0, 24);
      }
      const password_hash = hashPassword(Math.random().toString(36).slice(2) + Date.now());
      const role = 'user';
      const rows = await sql`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (${candidate}, ${email}, ${password_hash}, ${role})
        RETURNING id, username, email, role
      `;
      user = rows[0];

      // Fire and forget welcome email
      Promise.resolve().then(() => sendWelcomeEmail(user.email, user.username)).catch(() => {});
    }

    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    const redirect = String(appRedirect || `${baseUrl}`).split('#')[0];
    const url = `${redirect}${redirect.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    return res.redirect(url);
  } catch (e) {
    console.log('Error in Google OAuth callback', e);
    return res.status(500).send('Internal server error');
  }
}
