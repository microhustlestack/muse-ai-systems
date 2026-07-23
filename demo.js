import { createStore, seedFoundingCabinet, seedPledges, closeStore, STATUS, PLEDGE_STATUS } from './src/db.js';
import { charge } from './src/payment.js';
import { sendEmail, welcomeEmail, pledgeConfirmationEmail, paymentReceiptEmail } from './src/email.js';
import { summarize } from './src/impact.js';

async function main() {
  console.log('=== MUSE100 Demo: End-to-End Giving Circle ===\n');
  
  const store = createStore(':memory:');
  
  console.log('1. Seeding 100 members (10 Founding Cabinet + 90 members)...');
  const memberCount = seedFoundingCabinet(store, 100);
  console.log(`   Created ${memberCount} members\n`);
  
  console.log('2. Creating pledges for Cycle 1 ($1,000 each)...');
  const pledgeCount = seedPledges(store, 1);
  console.log(`   Created ${pledgeCount} pledges\n`);
  
  console.log('3. Simulating payments (5% mock lapse rate)...');
  const results = await processPayments(store, 0.05);
  console.log(`   Processed: ${results.successful} paid, ${results.failed} failed\n`);
  
  console.log('4. Sending emails (mock mode)...');
  await sendEmails(store);
  console.log('   Emails sent\n');
  
  console.log('5. Impact Summary:');
  const impact = summarize(store);
  console.log(`   Active Members:     ${impact.activeMembers}`);
  console.log(`   Total Pledged:     $${impact.totalPledged.toLocaleString()}`);
  console.log(`   Total Collected:   $${impact.collected.toLocaleString()}`);
  console.log(`   Outstanding:       $${impact.outstanding.toLocaleString()}`);
  console.log(`   Projected Annual:  $${impact.projectedAnnualImpact.toLocaleString()}`);
  
  console.log('\n=== VERIFICATION ===');
  const passed = verifyResults(impact);
  console.log(passed ? '\n✅ ALL CHECKS PASSED' : '\n❌ CHECKS FAILED');
  
  closeStore(store);
  process.exit(passed ? 0 : 1);
}

async function processPayments(store, failureRate) {
  const pledges = store.all("SELECT * FROM pledges WHERE status = ?", [PLEDGE_STATUS.PENDING]);
  let successful = 0;
  let failed = 0;
  
  for (const pledge of pledges) {
    const shouldFail = Math.random() < failureRate;
    
    try {
      await charge(store, {
        pledgeId: pledge.id,
        memberId: pledge.member_id,
        amountPaid: 1000,
        method: 'mock',
        shouldFail
      });
      successful++;
    } catch (err) {
      failed++;
    }
  }
  
  return { successful, failed };
}

async function sendEmails(store) {
  const members = store.all("SELECT * FROM members WHERE status IN (?, ?)", [STATUS.FOUNDING, STATUS.PROSPECT]);
  const pledges = store.all("SELECT * FROM pledges WHERE status IN (?, ?)", [PLEDGE_STATUS.PENDING, PLEDGE_STATUS.PAID]);
  const payments = store.all("SELECT * FROM payments WHERE status = 'succeeded'");
  
  for (const member of members) {
    const emailContent = welcomeEmail(member.name);
    await sendEmail({ to: member.email, subject: emailContent.subject, body: emailContent.body });
  }
  
  for (const pledge of pledges) {
    const member = store.get('SELECT * FROM members WHERE id = ?', [pledge.member_id]);
    if (member) {
      const emailContent = pledgeConfirmationEmail(member.name, pledge.pledged, pledge.due_date);
      await sendEmail({ to: member.email, subject: emailContent.subject, body: emailContent.body });
    }
  }
  
  for (const payment of payments) {
    const member = store.get('SELECT * FROM members WHERE id = ?', [payment.member_id]);
    if (member) {
      const emailContent = paymentReceiptEmail(member.name, payment.amount, payment.created_at.split('T')[0]);
      await sendEmail({ to: member.email, subject: emailContent.subject, body: emailContent.body });
    }
  }
}

function verifyResults(impact) {
  const checks = [
    { name: '100 active members', pass: impact.activeMembers === 100 },
    { name: '$100,000 total pledged', pass: impact.totalPledged === 100000 },
    { name: '~$95,000-$97,000 collected (5% lapse)', pass: impact.collected >= 95000 && impact.collected <= 97000 },
    { name: 'Outstanding = pledged - collected', pass: impact.outstanding === impact.totalPledged - impact.collected },
    { name: 'Projected annual = total pledged', pass: impact.projectedAnnualImpact === impact.totalPledged }
  ];
  
  let allPassed = true;
  for (const check of checks) {
    const status = check.pass ? '✅' : '❌';
    console.log(`   ${status} ${check.name}`);
    if (!check.pass) allPassed = false;
  }
  
  return allPassed;
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});