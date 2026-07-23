import { generateId, PLEDGE_STATUS } from './db.js';

export function pledge(store, { memberId, cycleIndex, pledged, dueDate = null }) {
  const now = new Date().toISOString();
  const due = dueDate || new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0];
  const pledgeId = generateId('PLD', `${memberId}-${cycleIndex}`);

  store.run(
    `INSERT OR REPLACE INTO pledges (id, member_id, cycle_index, pledged, paid_ytd, status, due_date, method, last_payment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pledgeId, memberId, cycleIndex, pledged, 0, PLEDGE_STATUS.PENDING, due, null, null]
  );

  // NOTE: do NOT overwrite member.status/tier here — intake owns lifecycle
  // (founding stays founding; prospect -> active happens at welcome/payment).

  const row = store.get('SELECT * FROM pledges WHERE id = ?', [pledgeId]);
  return row;
}