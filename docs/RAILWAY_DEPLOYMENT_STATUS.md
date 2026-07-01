# Railway Deployment Status

> **Template** — điền sau khi deploy trên Railway dashboard.  
> Không commit URL thật nếu repo public (hoặc redact trước khi push).

**Deploy date:** YYYY-MM-DD  
**Railway project:** `________________`  
**Git branch deployed:** `main`  
**Deployed by:** `________________`

---

## URLs

| Service | Public URL | Status |
|---------|------------|--------|
| **Frontend** | `https://________________.up.railway.app` | ☐ Live |
| **Backend** | `https://________________.up.railway.app` | ☐ Live |
| **ML (optional)** | *(not deployed / URL)* | ☐ N/A |

---

## Health checks

| Endpoint | Expected | Result | Pass? |
|----------|----------|--------|-------|
| Backend health | `GET /api/health` → `{"status":"ok"}` | | ☐ |
| NLP proxy | `GET /api/nlp/health` → `ml_service_status: "unavailable"` | | ☐ |
| Frontend static | `GET /health.txt` → `ok` | | ☐ |

**Backend health URL (full):**

```text
https://________________.up.railway.app/api/health
```

**Curl output (paste):**

```json

```

---

## Environment variables set

### Backend (runtime)

| Variable | Value set? | Notes |
|----------|------------|-------|
| `CORS_ORIGINS` | ☐ | Frontend HTTPS URL |
| `ML_INTENT_API_URL` | ☐ unset | Rules fallback |
| `ML_INTENT_TIMEOUT_SECONDS` | ☐ | Default `2` |

### Frontend (build-time, Available at Build ✅)

| Variable | Value set? | Notes |
|----------|------------|-------|
| `VITE_API_BASE_URL` | ☐ | Backend HTTPS URL |
| `VITE_WS_BASE_URL` | ☐ | `wss://` backend URL |

---

## WebSocket test

| Check | Result | Pass? |
|-------|--------|-------|
| Chat panel shows `connected` | | ☐ |
| DevTools → WS → `wss://.../ws/chat/demo` | | ☐ |
| Send message → appears in chat | | ☐ |

**Screenshot:** `screenshots/railway-ws-chat-connected.png` *(path local)*

---

## Functional demo test

| Feature | Works? | Notes |
|---------|--------|-------|
| Browser AR Start Stream (HTTPS camera) | ☐ | |
| Chat WebSocket | ☐ | |
| Sales Assistant (rules fallback) | ☐ | Comment: `giá bao nhiêu` |
| Product context resolver | ☐ | Mark camera product + deictic comment `cái này bao nhiêu` |
| AI Event Feed | ☐ | |
| Face registration `/register-face` | ☐ | **Optional / local only** — high RAM; best-effort on Railway |
| PhoBERT badge (if ML deployed) | ☐ N/A | |

---

## Known limitations observed

- [ ] Cold start delay after idle: `____` seconds
- [ ] Face registration is **local/high-memory optional** — cloud demo focuses on AR, chat, sales assistant, cart/checkout
- [ ] Product context resolver is lightweight (text + pinned/camera context) and suitable for Railway
- [ ] Face embeddings lost after redeploy (expected on free tier)
- [ ] ML not deployed — rules fallback only
- [ ] Future work: visual product recognition from camera frames (lightweight object detection / visual embeddings)
- [ ] Other: `________________`

---

## Screenshots for Thesis Ch.4

Capture and store locally (see [`THESIS_P0_SCREENSHOTS.md`](THESIS_P0_SCREENSHOTS.md)):

| ID | Description | File | Done? |
|----|-------------|------|-------|
| **EXP-RWY-01** | Railway project dashboard (2 services) | | ☐ |
| **EXP-RWY-02** | Backend deploy logs — healthy | | ☐ |
| **EXP-RWY-03** | `curl /api/health` JSON | | ☐ |
| **EXP-RWY-04** | Frontend demo HTTPS — Browser AR live | | ☐ |
| **EXP-RWY-05** | Chat connected + rules fallback badge | | ☐ |
| **EXP-RWY-06** | DevTools WebSocket WSS connection | | ☐ |
| **EXP-RWY-07** | Yellow ML optional banner (if no ML) | | ☐ |

---

## Issues remaining

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | | | |
| 2 | | | |

---

## Commands used for verification

```bash
curl https://YOUR-BACKEND.up.railway.app/api/health
curl https://YOUR-BACKEND.up.railway.app/api/nlp/health
curl https://YOUR-FRONTEND.up.railway.app/health.txt
```

---

*Fill in after completing steps in [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md).*
