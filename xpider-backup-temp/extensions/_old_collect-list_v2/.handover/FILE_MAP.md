# Project File Map (Handover v27.0)

This map defines the primary responsibilities and interaction patterns of the codebase.

## 📁 `extension/` (Core Application)
- **`manifest.json`**: Entry point. Defines script injection and permissions.
- **`background.js`**: (Service Worker) The central orchestrator. Manages state, handles messages, and bridges transcription requests.
- **`challenge_solver_content.js`**: Injected into reCAPTCHA iframes. Handles DOM actions, audio detection, and shows the HUD (v18.1).
- **`captcha_solver.js`**: Backend logic for 2Captcha, NopeCHA, and Wit.ai transcription (Streaming JSON parsing).
- **`global_blacklist.js`**: Massive Set-based filter for Korean administrative names and government offices.
- **`noise_dictionary.js`**: Semantic noise dictionary for common nouns used to filter extraction candidates.
- **`business_filters.js`**: Logic for validating if a piece of text is a viable business entity using the blacklist and dictionary.
- **`popup.html/js/css`**: Main User Interface. Implements real-time progress syncing via polling and status detail updates.
- **`translations.js`**: Multi-language UI translation mappings.

## 📁 `xpider-solver-sdk/` (Reusable Modules)
- **`solver-core.js`**: Standalone backend transcription engine.
- **`solver-content.js`**: Standalone DOM solver and HUD bridge.
- **`bridge-example.js`**: Reference code for integrating the SDK into other apps.
- **`README.md`**: Integration guide and manifest requirements.

## 📁 `.handover/` (Backup & Restore)
- **`SNAPSHOT_MANIFEST.md`**: Current state, architectural updates, and known blockers.
- **`FILE_MAP.md`**: This file.
- **`NEXT_AGENT_PROMPT.md`**: Context rehydration prompt for future AI agents.
