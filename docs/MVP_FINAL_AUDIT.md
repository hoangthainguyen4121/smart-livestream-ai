# Smart Livestream MVP — Final end-to-end audit

**Date:** 2026-08-11  
**Scope:** Local MVP demo freeze readiness. No new features, training, large refactors, or deploy.  
**Experimental excluded:** Custom YOLOX V3 harness (`-EnableYoloxHarness` / `#/dev/cv-test` A/B only).

---

## Bắt buộc phản biện

> Với feature set hiện tại, đâu là luồng demo tối thiểu chứng minh được đầy đủ giá trị của Smart Livestream MVP mà không phụ thuộc vào các experimental/research path như YOLOX V3?

**Minimal demo path (production-shaped):**

1. `Start-LocalDemo.ps1 -WarmCv` (YOLOX OFF)
2. Create room (category + host token) → host **Bật camera** → AR canvas preview
3. Second browser as viewer → directory → enter room → WebRTC processed stream
4. Vietnamese chat → PhoBERT intent badges / sales assistant behavior
5. One intent correction → admin approve → export batch (no retrain)
6. Host toggles **Nhận diện sản phẩm** → adult + Subh775 firearm warning path + COCO sharp/product overlays
7. Host **Kết thúc livestream** → viewer sees ended; optional reclaim within grace

No YOLOX, no V4, no `#/dev/cv-test` required.

---

## Evidence sources

| Layer | Evidence |
|-------|----------|
| Stack | `Stop-LocalDemo` + `Start-LocalDemo -WarmCv` (~106s), YOLOX harness OFF |
| API | `.local/mvp_audit_api.json` |
| Chat/WebRTC signaling | `.local/mvp_audit_ws2.json` |
| Browser (fake media) | `.local/mvp_audit_browser.json` — host canvas + viewer `srcObject` |
| Backend tests | 137 passed, 64 skipped |
| Frontend tests | 266 passed (61 files) |
| Host lease | `tests/test_host_lease.py` — 6 passed |
| Firearm policy/metrics | `docs/FIREARM_MVP_FINAL.md` + holdout bbox IoU artifacts |

---

## Results

### LOCAL STACK: **PASS**

| Component | Status |
|-----------|--------|
| PostgreSQL | RUNNING |
| PhoBERT `:8010` | healthy + warm predict |
| Backend `:8000` | healthy |
| Frontend `:5173` | healthy |
| Adult moderation | enabled + ready (suggestive + Falconsai) |
| Subh775 firearm | enabled + ready; `auto_terminates_session=false` |
| Grounding DINO | enabled + ready (fallback) |
| Custom YOLOX | **disabled** (`enabled=false`, not warmed) |
| Chat mode | `memory` (no durable normal chat) |

### HOST FLOW: **PASS**

- API: create room (`electronics` / categories), `host_resume_token`, heartbeat `media_live=true`, reclaim
- Browser: host role after token seed, **Bật camera**, AR `canvas` present, camera-idle hint cleared
- Host controls: camera / screen share / stop / end livestream visible

### VIEWER WEBRTC: **PASS**

- Directory lists active room
- Signaling: `webrtc_join` / offer / answer / ICE / `host_media_started` (no signaling errors when `peer_id` set)
- Browser: viewer `<video>` with `srcObject` / readyState after host goes live
- Reconnect: viewer re-announces join on `host_media_started` (code + unit coverage); no reconnect storm observed in smoke

### CHAT/INTENT: **PASS**

| Sample | PhoBERT intent | Notes |
|--------|----------------|-------|
| `san pham nay gia bao nhieu` | `ASK_PRICE` (~0.95) | Good |
| `toi muon mua cai nay` | `PURCHASE_INTENT` (~0.68) | Good |
| `mau do con hang khong` | raw `COMPLAINT` (~0.81), mapped `ASK_PRODUCT_INFO` | Noisy — see DEMO_QUALITY |
| spam-like ascii | `SPAM_TOXIC` (~0.97), suppress | Good |

