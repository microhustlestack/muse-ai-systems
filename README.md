# MUSE100 Giving Circle Automation

Production-ready, dependency-free (Node 22 stdlib only) giving-circle automation for MUSE100: 100 members × $1,000/year = $100,000 pooled annually.

## Quick Start

```bash
# Run the demo (in-memory SQLite, mock payments, mock emails)
npm run demo
# or: node demo.js

# Run tests
npm test
# or: node test.js

# Start the HTTP server
npm run server
# or: node src/server.js
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Intake    │────▶│   Pledge    │────▶│  Payment    │
│  (POST/intake)  │  (POST/pledge) │  (mock/Stripe)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Impact    │
                    │ (GET/impact)│
                    └─────────────┘
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_PATH` | No | `./muse100.db` | SQLite database file (`:memory:` for demo) |
| `CYCLES` | No | `1` | Number of annual cycles |
| `STRIPE_WEBHOOK_SECRET` | No | (unset) | Enables real Stripe signature verification |
| `EMAIL_API_KEY` | No | (unset) | Enables real email provider (logs intent only) |
| `EMAIL_PROVIDER` | No | `mock` | Email provider name for logging |
| `MOCK_FAILURE_RATE` | No | `0` | Payment failure rate (0-1) for testing |

## MOCK Mode (Default)

When `STRIPE_WEBHOOK_SECRET` and `EMAIL_API_KEY` are **unset**:
- Stripe webhook signature verification is a no-op
- Payments succeed unless `MOCK_FAILURE_RATE` or `shouldFail` is set
- Emails are logged to console with personalization

This allows **zero-secrets** end-to-end testing.

## Promotion Path (MOCK → Live)

1. **Stripe**: Set `STRIPE_WEBHOOK_SECRET` from Stripe Dashboard → Webhooks → Signing Secret
2. **Email**: Set `EMAIL_API_KEY` and `EMAIL_PROVIDER` (e.g., `sendgrid`, `resend`, `postmark`)
3. **Database**: Set `DATABASE_PATH` to a persistent file (default `muse100.db`)
4. **Deploy**: Run `node src/server.js` behind a reverse proxy (nginx, Caddy)

The same codebase runs both modes—no code changes needed.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/intake` | Add member: `{name, email, tier?, source?, invitedBy?}` |
| `POST` | `/pledge` | Create pledge: `{memberId, cycleIndex, pledged, dueDate?}` |
| `POST` | `/webhook/stripe` | Stripe webhook (requires signature) |
| `GET` | `/impact` | Impact summary JSON |

## Data Model

| **Members** (`members` table) |
| `id`: `M100-001` format |
| `status`: `prospect` \| `founding` \| `active` \| `lapsed` |
| `tier`: `Founding Cabinet` \| `Member` |
| `source`: recruitment tag (e.g. `cabinet`, `referral`, `direct`) |
| `join_date`: `YYYY-MM-DD` |

**Pledges** (`pledges` table)
| `id`: `PLD-M100-001-0` (`PLD-` + memberId + `-` + cycleIndex) |
| `status`: `pending` \| `paid` \| `overdue` \| `waived` |
| `cycle_index`: 0-based annual cycle number (0 = first year) |
| `pledged` / `paid_ytd`: USD integers |

**Payments** (`payments` table)
| Links to pledge + member |
| `status`: `pending` \| `succeeded` \| `failed` |

## Single-Cycle Model

- `CYCLES=1` (one annual raise per year)
- Pledge amount constant: **$1,000**
- Cycle timeline: Aug launch → Dec 31 target → Jan deployment → Quarterly reports

## Impact Metrics

GET `/impact` returns:
```json
{
  "activeMembers": 100,
  "totalPledged": 100000,
  "totalPaid": 96000,
  "collected": 96000,
  "outstanding": 4000,
  "projectedAnnualImpact": 100000
}
```

## Testing

```bash
node test.js
```

Tests verify:
- Schema fields present
- Pledge → payment updates tracker
- Impact math: 100k pledged / 95k collected (5% fail)
- Stripe signature verification (valid, missing, invalid)
- Email personalization

## Orchestration (n8n)

A ready-to-import workflow is provided: `muse100-loop.workflow.json`.
It wires: `Webhook: New Prospect` → `POST /intake` → `POST /pledge`, plus a
`Daily: Impact Snapshot` → `GET /impact` → log.

**Import note:** n8n's REST import requires an owner API key
(`X-N8N-API-KEY` header). This build ran n8n with owner setup disabled,
so the workflow was **validated by exercising the same HTTP endpoints the
workflow calls** (verified end-to-end against `src/server.js`), not auto-imported.
To import: enable an n8n owner account, generate an API key, then
`POST /api/v1/workflows` with the JSON, or paste it via Settings → Workflows.

## No PII / Generic Pattern

This codebase contains **no real PII**. All data is synthetic
(`M100-001`, `member1@muse100.org`, etc.). The pattern is generic and reusable
for any giving circle. Keep real member data in the private vault, not this repo.

## License

MIT