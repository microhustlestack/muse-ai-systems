export async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.EMAIL_API_KEY;
  const provider = process.env.EMAIL_PROVIDER || 'mock';
  
  const personalizedBody = body.replace(/\{\{name\}\}/g, to.split('@')[0]);
  
  if (apiKey) {
    console.log(`[EMAIL:${provider}] Would send via ${provider} (API key present):`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${personalizedBody.substring(0, 100)}...`);
    return { status: 'sent', provider, to, subject, mocked: true };
  }
  
  console.log('[EMAIL:mock] Mock email sent:');
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body: ${personalizedBody}`);
  return { status: 'mocked', to, subject, body: personalizedBody };
}

export function welcomeEmail(name) {
  return {
    subject: 'Welcome to MUSE100!',
    body: `Hi {{name}},\n\nWelcome to MUSE100! You're now part of a giving circle of 100 members committing $1,000/year to create $100,000 in annual impact.\n\nYour pledge for Year 1: $1,000 due by Dec 31.\n\nWelcome aboard!\nThe MUSE100 Team`
  };
}

export function pledgeConfirmationEmail(name, amount, dueDate) {
  return {
    subject: 'MUSE100 Pledge Confirmed',
    body: `Hi {{name}},\n\nYour pledge of $${amount} for the current cycle has been confirmed. Due date: ${dueDate}.\n\nThank you for your commitment!\nThe MUSE100 Team`
  };
}

export function paymentReceiptEmail(name, amount, date) {
  return {
    subject: 'MUSE100 Payment Receipt',
    body: `Hi {{name}},\n\nThank you for your payment of $${amount} received on ${date}.\n\nYour generosity drives real impact.\nThe MUSE100 Team`
  };
}

export function overdueReminderEmail(name, amount, dueDate) {
  return {
    subject: 'MUSE100: Pledge Reminder',
    body: `Hi {{name}},\n\nThis is a friendly reminder that your pledge of $${amount} was due on ${dueDate}.\n\nPlease complete your contribution to keep the circle strong.\nThe MUSE100 Team`
  };
}

export function impactReportEmail(name, impactSummary) {
  return {
    subject: 'MUSE100 Quarterly Impact Report',
    body: `Hi {{name}},\n\n${impactSummary}\n\nThank you for making this possible!\nThe MUSE100 Team`
  };
}