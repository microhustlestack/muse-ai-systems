import { createServer } from 'node:http';
import { createStore } from './db.js';
import { intakeMember } from './intake.js';
import { pledge } from './pledge.js';
import { charge, verifyStripeSignature } from './payment.js';
import { summarize } from './impact.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const store = createStore();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function handleIntake(req, res) {
  try {
    const body = await parseBody(req);
    const { name, email, tier, source, invitedBy } = body;
    
    if (!name || !email) {
      return sendError(res, 400, 'name and email required');
    }
    
    const member = intakeMember(store, { name, email, tier, source, invitedBy });
    sendJson(res, 201, member);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

async function handlePledge(req, res) {
  try {
    const body = await parseBody(req);
    const { memberId, cycleIndex, pledged, dueDate } = body;
    
    if (!memberId || cycleIndex === undefined || !pledged) {
      return sendError(res, 400, 'memberId, cycleIndex, pledged required');
    }
    
    const pledgeRecord = pledge(store, { memberId, cycleIndex, pledged, dueDate });
    sendJson(res, 201, pledgeRecord);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

async function handleWebhook(req, res) {
  try {
    const rawBody = await new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
    
    const sigHeader = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    
    try {
      verifyStripeSignature(rawBody, sigHeader, secret);
    } catch (err) {
      return sendError(res, 400, `Webhook signature verification failed: ${err.message}`);
    }
    
    const event = JSON.parse(rawBody);
    
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const pledgeId = intent.metadata?.pledgeId;
      const memberId = intent.metadata?.memberId;
      
      if (pledgeId && memberId) {
        await charge(store, {
          pledgeId,
          memberId,
          amountPaid: intent.amount_received || intent.amount,
          method: 'stripe',
          shouldFail: false
        });
      }
    }
    
    sendJson(res, 200, { received: true });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

function handleImpact(req, res) {
  try {
    const impact = summarize(store);
    sendJson(res, 200, impact);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (req.method === 'POST' && url.pathname === '/intake') {
    return handleIntake(req, res);
  }
  
  if (req.method === 'POST' && url.pathname === '/pledge') {
    return handlePledge(req, res);
  }
  
  if (req.method === 'POST' && url.pathname === '/webhook/stripe') {
    return handleWebhook(req, res);
  }
  
  if (req.method === 'GET' && url.pathname === '/impact') {
    return handleImpact(req, res);
  }
  
  sendError(res, 404, 'Not found');
});

server.listen(PORT, () => {
  console.log(`MUSE100 server listening on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /intake`);
  console.log(`  POST /pledge`);
  console.log(`  POST /webhook/stripe`);
  console.log(`  GET  /impact`);
  console.log(`\nEnv vars: PORT=${PORT}, DATABASE_PATH=${process.env.DATABASE_PATH || 'muse100.db'}`);
  console.log(`MOCK MODE: ${!process.env.STRIPE_WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED'}`);
});

process.on('SIGINT', () => {
  store.close();
  server.close(() => process.exit(0));
});