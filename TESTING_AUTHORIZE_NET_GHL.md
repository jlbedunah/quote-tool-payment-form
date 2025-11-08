# Authorize.net → GoHighLevel Automation Test Plan

## Prerequisites
- `.env.local` populated with Authorize.net sandbox credentials and GoHighLevel API settings (`GHL_*`).
- Local tunnel (e.g., `ngrok`) exposing `localhost:3000` if testing sandbox webhooks directly from Authorize.net.
- `vercel dev` or production deployment running the webhook endpoint at `/api/webhook-handler`.

## Happy Path (Sandbox)
1. Trigger a sandbox payment through the quote tool or directly via `api/process-payment-server`.
2. Capture the Authorize.net webhook payload from the sandbox debug console or via the local tunnel request log.
3. Verify server logs include `synchronizationResult.contactId` and no warnings about missing configuration.
- In GoHighLevel:
   - Confirm the contact exists/was updated with the expected email.
   - Open the contact record and ensure the note contains transaction details and raw payload JSON.
   - Confirm new tag(s) corresponding to product names were applied (these trigger downstream workflows).
   - Verify any HighLevel automations tied to those tags (e.g., move opportunity to Won stage, update custom fields) completed successfully.

## Replay Test (Local)
- Save the webhook payload to `fixtures/authorize-net-authcapture.json`.
- Run:
  ```bash
  curl -X POST http://localhost:3000/api/webhook-handler \
       -H "Content-Type: application/json" \
       -d @fixtures/authorize-net-authcapture.json
  ```
- Confirm the handler responds with `success: true` and updates GoHighLevel as above.

## Failure Scenarios
- **Missing Email:** Modify the payload to remove `payload.customer.email` and re-run. Expect log warning and `skipped: true` response while returning HTTP 200.
- **Workflow Checks:** Disable the tag-based workflow temporarily and repeat the replay—contact should still receive note/tag, but pipeline/custom field behavior should stop, confirming the responsibilities are separated.

## Regression Checklist
- One-time and subscription items in the payload produce unique tags without duplicates.
- Currency formatting matches GoHighLevel expectations (USD).
- Opportunities reuse existing records for repeat buyers (search by contact ID).
- `env.example` remains up to date with required variables.