- WebSocket: `chat_message` broadcast host↔viewer
- Persistence: `chat_persistence_mode=memory`, `durable_chat_history=false`

### CORRECTION FLOW: **PASS**

- `POST /api/intent-corrections` → pending
- Admin list (`X-Admin-Api-Key: local-dev-admin-key`) shows sample
- Review → `approved`
- Export batch → `completed` (download JSONL verified)

### GENERAL CV: **PASS** (policy + wiring)

- Browser COCO path gated by host toggle **Nhận diện sản phẩm** (default OFF — intentional CPU save)
- Product absence / crowd / sharp-object policies covered by frontend unit tests
- Sharp object (knife/scissors) remains separate from gun-family gate

### ADULT MODERATION: **PASS**

- Backend ready; `auto_terminates_session=false`
- Temporal policy: suggestive `requiredHits=2`, explicit `≥3` (unit tests)
- Warning-only — no session auto-termination by design

### FIREARM MODERATION: **PASS**

- Primary: Subh775 (`VITE_FIREARM_ONNX_ENABLED` / `FIREARM_ONNX_ENABLED`)
- YOLOX OFF on MVP path
- Temporal `requiredHits=2`; `evaluateWeaponGate` always `autoTerminates: false`
- Threshold 0.65 unchanged; holdout metrics frozen in `FIREARM_MVP_FINAL.md`

### ROOM LIFECYCLE: **PASS**

- Explicit end → removed from active directory (`ended_reason=host_stopped`)
- Reclaim with valid token OK; bad token rejected
- Grace / stale / lease expiry: covered by `test_host_lease.py` (grace default 180s, presence stale ≤45s) — not wall-clock waited in this audit

### TESTS

| Suite | Passed | Failed | Skipped |
|-------|-------:|-------:|--------:|
| Backend pytest | **137** | **0** | **64** |
| Frontend vitest | **266** | **0** | **0** |
| Host lease subset | **6** | **0** | **0** |

Skipped backend tests are existing optional/integration skips (not treated as failures).

### Browser/runtime health

- No page exceptions on host/viewer DemoPage smoke
- One TFLite XNNPACK info line mis-captured as console noise (not an app exception)
- Transient WS “closed before established” on fast navigation — not a reconnect loop
- YOLOX not loaded (no duplicate firearm model on MVP path)
- No micro-optimization performed

---

## Issue classification

### BLOCKERS

*None.*

### DEMO_QUALITY ISSUES

1. **Product-question intent noise** — “mau do con hang khong” often predicts `COMPLAINT` (mapped to product-info action). Demo should prefer clearer stock phrases (`còn hàng không`) or accept mapped-action behavior.
2. **CV toggle default OFF** — host must click **Nhận diện sản phẩm** before adult/firearm/COCO overlays run. Easy to miss in a live demo script.
3. **Browser chat Send click flake** — Playwright sometimes times out clicking `Gửi` (overlay/layout); **Enter-send works** in browser smoke, and WS API broadcast is solid. Not a product blocker.
4. **AGPL Subh775** — acceptable for local/thesis MVP; not a production license clearance.

### RESEARCH_ONLY

- Custom YOLOX V3 (weights retained; harness OFF; `#/dev/cv-test` only)
- V4 rack-domain data search (blocked; see firearm final report)

### KNOWN LIMITATIONS

- Firearm dense gunshop/rack (holdout t43) — known FN domain
- DINO prompt still lists knife/scissors for OD fallback; gun gate filters gun-family only; sharp path is separate COCO enforcement
- WebRTC media quality depends on host CPU (AR + COCO + adult + firearm when CV toggle on)
- Chat history is in-memory per backend process (by design for local MVP)

---

## Freeze decision

**MVP READY TO FREEZE: YES**

No integration blockers on the minimal non-YOLOX demo path. Remaining items are demo-script polish or research follow-ups.

---

`SMART LIVESTREAM MVP END-TO-END AUDIT COMPLETE`
