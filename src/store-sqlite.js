import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prospect', 'founding', 'active', 'lapsed')),
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

CREATE INDEX IF NOT EXISTS idx_pledges_member ON pledges(member_id);
CREATE INDEX IF NOT EXISTS idx_pledges_cycle ON pledges(cycle_index);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
`;

const SEED_MEMBERS = [
  { id: 'M100-001', name: 'Founding Member One', email: 'founder1@muse100.org', status: 'founding', tier: 'founding', source: 'founder', join_date: '2024-08-01', welcomed_at: '2024-08-01' },
  { id: 'M100-002', name: 'Founding Member Two', email: 'founder2@muse100.org', status: 'founding', tier: 'founding', source: 'founder', join_date: '2024-08-01', welcomed_at: '2024-08-01' },
  { id: 'M100-003', name: 'Active Member One', email: 'active1@muse100.org', status: 'active', tier: 'standard', source: 'referral', join_date: '2024-09-15', welcomed_at: '2024-09-15' },
  { id: 'M100-004', name: 'Active Member Two', email: 'active2@muse100.org', status: 'active', tier: 'standard', source: 'referral', join_date: '2024-09-20', welcomed_at: '2024-09-20' },
  { id: 'M100-005', name: 'Prospect Member', email: 'prospect1@muse100.org', status: 'prospect', tier: 'standard', source: 'referral', join_date: '2024-10-01', welcomed_at: null },
];

const SEED_PLEDGES = [
  { id: 'PLD-M100-001-1', member_id: 'M100-001', cycle_index: 1, pledged: 1000, paid_ytd: 1000, status: 'paid', due_date: '2024-12-31', method: 'stripe', last_payment: '2024-12-15' },
  { id: 'PLD-M100-002-1', member_id: 'M100-002', cycle_index: 1, pledged: 1000, paid_ytd: 1000, status: 'paid', due_date: '2024-12-31', method: 'stripe', last_payment: '2024-12-20' },
  { id: 'PLD-M100-003-1', member_id: 'M100-003', cycle_index: 1, pledged: 1000, paid_ytd: 1000, status: 'paid', due_date: '2024-12-31', method: 'stripe', last_payment: '2024-12-28' },
  { id: 'PLD-M100-004-1', member_id: 'M100-004', cycle_index: 1, pledged: 1000, paid_ytd: 500, status: 'pending', due_date: '2024-12-31', method: null, last_payment: '2024-11-15' },
  { id: 'PLD-M100-005-1', member_id: 'M100-005', cycle_index: 1, pledged: 1000, paid_ytd: 0, status: 'pending', due_date: '2024-12-31', method: null, last_payment: null },
];

export function createStore(dbPath = ':memory:') {
  const db = new DatabaseSync(dbPath);
  
  db.exec(SCHEMA);
  
  const seedMembers = db.prepare('SELECT COUNT(*) as count FROM members').get();
  if (seedMembers.count === 0) {
    const insertMember = db.prepare('INSERT INTO members (id, name, email, status, tier, source, join_date, welcomed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertPledge = db.prepare('INSERT INTO pledges (id, member_id, cycle_index, pledged, paid_ytd, status, due_date, method, last_payment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    
    for (const m of SEED_MEMBERS) {
      insertMember.run(m.id, m.name, m.email, m.status, m.tier, m.source, m.join_date, m.welcomed_at);
    }
    for (const p of SEED_PLEDGES) {
      insertPledge.run(p.id, p.member_id, p.cycle_index, p.pledged, p.paid_ytd, p.status, p.due_date, p.method, p.last_payment);
    }
  }
  
  return {
    run: (sql, params = []) => db.prepare(sql).run(...params),
    get: (sql, params = []) => db.prepare(sql).get(...params),
    all: (sql, params = []) => db.prepare(sql).all(...params),
    close: () => db.close()
  };
}