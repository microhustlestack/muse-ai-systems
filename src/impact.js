export function summarize(store) {
  const membersWithPledges = store.all(`
    SELECT DISTINCT m.* FROM members m
    JOIN pledges p ON p.member_id = m.id
    WHERE p.status IN ('paid', 'pending')
  `);
  const activeMembers = membersWithPledges.length;
  
  const pledges = store.all("SELECT * FROM pledges WHERE status IN ('paid', 'pending')");
  const totalPledged = pledges.reduce((sum, p) => sum + p.pledged, 0);
  
  const payments = store.all("SELECT * FROM payments WHERE status = 'succeeded'");
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  
  const outstanding = totalPledged - totalPaid;
  const projectedAnnualImpact = totalPledged;
  
  return {
    activeMembers,
    totalPledged,
    totalPaid,
    collected: totalPaid,
    outstanding,
    projectedAnnualImpact
  };
}