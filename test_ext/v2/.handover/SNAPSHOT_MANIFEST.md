# Project Snapshot: X PIDER Pro (Handover v27.0)
**Date**: 2026-04-12
**Status**: Stable / Extraction Optimized

## 1. Project Context
- **Version**: v1.0.0 Pro (Internal v36.5)
- **Manifest**: manifest v3 (Service Worker based)
- **Primary Goal**: High-precision local business data extraction with automated CAPTCHA bypass.

## 2. Key Architectural Milestones (V27.0 Session)

### A. CAPTCHA Solver Stabilization
- **Engine**: Hybrid solver using Wit.ai (Audio), 2Captcha, and NopeCHA.
- **Resilience**: 
    - **90s Auto-Reset**: Prevents infinite hang-loops when Google blocks the solver.
    - **Port-Resilient Monitoring**: Persistent connection between Popup and SW for instant force-stop.
    - **Wit.ai NDJSON Parsing**: Hierarchical regex-based parsing to handle streaming Wit.ai responses.
- **Localization**: All solver HUD and logs have been translated to English (v18.1).

### B. Intelligent Korean Filtering
- **Global Blacklist**: Expanded Section 8 (Administrative Regions) to include all 200+ Korean cities/districts. Added Section 34-37 for Government offices, Media, and Content noise.
- **Noise Dictionary**: Enhanced `KO_COMMON_NOUNS_SET` for exact-match noise filtering (e.g., "Resident", "Support").

### C. SDK Extraction
- Created `xpider-solver-sdk/`: A standalone package for reusing the solver logic in other extensions.

## 3. Persistent State (Storage)
Current storage keys in use:
- `isSearching`, `sessionResults`, `sessionLogs`, `currentProgressPercent`
- `captchaSolveEnabled`, `captchaMethod`, `captchaApiKey`, `audioSttKey`
- `captchaAttempts`, `captchaBlocked` (used for 90s reset logic)

## 4. Current Blockers & Risks
- **reCAPTCHA Distortion**: High-distortion audio challenges remain the primary bottleneck.
- **Wit.ai Rate Limits**: Excessive use of a single Wit.ai key may lead to temporary throttling.

## 5. Pending Tasks
- [ ] Implement multi-key rotation for Wit.ai.
- [ ] Add direct PDF/Doc extraction capability (v37.0 candidate).
