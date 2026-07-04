# Smart Livestream AI — Research Mental Model

**Purpose:** Explain the *why* behind the architecture for a Master's thesis research prototype.  
**Audience:** Thesis author, examiners, future researchers.  
**Companion:** `docs/SYSTEM_ARCHITECTURE.md` (the *how*).

This document is inference from prior codebase analysis. It is not a product roadmap.

---

## 1. What Is the Actual Research Problem?

The project does **not** aim to build a production livestream platform. It investigates a narrower question:

> **In Vietnamese e-commerce livestreams, how can an AI assistant correctly interpret viewer comments that refer to products ambiguously — especially deictic references like "cái này", "món này" — and respond with contextually appropriate sales assistance?**

Three sub-problems compose this:

| Sub-problem | Question |
|-------------|----------|
| **Product disambiguation** | Given a comment, *which catalog product* is the viewer asking about? |
| **Intent understanding** | *What kind* of commerce question is being asked (price, stock, shipping, purchase intent)? |
| **Assisted response** | Given product + intent, *what action and reply* should the system suggest to the host or viewer? |

The hardest part is **product disambiguation**, not intent classification alone. A comment like *"giá bao nhiêu vậy shop?"* is syntactically clear (price question) but **semantically incomplete** without knowing which product is in scope. Livestream viewers routinely use deictic language pointing at whatever the host is holding, wearing, or displaying — context that plain NLP ignores.

The thesis prototype therefore models **multimodal product context fusion**: text mentions, host curation (pinned product), host annotation (manual camera context), and optional visual recognition — unified before any reply is generated.

**Repository B (`smart-livestream-ml`)** addresses the intent sub-problem.  
**Repository A (`smart-livestream-poc`)** addresses fusion + response orchestration, with ProductContextResolver as the semantic core.

---

## 2. Which Modules Are Supporting Technologies?

These modules make the demo *believable* and *runnable* but are not the research claim:

| Module | Role | Why supporting |
|--------|------|----------------|
| **Browser AR** (MediaPipe FaceLandmarker) | Visual demo of host-facing livestream | AR effects do not solve product disambiguation; any video source would suffice |
| **Face registration / InsightFace** | Optional identity capture | Identity is orthogonal to commerce Q&A; disabled on cloud by default |
| **Chat WebSocket** | Multi-user interaction transport | Sales Lab proves NLP works with a text box; chat is presentation |
| **Commerce mock** (cart, checkout) | End-to-end story completion | Simulated; no payment or inventory research |
| **Railway / Docker deployment** | Reproducible demo hosting | Engineering constraint, not scientific contribution |
| **Legacy inference / MJPEG / realtime WS** | Earlier camera architecture | Superseded by Browser AR; retained for tests |
| **AiEventFeedPanel** | Polls legacy interaction events | Side channel from old inference path |
| **POC labs** (`/poc/ar-lab`, `/poc/sales-lab`) | Isolated benchmarks | Engineering harnesses |
| **Wave gesture detection** | Interaction signal (disabled) | Peripheral to sales assistant thesis |

**PhoBERT intent service (Repo B)** sits between supporting and contributing: it is a **trained component** the thesis may evaluate, but it solves only the intent slice. Without ProductContextResolver, intent alone cannot answer *"how much is this?"* correctly.

---

## 3. Which Modules Are the Actual Research Contribution?

| Module | Contribution |
|--------|--------------|
| **ProductContextResolver** | Priority-based fusion policy for product scope under ambiguity; deictic reference handling; clarification fallback |
| **Sales NLP pipeline** (`runSalesNlpPipeline`) | End-to-end orchestration: context → intent → entities → action → templated answer → commerce suggestions |
| **Hybrid ML–regex intent bridge** (`mlIntentBridge` + backend mapper) | Confidence-gated fusion of PhoBERT predictions with rule-based fallback; commerce-specific label mapping |
| **Vietnamese intent taxonomy + dataset + PhoBERT fine-tune (Repo B)** | Empirical intent classifier for livestream commerce comments (11 labels, hardcases evaluation) |
| **Lightweight ProductRecognizer** (dHash + histogram) | Experimental visual signal with documented limitations and memory benchmarks — contributes as *feasibility study*, not SOTA vision |
| **Product mention / semantic search layer** | Text-side catalog matching (explicit + fuzzy + TF-IDF search) complementing visual context |

