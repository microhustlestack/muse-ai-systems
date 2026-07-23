import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

const DB_PATH = process.env.DATABASE_PATH || resolve(__dirname, '..', 'muse100.db');
const CYCLES_COUNT = parseInt(process.env.CYCLES || '1', 10);
const PLEDGE_AMOUNT = 1000;

export const STATUS = {
  PROSPECT: 'prospect',
  FOUNDING: 'founding',
  ACTIVE: 'active',
  LAPSED: 'lapsed'
};

export const PLEDGE_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  OVERDUE: 'overdue',
  WAIVED: 'waived'
};

export function generateMemberId(index) {
  return `M100-${String(index).padStart(3, '0')}`;
}

export function generateId(prefix, index) {
  return `${prefix}-${String(index).padStart(3, '0')}`;
}

export function createStore(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('prospect', 'founding', 'active', 'lapsed', 'cabinet')),
      tier TEXT NOT NULL,
      source TEXT,
      join_date TEXT,
      welcomed_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS pledges (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      cycle_index INTEGER NOT NULL,
      pledged INTEGER NOT NULL,
      paid_ytd INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'overdue', 'waived')),
      due_date TEXT,
      method TEXT,
      last_payment TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      pledge_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      stripe_charge_id TEXT,
      stripe_webhook_event_id TEXT,
      failed_at TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (pledge_id) REFERENCES pledges(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );
    
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      stripe_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      processed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      sent_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_pledges_member ON pledges(member_id);
    CREATE INDEX IF NOT EXISTS idx_pledges_cycle ON pledges(cycle_index);
    CREATE INDEX IF NOT EXISTS idx_payments_pledge ON payments(pledge_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_stripe_event ON webhooks(stripe_event_id);
    CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
  `);
  
  return {
    db,
    run: (sql, params = []) => db.prepare(sql).run(...params),
    get: (sql, params = []) => db.prepare(sql).get(...params),
    all: (sql, params = []) => db.prepare(sql).all(...params),
    close: () => db.close()
  };
}

export function seedFoundingCabinet(store, count = 100) {
  const now = new Date().toISOString();
  const insert = store.db.prepare(
    `INSERT OR IGNORE INTO members (id, name, email, status, tier, source, join_date, welcomed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  
  for (let i = 1; i <= count; i++) {
    const id = generateMemberId(i);
    const name = i <= 10 ? `Founding Cabinet ${i}` : `Member ${i}`;
    const email = i <= 10 ? `cabinet${i}@muse100.org` : `member${i}@muse100.org`;
    const status = i <= 10 ? STATUS.FOUNDING : STATUS.PROSPECT;
    const tier = i <= 10 ? 'founding' : 'standard';
    const source = i <= 10 ? 'founder' : 'referral';
    const joinDate = now.split('T')[0];
    const welcomedAt = i <= 10 ? now.split('T')[0] : null;
    
    insert.run(id, name, email, status, tier, source, joinDate, welcomedAt);
  }
  
  const result = store.get('SELECT COUNT(*) as count FROM members');
  return result.count;
}

export function seedPledges(store, cycleIndex = 1) {
  const members = store.all("SELECT id FROM members WHERE status IN (?, ?)", [STATUS.FOUNDING, STATUS.PROSPECT]);
  const now = new Date().toISOString();
  const dueDate = new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0];
  
  const insert = store.db.prepare(
    `INSERT OR IGNORE INTO pledges (id, member_id, cycle_index, pledged, paid_ytd, status, due_date, method, last_payment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  
  for (const member of members) {
    const pledgeId = `PLD-${member.id}-${cycleIndex}`;
    insert.run(pledgeId, member.id, cycleIndex, PLEDGE_AMOUNT, 0, PLEDGE_STATUS.PENDING, dueDate, null, null);
  }
  
  return members.length;
}

export function closeStore(store) {
  store.close();
}

export { DB_PATH, CYCLES_COUNT, PLEDGE_AMOUNT };