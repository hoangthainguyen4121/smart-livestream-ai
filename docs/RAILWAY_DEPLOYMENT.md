# Railway Deployment Guide

Deploy **smart-livestream-poc** lên [Railway](https://railway.app) free tier: **2 services** tách biệt (frontend + backend). Railway **không** chạy `docker-compose.yml` multi-service trực tiếp — mỗi service build Dockerfile riêng từ cùng GitHub repo.

**ML PhoBERT:** không deploy trên free tier (model nặng). Backend tự **rules fallback** khi ML unavailable.

---

## 0. Audit tương thích Railway

| Thành phần | Railway requirement | Trạng thái repo |
|------------|--------------------|-----------------|
| Backend listen `PORT` | Railway inject `PORT` | ✅ `backend/docker-entrypoint.sh` |
| Frontend listen `PORT` | nginx bind dynamic port | ✅ `frontend/docker-entrypoint.prod.sh` |
| Health check | HTTP path | ✅ `/api/health` (backend), `/health.txt` (frontend) |
| HTTPS API | Public URL | ✅ Set `VITE_API_BASE_URL=https://...` at **build** time |
| WSS chat | `wss://` on HTTPS page | ✅ `VITE_WS_BASE_URL` or auto from API URL |
| CORS | Frontend origin | ✅ `CORS_ORIGINS` + regex `*.railway.app` |
| ML optional | No crash if down | ✅ NLP proxy + frontend banner |
| Docker context | Backend needs repo root | ✅ Dockerfile path `backend/Dockerfile`, root `/` |
| WebSocket | Supported on Railway HTTP service | ✅ FastAPI `/ws/chat/{room_id}` |

**Không dùng:** `docker-compose.yml`, Procfile, Nixpacks (Dockerfile ưu tiên).

Config-as-code:

- Backend: [`deploy/railway.backend.toml`](../deploy/railway.backend.toml)
- Frontend: [`deploy/railway.frontend.toml`](../deploy/railway.frontend.toml)

Env mẫu: [`.env.railway.example`](../.env.railway.example)

---

## 1. Tạo project Railway

1. Đăng nhập [railway.app](https://railway.app) → **New Project**.
2. Chọn **Deploy from GitHub repo** → authorize → chọn repo `smart-livestream-poc`.
3. Project sẽ có service đầu tiên — đổi tên thành **`backend`** (Settings → name).

---

## 2. Service Backend

### 2.1 Cấu hình build

| Setting | Value |
|---------|-------|
| **Root Directory** | `/` (repo root — **không** set `backend/`) |
| **Builder** | Dockerfile |
| **Dockerfile Path** | `backend/Dockerfile` |
| **Config-as-code** | `deploy/railway.backend.toml` |

### 2.2 Biến môi trường (Runtime)

| Variable | Required | Example | Ghi chú |
|----------|----------|---------|---------|
| `PORT` | Auto | — | Railway inject — **không set** |
| `CORS_ORIGINS` | Khuyến nghị | `https://smart-livestream-web.up.railway.app` | URL frontend sau bước 3 |
| `ML_INTENT_API_URL` | No | *(unset)* | Bỏ trống → rules fallback |
| `ML_INTENT_TIMEOUT_SECONDS` | No | `2` | |
| `ENABLE_WAVE_GESTURE` | No | `false` | |

### 2.3 Deploy & lấy URL

1. **Deploy** → đợi build (InsightFace pip + deps ~3–8 phút lần đầu).
2. **Settings → Networking → Generate Domain** → copy URL, ví dụ:
   `https://smart-livestream-api.up.railway.app`

### 2.4 Kiểm tra health

```bash
curl https://YOUR-BACKEND.up.railway.app/api/health
# {"status":"ok"}

curl https://YOUR-BACKEND.up.railway.app/api/nlp/health
# ml_service_status: "unavailable" — OK without ML
```

---

## 3. Service Frontend

### 3.1 Thêm service mới

Trong cùng project: **+ New Service → GitHub Repo** → chọn **cùng repo** → đặt tên **`frontend`**.

### 3.2 Cấu hình build

| Setting | Value |
|---------|-------|
| **Root Directory** | `/` |
| **Builder** | Dockerfile |
| **Dockerfile Path** | `frontend/Dockerfile` |
| **Docker Target** | `production` |
| **Config-as-code** | `deploy/railway.frontend.toml` |

### 3.3 Biến môi trường (Build-time — bắt buộc)

Trong **Variables**, thêm và bật **Available at Build** ✅:

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://YOUR-BACKEND.up.railway.app` |
| `VITE_WS_BASE_URL` | `wss://YOUR-BACKEND.up.railway.app` |

> Nếu bỏ `VITE_WS_BASE_URL`, frontend tự suy ra `wss://` từ `VITE_API_BASE_URL` (cùng host).

`PORT` runtime — Railway inject cho nginx; **không cần set**.

### 3.4 Deploy & domain

1. Deploy frontend.
2. **Generate Domain** → ví dụ `https://smart-livestream-web.up.railway.app`

### 3.5 Cập nhật backend CORS

Quay lại service **backend** → set:

```text
CORS_ORIGINS=https://smart-livestream-web.up.railway.app
```

Redeploy backend. (Regex `*.railway.app` cũng cho phép PoC, nhưng nên set explicit origin.)

---

## 4. Test sau deploy

### 4.1 Health

| Check | URL |
|-------|-----|
| Backend | `https://YOUR-BACKEND.up.railway.app/api/health` |
| NLP proxy | `https://YOUR-BACKEND.up.railway.app/api/nlp/health` |
| Frontend static | `https://YOUR-FRONTEND.up.railway.app/health.txt` → `ok` |

### 4.2 Demo UI

1. Mở `https://YOUR-FRONTEND.up.railway.app/`
2. **HTTPS bắt buộc** cho webcam (`getUserMedia`).
3. Start Stream → Browser AR chạy client-side.
4. Gửi chat → badge `connected` (WebSocket WSS).
5. Banner vàng nếu ML chưa chạy — **bình thường** trên free tier.

### 4.3 WebSocket test (DevTools)

1. F12 → Network → WS.
2. Gửi tin chat → thấy connection tới:
   `wss://YOUR-BACKEND.up.railway.app/ws/chat/demo`

Hoặc dùng [websocket.org echo test](https://www.websocket.org/echo.html) không áp dụng trực tiếp — test qua UI chat là đủ.

### 4.4 Intent fallback (không ML)

Gửi comment: `giá bao nhiêu vậy` → Sales Assistant badge **`rules fallback`** (đỏ/vàng).

---

## 5. ML PhoBERT (optional — không khuyến nghị free tier)

| Option | Ghi chú |
|--------|---------|
| **Không deploy** | ✅ Demo luận văn vẫn OK với rules |
| Deploy repo `smart-livestream-ml` | Service thứ 3, RAM cao, cold start lâu |
| ML local + tunnel | Chỉ dev — không dùng production |

Nếu có ML URL public:

```text
ML_INTENT_API_URL=https://your-ml.up.railway.app
```

Backend proxy `/api/nlp/*` — frontend không đổi.

---

## 6. Thứ tự deploy khuyến nghị

```text
1. Deploy BACKEND → lấy BACKEND_URL
2. Set frontend build vars (VITE_*) → deploy FRONTEND → lấy FRONTEND_URL
3. Set backend CORS_ORIGINS = FRONTEND_URL → redeploy BACKEND
4. Test health + chat + Browser AR
5. Điền docs/RAILWAY_DEPLOYMENT_STATUS.md
```

---

## 7. Known limitations (Railway free tier)

| Hạn chế | Chi tiết |
|---------|----------|
| Ephemeral disk | Face embeddings **mất** khi redeploy — không volume persistent trên free |
| Cold start | Backend InsightFace load ~30s–2min sau sleep |
| ML model | PhoBERT ~400MB+ — không phù hợp free tier |
| Legacy MJPEG | `/video-feed` không dùng trên cloud |
| Sleep / quota | Free tier có giới hạn giờ chạy/tháng — kiểm tra Railway pricing |
| 2 services | Mỗi service tính quota riêng |

---

## 8. Troubleshooting

| Triệu chứng | Nguyên nhân | Cách sửa |
|-------------|-------------|----------|
| Frontend gọi `127.0.0.1:8000` | Build thiếu `VITE_*` | Set build vars + **Redeploy** frontend |
| CORS error | `CORS_ORIGINS` sai | Set đúng frontend HTTPS URL |
| Chat `error` / disconnected | WSS blocked or backend down | Kiểm tra backend health, `VITE_WS_BASE_URL` |
| Build backend fail OOM | InsightFace deps lớn | Retry; cân nhắc Railway paid RAM |
| Camera không bật | HTTP not HTTPS | Dùng Railway domain HTTPS |

---

## 9. Liên quan

- Local Docker: [`DOCKER.md`](DOCKER.md)
- CI/CD: [`CI_CD.md`](CI_CD.md)
- Trạng thái deploy: [`RAILWAY_DEPLOYMENT_STATUS.md`](RAILWAY_DEPLOYMENT_STATUS.md)
- Env mẫu: [`.env.railway.example`](../.env.railway.example)

---

## 10. GitHub Actions

CI hiện tại **không** deploy Railway. Deploy thủ công qua dashboard. (CD Railway có thể thêm sau với `RAILWAY_TOKEN`.)