The **integration architecture** — Camera → ProductRecognizer → DetectedProduct → **ProductContextResolver** → SalesNlpPipeline → Reply — is itself a contribution: it separates evolvable sensing from stable resolution policy.

---

## 4. Which Modules Could Be Replaced Without Affecting the Thesis?

If the research claim is *context-aware sales assistance for ambiguous livestream comments*, these are interchangeable:

| Replaceable | Alternative | Thesis impact |
|-------------|-------------|---------------|
| Browser AR | Static product image or pre-recorded video | None — still feeds ProductRecognizer |
| ProductRecognizer (dHash) | Manual-only context; or backend matcher; or future MobileCLIP | None on resolver policy — only input quality changes |
| Face registration | Remove entirely | None — main demo already works without it |
| Chat WebSocket | Sales Lab text input | None — same NLP path |
| Commerce checkout | Remove or simplify to "suggested action" text | Minimal — reply generation is the core |
| PhoBERT ML service | Regex-only (`Sales Lab` mode) | Weakens intent evaluation chapter, not context fusion chapter |
| Deployment target | Local-only, no Railway | None on algorithm |
| Catalog size / products | Different SKU set | None if resolver logic unchanged |

**Not replaceable without changing the thesis:** ProductContextResolver priority semantics, Sales NLP pipeline structure, deictic → clarification behavior.

---

## 5. Which Modules Represent the Novelty of the System?

Novelty is **not** "we built a livestream app" or "we used PhoBERT." Comparable systems exist commercially. The defensible novelty for a Master's thesis:

1. **Explicit multimodal product context policy** for Vietnamese livestream deixis — a documented, testable priority chain (explicit text → vision → manual → pinned → fuzzy text → clarification) rather than ad hoc heuristics.

2. **Architectural separation of sensing vs resolution** — ProductRecognizer may evolve; ProductContextResolver encodes the research hypothesis about *how* signals should combine.

3. **Pragmatic hybrid NLP** — ML intent where confident, regex where not, with commerce-specific suppression (chitchat/spam) and escalation (complaint/purchase) — suited to resource-constrained research deployment.

4. **Honest lightweight vision** — catalog-scoped matching with measured memory cost (~1.23 MB RSS) and explicit failure modes (pose, lighting, worn products) as research findings, not hidden limitations.

5. **Vietnamese livestream intent dataset and fine-tuned classifier (Repo B)** — domain-specific labeled data and evaluation (macro F1 ~0.96 on hardcases) supporting the intent layer.

What is **not** novel: MediaPipe AR, InsightFace, WebSocket chat, mock cart, Railway hosting.

---

## 6. Which Modules Should Appear in the Thesis System Architecture Chapter?

Include — these carry the scientific narrative:

```
Viewer Comment + Host Context Signals
              ↓
    ProductContextResolver  ← central box
              ↓
       Sales NLP Pipeline
    (intent · entities · action)
              ↓
      Answer + Host Recommendation
              ↓
         [Optional: Chat UI]
```

**Diagram components to label:**

| Include | Show as |
|---------|---------|
| ProductContextResolver | Core component with priority rules |
| Context inputs | Pinned product, manual camera mark, optional camera vision, catalog text match |
| Sales NLP pipeline | Intent classification (regex + optional ML), entity extraction, action decision, answer generation |
| ML Intent Service (Repo B) | Optional external service via backend proxy |
| ProductRecognizer | Optional input; dashed boundary — "experimental" |
| Clarification path | Explicit branch when deixis + no context |

**Minimize or omit from architecture chapter:**

- Railway, Docker, nginx, CORS
- Face registration flow
- Legacy MJPEG / inference / realtime WebSocket
- Commerce checkout state machine
- ChatManager internals
- Feature flag tables (mention in implementation/deployment appendix only)

**Suggested chapter structure:**

1. Problem: ambiguous product reference in livestream comments  
2. Context fusion architecture (ProductContextResolver)  
3. Sales reasoning pipeline  
4. Optional ML intent layer (Repo B)  
5. Optional visual sensing (ProductRecognizer)  
6. Deployment constraints (brief — graceful degradation)

---

## 7. Which Modules Belong Only to Engineering Implementation?

These support reproducibility and demo quality but belong in **Implementation**, **Deployment**, or **Appendix** — not in the research architecture figure:

