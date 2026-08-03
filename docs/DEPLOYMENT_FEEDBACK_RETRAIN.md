# Production-like Deployment — Feedback & Retraining Flow

End-to-end path this guide proves:

```text
Viewer UI → AI intent → report wrong → PostgreSQL
→ admin approve → immutable export batch
→ GitHub Actions (weekly / workflow_dispatch)
→ backend claim combined candidate
→ ML worker import + pre-check
→ deferred/excluded: 0 Kaggle
→ eligible: Kaggle E3 (not required for smoke)
```

Registry, promotion, and pre-check thresholds are **unchanged**.

---

## 1. Minimal architecture (evidence-based)

| Component | Where | Public? | Notes |
|-----------|-------|---------|-------|
| **Frontend** | Railway Docker (`frontend/Dockerfile` production) | Yes | Static nginx, hash admin route `#/admin/intent-corrections` |
| **Backend FastAPI** | Railway Docker (`backend/Dockerfile`) | Yes | `/api/health`, feedback + export + internal ML retrain API |
| **PostgreSQL** | Railway Postgres **or** Supabase | Private | `DATABASE_URL` — required for feedback/export/retrain state |
| **Export artifacts** | Railway **Volume** on backend | Private | `DATASET_EXPORT_DIR=/data/dataset_exports` |
| **ML inference** | Hugging Face Space (recommended) | Yes (Space URL) | `ML_INTENT_API_URL` — optional; rules fallback if unset |
| **Retrain worker** | GitHub Actions (`smart-livestream-ml`) | N/A | Calls backend only; no local Postgres |
| **Kaggle E3** | Kaggle GPU | N/A | Only when combined pre-check **eligible** |

**Do not** run PhoBERT on Railway Trial (0.5 GB). **Do not** merge retrain scheduler into inference service.

### Startup order

1. PostgreSQL provisioned → run `alembic upgrade head` once
2. Backend + volume mount → set secrets → deploy
3. Frontend build with `VITE_API_BASE_URL` → deploy
4. Backend `CORS_ORIGINS` = frontend URL → redeploy
5. (Optional) HF Space → set `ML_INTENT_API_URL`
6. GitHub secrets on `smart-livestream-ml` → test `workflow_dispatch`

---

## 2. Blockers checklist

| Blocker | File / config | Fix | Can deploy without? |
|---------|---------------|-----|---------------------|
| No `DATABASE_URL` | `backend/app/settings.py`, feedback routes | Add Railway Postgres or Supabase URL | No — feedback broken |
| Ephemeral export disk | `dataset_export_repository.py`, default `dataset_exports/` | Railway Volume + `DATASET_EXPORT_DIR=/data/dataset_exports` | Artifacts lost on redeploy |
| Migrations not run | `backend/alembic/versions/0004`–`0008` | `backend/scripts/railway_migrate.sh` once | Worker API 503 / missing tables |
| No `ADMIN_API_KEY` | `admin_auth.py` | Generate secret in Railway | Admin review 503 |
| No `ML_RETRAIN_WORKER_API_KEY` | `ml_retrain_worker_auth.py` | Generate secret; match GitHub secret | Cron cannot claim |
| No GitHub secrets | `.github/workflows/periodic-feedback-retrain.yml` | Set `BACKEND_URL`, worker key, Kaggle creds | Cron cannot run |
| ML weights not in git | `smart-livestream-ml/artifacts/` gitignored | HF Space upload (`deploy/hf-space/deploy.ps1`) | Rules fallback only |
| No Railway/gh CLI locally | — | Dashboard deploy (see commands below) | Config still valid |

---

## 3. Railway backend — volume & migrations

### Volume (artifact persistence)

1. Backend service → **Volumes** → Add volume (e.g. 1 GB) → mount path `/data`
2. Variables:

```text
DATASET_EXPORT_DIR=/data/dataset_exports
```

3. Redeploy. Create export batch → redeploy again → download JSONL still works.

### Migrations (safe — not in web entrypoint)

`backend/docker-entrypoint.sh` starts uvicorn only — **no auto-migrate** (avoids replica race).

**One-time after Postgres is linked:**

```bash
# From repo root, with Railway CLI linked to backend service:
railway run --service backend sh backend/scripts/railway_migrate.sh
```

Or Railway dashboard → backend service → **Shell**:

```bash
cd backend && python -m alembic upgrade head
```

Confirm revisions through `0008_ml_retrain_candidate`.

---

## 4. Environment / secrets matrix (no values)

### Backend (Railway runtime)

