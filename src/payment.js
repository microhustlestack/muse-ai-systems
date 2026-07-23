import { generateId, PLEDGE_STATUS } from './db.js';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

let paymentCounter = 0;

function generatePaymentId() {
  return `PAY-${Date.now()}-${++paymentCounter}`;
}

export async function charge(store, { pledgeId, memberId, amountPaid, method = 'mock', shouldFail = false }) {
  const pledge = store.get('SELECT * FROM pledges WHERE id = ?', [pledgeId]);
  if (!pledge) throw new Error(`Pledge ${pledgeId} not found`);
  if (pledge.member_id !== memberId) throw new Error('Pledge member mismatch');
  
  const shouldFailMock = shouldFail || (process.env.MOCK_FAILURE_RATE && Math.random() < parseFloat(process.env.MOCK_FAILURE_RATE));
  
  if (shouldFailMock) {
    throw new Error('Mock payment failure (MOCK_FAILURE_RATE)');
  }
  
  const now = new Date().toISOString();
  const newPaidYtd = pledge.paid_ytd + amountPaid;
  const newStatus = newPaidYtd >= pledge.pledged ? PLEDGE_STATUS.PAID : PLEDGE_STATUS.PENDING;
  
  store.run(
    `UPDATE pledges SET paid_ytd = ?, status = ?, last_payment = ?, method = ? WHERE id = ?`,
    [newPaidYtd, newStatus, now, method, pledgeId]
  );
  
  const paymentId = generatePaymentId();
  store.run(
    `INSERT INTO payments (id, pledge_id, member_id, amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [paymentId, pledgeId, memberId, amountPaid, 'succeeded', now]
  );
  
  return {
    pledgeId,
    memberId,
    amountPaid,
    paidYtd: newPaidYtd,
    status: newStatus,
    lastPayment: now,
    method
  };
}

export function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!secret) {
    console.log('[STRIPE] MOCK MODE - signature verification skipped (no STRIPE_WEBHOOK_SECRET)');
    return true;
  }
  
  if (!sigHeader) {
    throw new Error('Missing Stripe-Signature header');
  }
  
  const elements = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  const timestamp = elements.t;
  const signature = elements.v1;
  
  if (!timestamp || !signature) {
    throw new Error('Invalid Stripe-Signature header');
  }
  
  const payload = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');
  
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSig, 'hex');
  
  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error('Invalid Stripe signature');
  }
  
  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    throw new Error('Stripe signature timestamp outside tolerance');
  }
  
  return true;
}