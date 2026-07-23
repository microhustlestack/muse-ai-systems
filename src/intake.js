import { generateId, STATUS } from './db.js';

export function intakeMember(store, { name, email, tier = 'Member', source = 'direct', invitedBy = null }) {
  const count = store.get('SELECT COUNT(*) as count FROM members');
  const id = generateId('M100', count.count + 1);
  // Roster tier vocab: "Founding Cabinet" | "Member"
  const isFounding = tier === 'Founding Cabinet';
  const status = isFounding ? STATUS.FOUNDING : STATUS.PROSPECT;
  const now = new Date().toISOString().split('T')[0];

  store.run(
    `INSERT INTO members (id, name, email, status, tier, source, join_date, welcomed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, email, status, tier, source, now, isFounding ? now : null]
  );

  const row = store.get('SELECT * FROM members WHERE id = ?', [id]);
  return row;
}