| Variable | Required for feedback smoke | Purpose |
|----------|----------------------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL |
| `ADMIN_API_KEY` | Yes | Admin review + export |
| `ML_RETRAIN_WORKER_API_KEY` | Yes | Internal cron worker |
| `DATASET_EXPORT_DIR` | Yes (production) | Persistent export path |
| `ML_RETRAIN_STALE_CLAIM_MINUTES` | No | Default 120 |
| `ML_RETRAIN_MAX_CANDIDATE_BATCHES` | No | Default 50 |
| `CORS_ORIGINS` | Yes | Frontend HTTPS origin |
| `ML_INTENT_API_URL` | No | HF Space inference URL |
| `ML_INTENT_TIMEOUT_SECONDS` | No | Default 2 local / 60 HF |
| `CHAT_PERSISTENCE_MODE` | No | Default `memory` |
| `PORT` | Auto | Railway injects |

### Frontend (Railway build-time ✅)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_API_BASE_URL` | Yes | Backend HTTPS URL |
| `VITE_WS_BASE_URL` | Recommended | WSS chat |
| `VITE_SUPABASE_URL` | Optional | Auth |
| `VITE_SUPABASE_ANON_KEY` | Optional | Auth (public anon key) |

**Do not** set `VITE_ADMIN_API_KEY` in production build — admin key is entered manually on `#/admin/intent-corrections` (sessionStorage).

### ML inference (Hugging Face Space)

| Variable | Purpose |
|----------|---------|
| `HF_MODEL_REPO` | Hub repo baked at Docker build |
| Model files | ~515 MB `model.safetensors` via `snapshot_download` |

Active registry remains `phobert_base_combined_hardcases_v2` — HF deploy script may upload v3; align Space with v2 for demo consistency.

### GitHub Actions (`smart-livestream-ml` repo secrets)

| Secret | Purpose |
|--------|---------|
| `BACKEND_URL` | e.g. `https://YOUR-BACKEND.up.railway.app` |
| `ML_RETRAIN_WORKER_API_KEY` | Same as backend |
| `KAGGLE_USERNAME` | Kaggle API (only if eligible run) |
| `KAGGLE_KEY` | Kaggle API |

---

## 5. GitHub Actions cron

File: `smart-livestream-ml/.github/workflows/periodic-feedback-retrain.yml`

- Schedule: `0 19 * * 6` (Sun 02:00 ICT)
- Triggers: `schedule`, `workflow_dispatch`
- Concurrency: single worker group (no overlapping runs)
- Exit 0: `no_new_batch`, `deferred_waiting_for_more_feedback`, `excluded_nonproduction_data`, `completed`
- Exit 1: `runtime_error`, `kaggle_failed`, `failed`
- Uploads `run_result.json` artifact for audit

### Manual smoke (no Kaggle expected)

GitHub → `smart-livestream-ml` → Actions → **Periodic Feedback Retrain** → **Run workflow**.

With smoke-only or insufficient batch → expect exit **success** and status `excluded_nonproduction_data` or `deferred_waiting_for_more_feedback`.

---

## 6. Post-deploy smoke plan

### A — Health

```bash
curl -sS https://YOUR-FRONTEND/health.txt
curl -sS https://YOUR-BACKEND/api/health
curl -sS https://YOUR-BACKEND/api/nlp/health
```

### B — Feedback

1. Open demo UI, send chat comment.
2. Click “Báo AI nhận sai”, submit correction.
3. Open `https://YOUR-FRONTEND/#/admin/intent-corrections`, enter `ADMIN_API_KEY`.
4. Approve with `final_intent`.

### C — Export persistence

1. Admin → Create export batch → download JSONL + manifest, note SHA-256.
2. Redeploy backend.
3. Re-download — checksums unchanged.

### D — Remote cron

Run GitHub `workflow_dispatch`. Verify:

- Worker claimed candidate (or `no_new_batch`)
- Pre-check deferred/excluded → **0 Kaggle kernels**
- PostgreSQL: `ml_retrain_candidate_runs` / `consumption_state` updated

---

## 7. Exact deploy commands (Railway CLI)

Install: https://docs.railway.app/develop/cli

```bash
# Login & link project (interactive)
railway login
cd smart-livestream-poc
railway link

# Backend — set variables in dashboard first (DATABASE_URL, keys, volume path)
railway up --service backend

# Migrate once
railway run --service backend sh backend/scripts/railway_migrate.sh

# Frontend — set VITE_* with "Available at Build" in dashboard
railway up --service frontend
```

Without CLI: use Railway dashboard **Deploy from GitHub** + copy variables from `.env.railway.example`.

---

## 8. Registry confirmation

`smart-livestream-ml/config/model_registry.yaml`:

- `active_model_id: phobert_base_combined_hardcases_v2`
- No auto-promotion in worker API (`promotion_eligible` must be false)
