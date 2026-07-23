import { createStore, seedFoundingCabinet, seedPledges, STATUS, PLEDGE_STATUS } from './src/db.js';
import { charge } from './src/payment.js';
import { verifyStripeSignature } from './src/payment.js';
import { summarize } from './src/impact.js';
import { sendEmail } from './src/email.js';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✅ ${message}`);
}

async function runTests() {
  console.log('Running MUSE100 tests...\n');
  
  await testSchema();
  console.log('✅ Schema tests passed');
  
  await testPledgePaymentFlow();
  console.log('✅ Pledge->Payment flow tests passed');
  
  await testImpactMath();
  console.log('✅ Impact math tests passed');
  
  await testStripeVerify();
  console.log('✅ Stripe signature verification tests passed');
  
  await testEmailMock();
  console.log('✅ Email mock tests passed');
  
  console.log('\n🎉 ALL TESTS PASSED');
}

async function testSchema() {
  const store = createStore(':memory:');
  
  const memberCols = store.all("PRAGMA table_info(members)").map(c => c.name);
  assert(memberCols.includes('id'), 'members.id exists');
  assert(memberCols.includes('name'), 'members.name exists');
  assert(memberCols.includes('email'), 'members.email exists');
  assert(memberCols.includes('status'), 'members.status exists');
  assert(memberCols.includes('tier'), 'members.tier exists');
  assert(memberCols.includes('source'), 'members.source exists');
  assert(memberCols.includes('join_date'), 'members.join_date exists');
  assert(memberCols.includes('welcomed_at'), 'members.welcomed_at exists');
  
  const pledgeCols = store.all("PRAGMA table_info(pledges)").map(c => c.name);
  assert(pledgeCols.includes('id'), 'pledges.id exists');
  assert(pledgeCols.includes('member_id'), 'pledges.member_id exists');
  assert(pledgeCols.includes('cycle_index'), 'pledges.cycle_index exists');
  assert(pledgeCols.includes('pledged'), 'pledges.pledged exists');
  assert(pledgeCols.includes('paid_ytd'), 'pledges.paid_ytd exists');
  assert(pledgeCols.includes('status'), 'pledges.status exists');
  assert(pledgeCols.includes('due_date'), 'pledges.due_date exists');
  assert(pledgeCols.includes('method'), 'pledges.method exists');
  assert(pledgeCols.includes('last_payment'), 'pledges.last_payment exists');
  
  const paymentCols = store.all("PRAGMA table_info(payments)").map(c => c.name);
  assert(paymentCols.includes('id'), 'payments.id exists');
  assert(paymentCols.includes('pledge_id'), 'payments.pledge_id exists');
  assert(paymentCols.includes('member_id'), 'payments.member_id exists');
  assert(paymentCols.includes('amount'), 'payments.amount exists');
  assert(paymentCols.includes('status'), 'payments.status exists');
  
  store.close();
}

async function testPledgePaymentFlow() {
  const store = createStore(':memory:');
  const now = new Date().toISOString();
  
  store.run(
    `INSERT INTO members (id, name, email, status, tier, source, join_date, welcomed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['M100-001', 'Test Member', 'test@muse100.org', STATUS.PROSPECT, 'standard', 'test', now.split('T')[0], null]
  );
  
  store.run(
    `INSERT INTO pledges (id, member_id, cycle_index, pledged, paid_ytd, status, due_date, method, last_payment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['PLD-M100-001-1', 'M100-001', 1, 1000, 0, PLEDGE_STATUS.PENDING, '2024-12-31', null, null]
  );
  
  const payment = await charge(store, {
    pledgeId: 'PLD-M100-001-1',
    memberId: 'M100-001',
    amountPaid: 1000,
    method: 'mock',
    shouldFail: false
  });
  
  assert(payment.status === 'paid', 'Payment updates pledge status to paid');
  
  const pledge = store.get('SELECT * FROM pledges WHERE id = ?', ['PLD-M100-001-1']);
  assert(pledge.status === PLEDGE_STATUS.PAID, 'Pledge status updated to paid');
  assert(pledge.last_payment !== null, 'Pledge last_payment set');
  assert(pledge.paid_ytd === 1000, 'Pledge paid_ytd updated to 1000');
  
  const paymentRecord = store.get('SELECT * FROM payments WHERE pledge_id = ?', ['PLD-M100-001-1']);
  assert(paymentRecord !== undefined, 'Payment record created');
  assert(paymentRecord.status === 'succeeded', 'Payment status succeeded');
  assert(paymentRecord.amount === 1000, 'Payment amount 1000');
  
  store.close();
}

async function testImpactMath() {
  const store = createStore(':memory:');
  const now = new Date().toISOString();
  
  for (let i = 1; i <= 100; i++) {
    const id = `M100-${String(i).padStart(3, '0')}`;
    const isCabinet = i <= 10;
    store.run(
      `INSERT INTO members (id, name, email, status, tier, source, join_date, welcomed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, `Member ${id}`, `m${i}@test.org`, isCabinet ? STATUS.FOUNDING : STATUS.PROSPECT, 'standard', 'test', now.split('T')[0], isCabinet ? now.split('T')[0] : null]
    );
  }
  
  for (let i = 1; i <= 100; i++) {
    const id = `M100-${String(i).padStart(3, '0')}`;
    store.run(
      `INSERT INTO pledges (id, member_id, cycle_index, pledged, paid_ytd, status, due_date, method, last_payment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`PLD-${id}-1`, id, 1, 1000, i <= 95 ? 1000 : 0, i <= 95 ? PLEDGE_STATUS.PAID : PLEDGE_STATUS.PENDING, '2024-12-31', i <= 95 ? 'mock' : null, i <= 95 ? now : null]
    );
  }
  
  for (let i = 1; i <= 95; i++) {
    const id = `M100-${String(i).padStart(3, '0')}`;
    store.run(
      `INSERT INTO payments (id, pledge_id, member_id, amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`PAY-${id}-1`, `PLD-${id}-1`, id, 1000, 'succeeded', now]
    );
  }
  
  const impact = summarize(store);
  
  assert(impact.activeMembers === 100, `Active members = 100, got ${impact.activeMembers}`);
  assert(impact.totalPledged === 100000, `Total pledged = 100000, got ${impact.totalPledged}`);
  assert(impact.collected === 95000, `Collected = 95000 (5% fail), got ${impact.collected}`);
  assert(impact.outstanding === 5000, `Outstanding = 5000, got ${impact.outstanding}`);
  assert(impact.projectedAnnualImpact === 100000, `Projected annual = 100000, got ${impact.projectedAnnualImpact}`);
  
  store.close();
}