- `deploy/railway.*.toml`, Dockerfiles, `docker-compose.yml`
- Feature flags (`FACE_RECOGNITION_WARMUP`, `VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION`, etc.)
- In-memory ChatManager (50-message cap, no persistence)
- `scripts/measure_*_memory.py` benchmark harnesses
- `backend/app/api/product_vision.py` when not wired to frontend (duplicate of client matcher)
- `BrowserCameraStream`, `/video-feed`, `/api/inference/frame`
- `/ws/realtime`, `ai_runtime.py`, `StreamInferenceService`
- `AiEventFeedPanel` polling loop
- `ServiceHealthBanner`, ML health proxy
- POC lab pages and AR benchmark harness
- Embedding storage ephemerality on Railway

**Rule of thumb:** If removing it leaves the resolver + NLP pipeline testable via Sales Lab with a text box, it is engineering-only.

---

## 8. Which Future Works Naturally Extend This Architecture?

Extensions that **preserve ProductContextResolver** and strengthen the thesis lineage:

| Direction | Extends | Does not replace |
|-----------|---------|------------------|
| Improved ProductRecognizer (temporal voting, ROI crop, MobileCLIP) | Visual input quality | Resolver priority policy |
| Benchmark framework (RSS, latency, accuracy on pose/lighting sets) | Evidence for vision feasibility | Architecture |
| Neural product embeddings (Transformers.js) | Text-side catalog candidate matching | Explicit-match-first policy |
| LLM/RAG answer generation | `generateAnswer()` templates | Context fusion upstream |
| Persistent session store (DB) | Analytics across streams | Resolver logic |
| Larger catalog evaluation | Scalability of search + vision | Priority chain |
| YOLO/segmentation (if benchmarked) | ProductRecognizer only | ProductContextResolver |

Extensions that **change the research question** (new thesis, not incremental):

- Full autonomous host replacement (no human-in-loop pin/manual)
- General object detection open-world catalog
- Real payment / inventory integration
- Multi-host multi-room platform scale

The architecture was designed so **future work flows through ProductRecognizer and answer generation**, not through rewriting context policy — unless evaluation proves the policy itself is wrong (that would be a new research contribution).

---

## 9. Why ProductContextResolver Is Central — Not Camera or Face Recognition

### The research question is *which product*, not *which face* or *which pixel blob*

Viewer comments in livestreams are **under-specified at the product level**. Intent classifiers (PhoBERT) answer *"what type of question?"* — price, stock, shipping. They do **not** answer *"price of what?"* ProductContextResolver exists to close that gap.

### Camera recognition is intentionally weak and optional

The codebase documents that vision cannot reliably handle worn products, small items, pose/lighting/zoom variation. Engineering policy keeps it behind feature flags and off on Railway. It is an **experimental sensor**, not a foundation. Building the thesis on camera recognition would mean defending unreliable perception; building on resolver policy means defending **how to combine imperfect signals** — a stronger and more honest research position.

### Face recognition is orthogonal

InsightFace answers *"who is on camera?"* Commerce questions answer *"what are they selling?"* A host's face identity does not disambiguate *"cái này giá bao nhiêu?"* Face registration is optional, memory-heavy, and absent from Browser AR — correctly treated as peripheral.

### Host-in-the-loop signals are first-class research inputs

Livestream commerce is **co-produced** by host and audience. Pinning a product and manually marking camera context model **host curation** as explicit signals — reflecting real platform behavior (hosts pin links, hold products up). The resolver encodes this sociotechnical reality in code: vision supplements, but host actions anchor context.

### Clarification is a valid research outcome

When deictic reference meets no context, the system asks *"Bạn đang hỏi về sản phẩm nào?"* — not a failure, but a **designed behavior** showing the system knows what it does not know. This distinguishes research prototype from brittle chatbot that hallucinates product answers.

### Architectural stability reflects research maturity

Policy explicitly states: only ProductRecognizer may evolve; ProductContextResolver should remain stable. That is the mark of a **hypothesis frozen for evaluation** — the thesis tests whether the priority chain and fusion rules are adequate, while allowing better sensors later.

**In one sentence:** Camera and face are *inputs*; ProductContextResolver is the *theory* of how livestream sales context should be resolved.

---

## 10. One-Page Research Mental Model

### Philosophy

Smart Livestream AI treats livestream sales assistance as a **context fusion problem** disguised as a chatbot problem. Viewers speak in shorthand; hosts curate attention. An assistant must reconcile what was *said*, what was *pinned*, what was *marked*, and what was *seen* — then reason about intent and reply. The system is pessimistic about vision, optional about identity, and explicit about ambiguity.

