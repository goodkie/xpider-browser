# XPIDER Browser & AutoCruiser Pro Development History
## Period: April 27 - April 29, 2026

### 1. Stage 2: Business Details Discovery Overhaul (April 29)
*   **Contact-First Extraction**: Rewrote the engine to prioritize contact pages (Contact, About, Connect, etc.) for higher accuracy in finding emails and socials.
*   **International Address Support**: Enhanced address regex to support Canadian Postal Codes (e.g., J7V 0A1) and Quebec-style street names (Rue, Boul, etc.).
*   **Hybrid Architecture**: Finalized the orchestration where `main.js` provides a stable `BrowserWindow` for crawling while the extension background script manages the lead queue.
*   **Data Persistence Fix**: Resolved the "Pending Stage 2" export bug by ensuring real-time synchronization between `extStorage` and `chrome.storage.local`.

### 2. AutoCruiser Pro Navigation Engine (April 27-29)
*   **Direction Sync**: Fixed the critical "direction drift" bug by embedding the current `cruiserDir` state directly into IPC move messages.
*   **Hardware Input Precision**: Reverted drag modifiers to `leftButtonDown` and optimized sleep timings (12ms/80ms) for reliable map tile interaction on Google Maps.
*   **Zig-Zag Pattern**: Implemented logic for handling empty/ocean zones, ensuring the cruiser reverses direction and moves south correctly to continue searching.

### 3. UI/UX & Localization
*   **Standardized Language**: Set default application language to English (`'en'`) and translated all system popup/updater messages to English.
*   **Loading Overlay**: Added a dimming overlay with a message ("Opening Google Maps...") triggered when the user clicks the navigation button.
*   **Native Save Dialogs**: Replaced unreliable webview blob downloads with native OS save dialogs via `ipcMain.handle('xpider-ext-save-file')`.
*   **Status & Counters**: Fixed the "Idle" status bug and updated the "Business Details Found" counter to reflect real-time progress during Stage 2.

### 4. System Maintenance & Sync (April 28)
*   **GitHub Sync Architecture**: Implemented an automated update system that pulls the latest extensions from GitHub but protects local modifications in development mode (`!app.isPackaged`).
*   **Clear Data Persistence**: Ensured the "Clear Data" feature purges all internal memory (Stage 2 queue) and syncs with the physical storage file.

---
**XPIDER Browser Project - Engineering Log**
Generated on: 2026-04-29