async function testStripeVerify() {
  const secret = 'whsec_test_secret';
  const payload = '{"id":"evt_test","type":"payment_intent.succeeded"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const crypto = await import('node:crypto');
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const sigHeader = `t=${timestamp},v1=${signature}`;
  
  assert(verifyStripeSignature(payload, sigHeader, secret) === true, 'Valid signature passes');
  
  assert(verifyStripeSignature(payload, sigHeader, null) === true, 'No secret = mock mode passes');
  
  try {
    verifyStripeSignature(payload, 't=123,v1=invalid', secret);
    assert(false, 'Should throw on invalid signature');
  } catch (e) {
    assert(e.message.includes('Invalid Stripe signature'), 'Throws on invalid signature');
  }
  
  try {
    verifyStripeSignature(payload, 't=123', secret);
    assert(false, 'Should throw on malformed header');
  } catch (e) {
    assert(e.message.includes('Invalid Stripe signature') || e.message.includes('Invalid Stripe-Signature header'), 'Throws on malformed header');
  }
}

async function testEmailMock() {
  const result = await sendEmail({
    to: 'test@muse100.org',
    subject: 'Test',
    body: 'Hello {{name}}!'
  });
  
  assert(result.status === 'mocked', 'Mock email returns mocked status');
  assert(result.body.includes('test'), 'Name personalized in body');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});