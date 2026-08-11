# Smart Livestream MVP — Demo checklist

**Freeze tag:** `mvp-freeze-2026-08`  
**Audit:** `docs/MVP_FINAL_AUDIT.md`  
**Firearm freeze:** `docs/FIREARM_MVP_FINAL.md`  
**Path:** local MVP only. **Do not** use `-EnableYoloxHarness` or `#/dev/cv-test` on the demo path.

---

## 0. Prerequisites (once per machine)

- Sibling repo `smart-livestream-ml` available (PhoBERT `:8010`)
- Postgres local (`smart_livestream_local`) — Windows service or `docker compose -f docker-compose.postgres.yml up -d`
- CV caches outside repo (Start-LocalDemo / `.env.example` paths): NSFW, suggestive, Subh775 ONNX, optional DINO
- Admin key for correction UI: `local-dev-admin-key` (local example only)

---

## 1. Start stack

```powershell
.\scripts\Start-LocalDemo.ps1 -WarmCv
```

Expect:

| Service | URL / note |
|---------|------------|
| Frontend | http://127.0.0.1:5173 |
| Backend | http://127.0.0.1:8000 |
| PhoBERT | http://127.0.0.1:8010 |
| Custom YOLOX | **OFF** (`enabled=false`) |
| Subh775 firearm | ON in child env (MVP primary) |

Stop later: `.\scripts\Stop-LocalDemo.ps1`

---

## 2. Create room (host)

1. Open rooms directory → **Tạo phòng** (pick category, e.g. electronics).
2. Enter as host (host resume token seeded).
3. Confirm room badge **active**.

---

## 3. Camera + AR

1. Host: **Bật camera** (allow webcam).
2. Confirm AR canvas / mirrored local preview.
3. Optional: change AR effect (default may be `none`).

---

## 4. Viewer WebRTC

1. Second browser/profile → rooms list → open same room as **viewer**.
2. After host is live: viewer video has remote stream (`srcObject`).
3. Chat/signaling connected (no YOLOX required).

---

## 5. VN chat / PhoBERT

Prefer clear phrases:

| Say | Expect |
|-----|--------|
| `san pham nay gia bao nhieu` | `ASK_PRICE` |
| `toi muon mua cai nay` | `PURCHASE_INTENT` |
| `còn hàng không` | stock / product-info path |

Avoid noisy demo phrases like `mau do con hang khong` (often `COMPLAINT` — known DEMO_QUALITY).

---

## 6. Correction + export

1. Viewer/host: submit one intent **correction** from chat.
2. Open intent-correction admin → header `X-Admin-Api-Key: local-dev-admin-key`.
3. **Approve** the pending item.
4. **Export batch** → status `completed` (JSONL download OK).
5. No retrain required for this demo.

---

## 7. Toggle visual moderation (CV)

UI label: **Nhận diện vi phạm** (EN: Violation Detection).  
(Audit text may say “Nhận diện sản phẩm” — same host toggle; default **OFF**.)

1. Host clicks **Nhận diện vi phạm**.
2. Confirm overlays / Visual Safety path active.
3. Smoke (warning-oriented; no YOLOX):

   - **Adult** — suggestive / NSFW warning (no auto-end from adult gate alone).
   - **Subh775** — firearm warning primary (`auto_terminates_session=false`).
   - **COCO** — generic objects; knife/scissors sharp path separate from gun-family.
4. Strike / dwell policy (if exercising end-of-stream): held warning re-ticks ~3s; at **5/5** violation modal then end session.

---

## 8. End session

1. Host: **Kết thúc livestream** (or confirm after 5/5 modal).
2. Viewer sees room **ended**.
3. Optional: host reclaim within lease grace using resume token.

---

## Out of scope (do not demo as MVP)

- `-EnableYoloxHarness` / Custom YOLOX V3
- `#/dev/cv-test` A/B harness
- Production license clearance for AGPL Subh775
- Durable chat history (MVP chat = memory)

---

## Quick health

```text
GET http://127.0.0.1:8000/api/health
GET http://127.0.0.1:8010/health   (or ML health route used by Start-LocalDemo)
```

Backend/frontend unit gates from audit: **137** / **266** passed.
