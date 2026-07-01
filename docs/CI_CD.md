# CI/CD

Pipeline tối thiểu cho `smart-livestream-poc`: kiểm tra code, build frontend, validate Docker — **không deploy tự động** lên cloud.

## Workflows

| File | Trigger | Jobs |
|------|---------|------|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | push/PR → `main` | Backend pytest · Frontend test+build · `docker compose config` |
| [`.github/workflows/docker-build.yml`](../.github/workflows/docker-build.yml) | push/PR → `main` · manual | Build backend + frontend (dev & prod) images · không push registry |

## CI (`ci.yml`)

### Backend tests

```bash
pip install -r requirements.txt -r backend/requirements.txt
python -m pytest backend/tests -q
```

### Frontend

```bash
cd frontend && npm ci && npm test && npm run build
```

Lint: **không ép** — project chưa cấu hình ESLint/Prettier riêng cho CI.

### Docker Compose validation

```bash
docker compose config --quiet
```

## Docker Build (`docker-build.yml`)

Build local images trên GitHub runner (cache GHA):

- `smart-livestream-backend:ci` — `backend/Dockerfile`
- `smart-livestream-frontend-dev:ci` — target `development`
- `smart-livestream-frontend-prod:ci` — target `production`

**Không push** lên Docker Hub / GHCR — cần thêm secrets và bước `push: true` khi có registry.

## Chạy CI tương đương trên máy dev

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
docker compose config --quiet
docker compose build
```

## CD (Continuous Deployment)

**Chưa triển khai.** Deploy demo thủ công theo [`DEPLOYMENT.md`](DEPLOYMENT.md).

Khi có VPS/registry, có thể mở rộng:

1. Push image lên GHCR sau `docker-build.yml`
2. SSH deploy hoặc Render/Railway auto-deploy từ `main`
3. Inject `VITE_API_BASE_URL` + `CORS_ORIGINS` theo môi trường

## Branch policy

- CI chạy trên PR và push vào `main`
- Merge khi backend + frontend + compose config pass

## Liên quan

- Docker local: [`DOCKER.md`](DOCKER.md)
- Deploy kế hoạch: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- Trạng thái thực tế: [`DEPLOYMENT_STATUS.md`](DEPLOYMENT_STATUS.md)
