# GitLab × Google Chat — Architecture Gaps

## Current State

The project currently provides:

- Express backend for webhook ingestion, Chat callback handling, auth, and department management
- React frontend for department configuration and operations
- Dual storage support:
  - SQLite for local development
  - MongoDB for Vercel production
- Platform support for:
  - GitLab merge request notifications and actions
  - GitHub pull request notifications and actions

This is enough for end-to-end testing, but several parts are still incomplete or operationally weak.

## High-Priority Gaps

### 1. Google Chat integration model is split

Current implementation:

- Notifications are sent via Google Chat Incoming Webhook
- Interactive actions are handled by `/chat-callback`

What is missing:

- A single, explicit Google Chat App delivery model
- Service account / Chat API based message sending
- Consistent ownership model for interactive cards

Why this matters:

- Incoming Webhook is fine for plain notifications, but it is weaker for interactive workflows
- The Python version already demonstrated a more complete Chat API path
- Future features like updating cards, stronger identity, and richer interaction will be easier with a proper Chat App model

Recommended direction:

- Add a first-class Google Chat App sender
- Use Chat API for interactive cards
- Keep Incoming Webhook only as a fallback or for simple notifications

### 2. Webhook observability is incomplete

Current implementation:

- Runtime logs now show `ignored`, `unauthorized`, `filtered`, and some send failures
- `webhook_logs` persists send status data

What is missing:

- Structured persistence for webhook rejection reasons
- Correlation between incoming webhook request, payload type, platform routing, and Chat delivery outcome
- An admin-facing diagnostic view for failed / ignored webhook requests

Why this matters:

- Debugging currently depends too much on Vercel runtime logs
- Runtime logs are useful, but not a durable operational record
- Support overhead grows as more departments and platforms are added

Recommended direction:

- Extend `webhook_logs` with normalized outcome fields such as:
  - `rejection_reason`
  - `platform`
  - `delivery_id`
  - `source_repo`
  - `source_event`
- Surface these states in the admin UI

### 3. Automated test coverage is too thin

Current implementation:

- Utility tests exist for card building helpers, crypto, hash, and random helpers

What is missing:

- Route-level tests for:
  - `/webhook`
  - `/chat-callback`
  - `/api/departments`
- Repository tests for both SQLite and Mongo implementations
- Signature verification tests for:
  - GitLab token validation
  - GitHub `X-Hub-Signature-256`
- Regression tests for form-urlencoded GitHub payloads

Why this matters:

- The highest-risk logic is in routing, signature validation, and external API integration
- Recent fixes were in webhook parsing, schema migration, CORS, and environment wiring, none of which are currently protected by tests

Recommended direction:

- Add integration tests around webhook ingestion first
- Then add callback tests and repository compatibility tests

### 4. Frontend deployment model is still duplicated

Current implementation:

- Backend project also serves built frontend assets
- A separate Vercel frontend project also exists

What is missing:

- One canonical deployment model
- Clear environment ownership for `FRONTEND_URL` and `VITE_API_URL`

Why this matters:

- It creates confusion about which frontend is the source of truth
- It introduces avoidable CORS, cache, and version mismatch problems
- Production debugging becomes harder because UI and API may not be on the same release boundary

Recommended direction:

Choose one model:

1. Single-project deployment
   - Backend serves frontend
   - Same origin for UI and API
   - Simpler runtime behavior

2. Split frontend/backend deployment
   - Separate frontend on Vercel
   - Separate backend on Vercel
   - Clear env management and explicit CORS

Do not keep both as active production paths long-term.

## Medium-Priority Gaps

### 5. Authorization model is coarse

Current implementation:

- User auth exists for admin/editor/viewer
- Department actions use department-level tokens

What is missing:

- Per-user authorization for Chat button actions
- Clear audit mapping from actor to external action
- Fine-grained restrictions by department and action type

Why this matters:

- Today, a button click executes using the department token, not the end user's platform identity
- Operational accountability is weaker than it appears in the UI

Recommended direction:

- Keep department token mode for now
- Add explicit audit logging of:
  - Chat actor
  - Department
  - Action
  - Target MR/PR
  - External API response

### 6. Schema evolution is still manual in parts

Current implementation:

- SQLite now has startup migration support for GitHub columns
- Mongo uses Mongoose schema defaults

What is missing:

- Versioned schema migration strategy across both storage modes
- Repeatable production-safe migration process

Why this matters:

- Future schema changes will keep reintroducing drift between local and production
- Silent defaults in Mongo are not a substitute for explicit migrations

Recommended direction:

- Introduce schema version tracking
- Create repeatable migrations for both SQLite and Mongo paths

### 7. External integration validation is limited

Current implementation:

- Department test action validates Chat webhook connectivity

What is missing:

- Validation of GitHub repo match and token permissions
- Validation of GitLab token scope and project access
- Validation of Chat callback configuration and JWT audience wiring

Why this matters:

- Many misconfigurations are only detected after a real webhook arrives

Recommended direction:

- Add a configuration validation endpoint and UI action
- Run targeted external checks during setup

## Lower-Priority Gaps

### 8. Retry and queueing are minimal

Current implementation:

- Notification sending retries in-process

What is missing:

- Durable retry queue
- Dead-letter handling
- Backoff visibility

Why this matters:

- Serverless retries are fragile for transient downstream failures
- Message delivery reliability will degrade under scale or provider instability

### 9. Metrics and reporting are absent

Current implementation:

- Basic event logs exist

What is missing:

- Delivery success rate
- Per-department activity
- Failure trend reporting
- Review workflow metrics

### 10. Secret lifecycle management is absent

Current implementation:

- Sensitive values are encrypted at rest

What is missing:

- Secret rotation flow
- Re-encryption flow for `ENCRYPTION_KEY`
- Webhook secret rotation UX

## Recommended Execution Order

### Phase 1: Stabilize runtime behavior

1. Add webhook integration tests
2. Persist structured webhook rejection reasons
3. Choose one production frontend deployment model

### Phase 2: Improve operator reliability

1. Add setup validation for GitHub/GitLab/Chat configuration
2. Add action audit logs for Chat button operations
3. Add admin diagnostics for failed / ignored events

### Phase 3: Strengthen architecture

1. Add Google Chat App / Chat API sender path
2. Introduce durable retry queue
3. Add schema versioning and repeatable migrations

## Immediate Next Recommendation

If only one thing is done next, it should be:

- Add route-level integration tests for `/webhook` and `/chat-callback`

Reason:

- Most recent defects were not algorithmic defects in helper code
- They were integration defects across payload format, routing, environment, schema, and platform branching
- Those are exactly the defects integration tests should catch
