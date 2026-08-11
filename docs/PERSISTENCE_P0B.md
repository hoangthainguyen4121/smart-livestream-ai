# Persistence foundation (P0b) + Hybrid policy (P0c)

## Modes

| `CHAT_PERSISTENCE_MODE` | Behavior |
| --- | --- |
| `memory` (default) | Validate → in-memory ring buffer → broadcast. No DB. |
| `short_retention` | Validate → resolve active session → persist → broadcast. Requires `DATABASE_URL`. |

If `CHAT_PERSISTENCE_MODE=short_retention` without `DATABASE_URL`, backend **fails startup**.

## Scope

- Supabase Postgres via backend `DATABASE_URL` (short_retention only)
- SQLModel + Alembic migrations
- Tables: `profiles`, `livestream_sessions`, `comments`
- Session APIs and comment history API (short_retention only)
- WebSocket comments persist before broadcast only in `short_retention` mode

## Data taxonomy

```text
ephemeral_realtime_comment
→ memory only (ChatManager ring buffer, max 50)
→ never training data

persisted_chat_comment
→ optional short-retention ops log (`comments` table)
→ never automatically training data

reported_comment_snapshot
→ future phase (M1)
→ long-term review data

model_correction_feedback
→ future phase (M3)
→ prediction + model metadata + proposed label

dataset_candidate
→ only after admin approval

immutable_dataset_sample
→ only input allowed for retraining
```

> **Rows in `comments` are not eligible for training** unless a later explicit review/export workflow creates an approved dataset candidate.

The `comments` table must not be used for global spam scanning or automatic ML export.

## Retention policy (P0c boundary)

- `CHAT_RETENTION_HOURS` default: `24` (allowed range: 1–168)
- Logged at startup in `short_retention` mode
- **Deletion scheduler not implemented in P0c** — policy only

## Migrations

From `backend/`:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://..."
alembic upgrade head
```

Revision chain:

1. `0001_profiles`
2. `0002_livestream_sessions`
3. `0003_comments`

## Session flow (short_retention)

1. `POST /api/sessions/start` `{ "room_id": "demo" }`
2. WebSocket comments require an active session
3. `POST /api/sessions/{id}/end`
4. `GET /api/sessions/{room_id}/current`

In `memory` mode, session/history APIs return `503` with code `durable_chat_history_disabled`.

## Comment history (short_retention)

`GET /api/comments?room_id=demo&limit=50&before=<iso>|<comment_id>`

Ordering: `created_at DESC, id DESC`.

## Health

`GET /api/health` returns:

```json
{
  "status": "ok",
  "chat_persistence_mode": "memory",
  "durable_chat_history": false,
  "chat_retention_hours": 24,
  "chat_retention_deletion_job": "not_implemented"
}
```

## Tests

Memory mode (no DB):

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:CHAT_PERSISTENCE_MODE = "memory"
python -m pytest backend/tests -q
```

PostgreSQL integration:

```powershell
# Demo/runtime DB (optional during pytest; never use as TEST_DATABASE_URL)
$env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_local"
# Pytest destructive fixtures require a separate DB whose name contains "test"
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/smart_livestream_test"
python -m pytest backend/tests/test_persistence_p0b.py backend/tests/test_persistence_p0c.py -q
```

Do not point `TEST_DATABASE_URL` at `smart_livestream_local` or production Supabase.
Fixtures refuse when `TEST_DATABASE_URL` matches runtime `DATABASE_URL` or the DB name lacks `test`.

## F1 — AI misclassification capture

- Table: `intent_correction_samples` (migration `0004`)
- Endpoint: `POST /api/intent-corrections`
- Works with `CHAT_PERSISTENCE_MODE=memory` when `DATABASE_URL` is set for feedback storage only
- Rows are **pending review samples**, not training data
- Does not require rows in `comments`

> Pending intent correction samples are not eligible for training until a later explicit admin review/export workflow.

## Admin review (F1 follow-up slice)

- Migration: `0005_intent_correction_review`
- Endpoints (require `X-Admin-Api-Key` matching `ADMIN_API_KEY`):
  - `GET /api/admin/intent-corrections?status=pending&limit=50&cursor=...`
  - `POST /api/admin/intent-corrections/{id}/review`
- Frontend admin page: `#/admin/intent-corrections`
- Guard is config-based MVP only — not Supabase JWT/RBAC

## Immutable approved-correction export

- Migration: `0006_dataset_export_batches`
- Tables: `dataset_export_batches`, `dataset_export_batch_items`
- Endpoints (admin guard):
  - `GET /api/admin/dataset-export-batches/ready-count`
  - `POST /api/admin/dataset-export-batches`
  - `GET /api/admin/dataset-export-batches`
  - `GET /api/admin/dataset-export-batches/{id}`
  - `GET /api/admin/dataset-export-batches/{id}/download`
  - `GET /api/admin/dataset-export-batches/{id}/manifest`
- Artifacts on disk under `DATASET_EXPORT_DIR` (default `dataset_exports`)
- Failed batch deletes reserved items so samples can be retried
