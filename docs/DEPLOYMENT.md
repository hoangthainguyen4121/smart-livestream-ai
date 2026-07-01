# Deployment Guide

Hướng dẫn triển khai demo Smart Livestream PoC phục vụ luận văn và Presentation 2.

## Tổng quan kiến trúc

| Thành phần | Vai trò | Bắt buộc? |
|------------|---------|-----------|
| **Frontend** (Vite / nginx) | Browser AR, chat UI, sales assistant | ✅ |
| **Backend** (FastAPI) | Chat WebSocket, face API, NLP proxy, events | ✅ |
| **ML Intent API** (repo `smart-livestream-ml`, cổng 8010) | PhoBERT intent classification | ⚠️ Tuỳ chọn — có rules fallback |

Repo này **không** chứa mã ML PhoBERT. ML chạy riêng theo [`phobert_bridge_demo.md`](phobert_bridge_demo.md).

---

## 1. Chạy local (không Docker)

### Backend

```powershell
cd smart-livestream-poc
.\scripts\start-backend.ps1
```

Kiểm tra:

```powershell
curl http://127.0.0.1:8000/api/health
```

### Frontend

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Mở http://127.0.0.1:5173

### ML intent (tuỳ chọn)

```powershell
cd path\to\smart-livestream-ml
python scripts/serve_intent_api.py --model-dir artifacts/phobert_base_combined --port 8010
```

Kiểm tra qua proxy:

```powershell
curl http://127.0.0.1:8000/api/nlp/health
```

---

## 2. Chạy bằng Docker Compose (khuyến nghị demo)

Từ thư mục gốc repo:

```powershell
copy .env.example .env
docker compose up --build
```

| URL | Dịch vụ |
|-----|---------|
| http://127.0.0.1:5173 | Frontend (Vite dev) |
| http://127.0.0.1:8000/api/health | Backend health |
| http://127.0.0.1:8000/api/nlp/health | NLP proxy + trạng thái ML |

Dừng:

```powershell
docker compose down
```

### Production-like frontend (nginx)

```powershell
docker compose --profile prod up --build
```

Frontend tĩnh: http://127.0.0.1:8080

### ML trong Docker

Compose **không** build ML service (model ~400MB+, repo riêng). Hai cách:

1. **Chạy ML trên host**, backend container dùng `ML_INTENT_API_URL=http://host.docker.internal:8010` (mặc định trong compose).
2. **Bỏ qua ML** — demo vẫn chạy với regex/rules fallback; banner vàng trên UI nhắc ML tuỳ chọn.

---

## 3. Kiểm tra service

```powershell
# Backend
curl http://127.0.0.1:8000/api/health

# NLP proxy (ML có thể unavailable — vẫn OK)
curl http://127.0.0.1:8000/api/nlp/health

# Compose health
docker compose ps
docker compose logs -f backend
```

Frontend hiển thị banner đỏ nếu backend down, banner vàng nếu ML tuỳ chọn chưa chạy.

---

## 4. Test trước khi demo

```powershell
# Backend
python -m pip install -r requirements.txt -r backend/requirements.txt
python -m pytest backend/tests -q

# Frontend
cd frontend
npm ci
npm test
npm run build

# Docker
docker compose config
docker compose up --build
```

Chi tiết CI: [`CI_CD.md`](CI_CD.md).

---

## 5. Deploy lên cloud (kế hoạch — chưa có server cố định)

Chưa cấu hình deploy tự động. Các lựa chọn phù hợp PoC:

### Railway (cloud demo)

Two-service deploy on Railway free tier — step-by-step:

**[docs/RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)**

Track results in [`docs/RAILWAY_DEPLOYMENT_STATUS.md`](RAILWAY_DEPLOYMENT_STATUS.md).

### VPS (Ubuntu + Docker Compose)

1. Clone repo lên VPS.
2. Cài Docker Engine + Compose plugin.
3. Mở firewall cổng 80/443 (frontend) và 8000 (API) hoặc reverse proxy.
4. `docker compose --profile prod up --build -d`
5. Đặt `VITE_API_BASE_URL` = URL công khai backend **khi build** frontend prod.
6. Cấu hình `CORS_ORIGINS` cho domain frontend.
7. Bật HTTPS (Let's Encrypt + nginx/Caddy) — **bắt buộc** cho `getUserMedia()` webcam trên trình duyệt.

### Render / Railway / Fly.io

| Nền tảng | Frontend | Backend | ML | Ghi chú |
|----------|----------|---------|-----|---------|
| **Render** | Static Site | Web Service | Worker riêng | Build frontend với env `VITE_API_BASE_URL` |
| **Railway** | Service | Service | Service tuỳ chọn | Multi-service compose export |
| **Fly.io** | Machine | Machine | Machine lớn | ML cần RAM cao |

**Lưu ý chung:**

- WebSocket chat cần `wss://` qua HTTPS.
- Browser AR cần HTTPS + quyền camera.
- InsightFace tải model **lazy** khi dùng face registration (không warmup lúc startup mặc định). Local Docker: cold start capture đầu ~1–3 phút. **Railway free tier:** RAM thường không đủ InsightFace ổn định — giữ `FACE_RECOGNITION_WARMUP=false`; face registration best-effort.
- Legacy MJPEG `/video-feed` **không** hoạt động tin cậy trong container cloud.

### GitHub Pages (chỉ frontend static)

| Khả thi? | Chi tiết |
|----------|----------|
| Frontend static | ✅ Có thể host `frontend/dist` |
| Backend / WebSocket | ❌ Cần host riêng (Render, VPS, …) |
| Webcam Browser AR | ⚠️ Chỉ trên HTTPS — Pages cung cấp HTTPS |
| Build-time API URL | Phải embed `VITE_API_BASE_URL` trỏ backend public |

**Kết luận:** GitHub Pages chỉ phù hợp **một phần** (UI tĩnh). Demo đầy đủ (chat, face API, NLP) cần backend deploy riêng và CORS/WebSocket cấu hình đúng.

---

## 6. Known limitations

- Không auth, không database persistence (ngoài file embeddings).
- Thanh toán mô phỏng — không tích hợp cổng thật.
- ML PhoBERT nằm repo `smart-livestream-ml` — optional.
- Docker trên Windows: webcam container không passthrough; dùng Browser AR trên host.
- Không Kubernetes, không multi-region.

---

## 7. Evidence cho Chương 4

Screenshot gợi ý (xem [`THESIS_P0_SCREENSHOTS.md`](THESIS_P0_SCREENSHOTS.md)):

- `docker compose ps` — backend healthy
- `curl /api/health` JSON `{"status":"ok"}`
- Demo page với Browser AR + chat connected
- Banner ML optional (rules fallback) hoặc PhoBERT badge khi ML chạy
- GitHub Actions CI pass (backend + frontend + compose)

Cloud deploy (Railway): [`RAILWAY_DEPLOYMENT.md`](RAILWAY_DEPLOYMENT.md) · status template [`RAILWAY_DEPLOYMENT_STATUS.md`](RAILWAY_DEPLOYMENT_STATUS.md)

Trạng thái hiện tại: [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md).