### Three layers of meaning

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3 — RESPONSE                                         │
│  Intent · Action · Template answer · Host recommendation    │
│  "What should we say/do?"                                   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — PRODUCT CONTEXT  ★ THESIS CORE ★                 │
│  ProductContextResolver                                     │
│  "Which product is this comment about?"                     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1 — SIGNALS (replaceable, imperfect)                   │
│  Text mention · Pin · Manual mark · Vision · (Face: unused) │
│  "What evidence do we have?"                                │
└─────────────────────────────────────────────────────────────┘
```

Layer 2 is where the Master's contribution lives. Layer 1 sensors may upgrade without invalidating Layer 2 if the policy holds. Layer 3 may later use LLMs without changing Layer 2.

### Design principles (inferred from architecture)

| Principle | Manifestation |
|-----------|---------------|
| **Ambiguity first** | Deictic patterns trigger clarification, not guessing |
| **Explicit beats implicit** | Named product in text overrides pin and camera |
| **Host authority** | Manual camera context outranks pin; pin outranks weak vision |
| **Graceful degradation** | ML off → regex; vision off → manual/pin/text; face off → demo still runs |
| **No startup warmup for heavy AI** | Lazy load; flags default false — research on constrained hardware |
| **Honest scope** | Catalog-scoped vision only; no YOLO/CLIP without benchmark gate |
| **Separation of concerns** | Recognizer evolves; resolver policy stable |

### What success looks like for the thesis

Not: *"We built Shopee Live."*  
Yes: *"We defined and implemented a multimodal product context resolution policy for Vietnamese livestream commerce comments, integrated it with a hybrid intent classifier, and evaluated where lightweight vision helps vs where host curation and clarification are necessary."*

### What the demo proves vs what it performs

| Demo behavior | Research evidence |
|---------------|-------------------|
| Viewer asks price with pinned product | Resolver uses pin fallback correctly |
| Viewer says "cái này" with manual mark | Deixis + implicit context fusion |
| Viewer says "cái này" with nothing set | Clarification question generated |
| Viewer names product explicitly | Explicit catalog match wins over pin/vision |
| ML service running | Intent bridge improves classification |
| ML service down | Regex fallback; system still functional |
| Vision flag on | Optional signal enters resolver at defined priority |
| Vision flag off | Manual + pin + text paths sufficient for demo |

### Two-repository split as research methodology

- **Repo B** = *train and measure* language understanding (intent taxonomy, dataset, PhoBERT metrics)  
- **Repo A** = *integrate and demonstrate* context-aware assistance in an interactive prototype  

Neither repo alone tells the full story. The thesis narrative connects them: ML supplies Layer 3 intent; Repo A supplies Layer 2 fusion and Layer 3 orchestration.

### Closing metaphor

The system is not an eye that recognizes products. It is a **desk assistant** sitting beside the host: listening to chat, noting what the host pinned, glancing at the camera when enabled, and whispering *"They're probably asking about the red lipstick — here's a suggested reply"* — or *"Ask them which product they mean."*

That assistant's judgment — not the webcam, not the face model — is what this research prototype is built to study.

---

## Summary Table

| Question | Short answer |
|----------|--------------|
| Research problem | Ambiguous product reference in Vietnamese livestream comments |
| Supporting tech | AR, face, chat, commerce mock, deployment, legacy camera |
| Research contribution | ProductContextResolver, Sales NLP fusion, hybrid ML intent, lightweight vision feasibility, Repo B dataset/model |
| Replaceable | AR, face, chat transport, commerce, deployment, ML (partially), vision implementation |
| Novelty | Context fusion policy, deixis handling, hybrid NLP, honest lightweight vision, VN intent dataset |
| Thesis architecture chapter | Resolver + NLP pipeline + optional ML + optional vision |
| Engineering only | Railway, flags, legacy APIs, labs, benchmarks, chat persistence |
| Future work | Better recognizer, LLM answers, embeddings, benchmarks — through existing extension points |
| Why resolver is central | Research targets *which product*; vision/face are imperfect optional sensors |
| Mental model | Three layers: signals → context (core) → response |

---

*Document generated from architectural analysis session. For implementation details see `docs/SYSTEM_ARCHITECTURE.md`.*
