package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// ExtensionMeta describes an installed unpacked extension and its UI entry points.
type ExtensionMeta struct {
	Index       int    `json:"index"`
	DirName     string `json:"dir_name"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	ID          string `json:"id"`
	SidePanelUI string `json:"side_panel_ui,omitempty"`
	PopupUI     string `json:"popup_ui,omitempty"`
	PreferredUI string `json:"preferred_ui"`
	HasUI       bool   `json:"has_ui"`
	FullPath    string `json:"full_path"`
}

// PanelTarget represents an active companion tool window / side panel target reported by CDP.
type PanelTarget struct {
	ID                  string `json:"id"`
	Title               string `json:"title"`
	Type                string `json:"type"`
	URL                 string `json:"url"`
	ExtensionID         string `json:"extension_id,omitempty"`
	PanelID             string `json:"panel_id,omitempty"`
	DevtoolsFrontendURL string `json:"devtoolsFrontendUrl,omitempty"`
}

// computeExtensionID computes the 32-character Chrome extension ID.
// If the manifest specifies a public key, it uses the first 16 bytes of sha256(decodedKey).
// Otherwise, it computes a fallback deterministic ID from the folder path.
func computeExtensionID(keyBase64, dirPath string) string {
	var raw []byte
	if keyBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(keyBase64)
		if err == nil && len(decoded) > 0 {
			h := sha256.Sum256(decoded)
			raw = h[:16]
		}
	}
	if len(raw) == 0 {
		clean := strings.ToLower(filepath.Clean(dirPath))
		h := sha256.Sum256([]byte(clean))
		raw = h[:16]
	}
	var b strings.Builder
	for _, by := range raw {
		b.WriteByte('a' + (by >> 4))
		b.WriteByte('a' + (by & 0x0f))
	}
	return b.String()
}

// getInstanceCDPPort returns the dedicated CDP port for the given instance (e.g. 9222 for instance 1).
func getInstanceCDPPort(instanceID int) int {
	return 9221 + instanceID
}

// DiscoverInstalledExtensions scans extsDir and parses manifests for all active extensions.
func DiscoverInstalledExtensions(extsDir string, liveIDs map[string]string) ([]ExtensionMeta, error) {
	entries, err := os.ReadDir(extsDir)
	if err != nil {
		return nil, fmt.Errorf("read extensions dir %s: %w", extsDir, err)
	}

	var exts []ExtensionMeta
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") || strings.HasPrefix(entry.Name(), "_") ||
			entry.Name() == "incoming" || entry.Name() == ".staging" || entry.Name() == ".backups" {
			continue
		}

		manifestPath := filepath.Join(extsDir, entry.Name(), "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var rawMap map[string]interface{}
		if err := json.Unmarshal(data, &rawMap); err != nil {
			continue
		}

		name, _ := rawMap["name"].(string)
		version, _ := rawMap["version"].(string)
		key, _ := rawMap["key"].(string)

		var sidePanelUI string
		if sp, ok := rawMap["side_panel"].(map[string]interface{}); ok {
			if defPath, ok := sp["default_path"].(string); ok {
				sidePanelUI = defPath
			}
		}

		var popupUI string
		if act, ok := rawMap["action"].(map[string]interface{}); ok {
			if defPop, ok := act["default_popup"].(string); ok {
				popupUI = defPop
			}
		}

		extID := computeExtensionID(key, filepath.Join(extsDir, entry.Name()))
		// If live mapping contains a known ID, prefer it
		if liveIDs != nil {
			if mapped, ok := liveIDs[entry.Name()]; ok && mapped != "" {
				extID = mapped
			}
		}

		prefUI := "none"
		hasUI := false
		if sidePanelUI != "" {
			prefUI = sidePanelUI
			hasUI = true
		} else if popupUI != "" {
			prefUI = popupUI
			hasUI = true
		}

		exts = append(exts, ExtensionMeta{
			DirName:     entry.Name(),
			Name:        name,
			Version:     version,
			ID:          extID,
			SidePanelUI: sidePanelUI,
			PopupUI:     popupUI,
			PreferredUI: prefUI,
			HasUI:       hasUI,
			FullPath:    filepath.Join(extsDir, entry.Name()),
		})
	}

	sort.Slice(exts, func(i, j int) bool {
		return strings.ToLower(exts[i].Name) < strings.ToLower(exts[j].Name)
	})

	for i := range exts {
		exts[i].Index = i + 1
	}

	return exts, nil
}

// QueryLiveExtensionIDs queries the running browser's CDP targets to discover active extension IDs.
func QueryLiveExtensionIDs(port int) map[string]string {
	ids := make(map[string]string)
	client := http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/list", port))
	if err != nil {
		return ids
	}
	defer resp.Body.Close()

	var targets []PanelTarget
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return ids
	}

	for _, t := range targets {
		if strings.HasPrefix(t.URL, "chrome-extension://") {
			u, err := url.Parse(t.URL)
			if err == nil && u.Host != "" {
				ids[u.Host] = u.Host
			}
		}
	}
	return ids
}

// ListActivePanels retrieves all open companion panel and page targets from the browser via CDP.
func ListActivePanels(port int) ([]PanelTarget, error) {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/list", port))
	if err != nil {
		return nil, fmt.Errorf("CDP connection to port %d failed: %w", port, err)
	}
	defer resp.Body.Close()

	var targets []PanelTarget
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return nil, fmt.Errorf("failed to decode CDP targets: %w", err)
	}

	var panels []PanelTarget
	for _, t := range targets {
		if t.Type == "page" && strings.HasPrefix(t.URL, "chrome-extension://") {
			u, err := url.Parse(t.URL)
			if err == nil {
				t.ExtensionID = u.Host
				t.PanelID = u.Query().Get("panel_id")
				if t.PanelID == "" {
					t.PanelID = u.Fragment
				}
			}
			panels = append(panels, t)
		}
	}
	return panels, nil
}

// LaunchCompanionPanel opens a new companion tool window for an extension in the specified instance.
func LaunchCompanionPanel(engineExe, appRoot string, instanceID int, extIndexOrName string, uiMode string, cloneID string) (*PanelTarget, error) {
	port := getInstanceCDPPort(instanceID)
	client := http.Client{Timeout: 2 * time.Second}
	_, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
	isWarm := (err == nil)

	extsDir := filepath.Join(appRoot, "extensions")
	liveIDs := QueryLiveExtensionIDs(port)
	exts, err := DiscoverInstalledExtensions(extsDir, liveIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to discover extensions: %w", err)
	}

	var targetExt *ExtensionMeta
	for i := range exts {
		if fmt.Sprintf("%d", exts[i].Index) == extIndexOrName ||
			strings.EqualFold(exts[i].DirName, extIndexOrName) ||
			strings.EqualFold(exts[i].ID, extIndexOrName) ||
			strings.Contains(strings.ToLower(exts[i].Name), strings.ToLower(extIndexOrName)) {
			targetExt = &exts[i]
			break
		}
	}
	if targetExt == nil {
		return nil, fmt.Errorf("no matching extension found for %q", extIndexOrName)
	}
	if !targetExt.HasUI {
		return nil, fmt.Errorf("extension %q (%s) has no UI (sidepanel or popup) defined in manifest.json", targetExt.Name, targetExt.DirName)
	}

	uiPath := targetExt.PreferredUI
	if uiMode == "popup" && targetExt.PopupUI != "" {
		uiPath = targetExt.PopupUI
	} else if uiMode == "sidepanel" && targetExt.SidePanelUI != "" {
		uiPath = targetExt.SidePanelUI
	}

	if cloneID == "" {
		cloneID = fmt.Sprintf("p%d", time.Now().Unix()%100000)
	}
	panelURL := fmt.Sprintf("chrome-extension://%s/%s?panel_id=%s", targetExt.ID, uiPath, cloneID)

	logger := getLogger()
	logger.Log(LevelInfo, "PANEL_LAUNCH_REQUEST", fmt.Sprintf("Launching panel for %s (panel_id: %s)", targetExt.Name, cloneID), instanceID, 0, "", "", nil, map[string]interface{}{
		"extension":    targetExt.Name,
		"extension_id": targetExt.ID,
		"ui_path":      uiPath,
		"panel_id":     cloneID,
		"url":          panelURL,
		"warm_start":   isWarm,
	})

	if !isWarm {
		profileDir := filepath.Join(appRoot, "data", "profiles", fmt.Sprintf("instance-%d", instanceID))
		registryFile := filepath.Join(appRoot, "data", "instances.json")
		lockFile := filepath.Join(appRoot, "data", "instances.lock")
		loadedExts := discoverInstanceExtensions(extsDir, profileDir)
		err := launchInstanceWithApp(engineExe, profileDir, instanceID, loadedExts, "about:blank", "", registryFile, lockFile)
		if err != nil {
			return nil, fmt.Errorf("cold start failed: %w", err)
		}

		ready := false
		for attempt := 0; attempt < 50; attempt++ {
			time.Sleep(200 * time.Millisecond)
			if _, chkErr := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port)); chkErr == nil {
				ready = true
				break
			}
		}
		if !ready {
			return nil, fmt.Errorf("browser started but CDP port %d did not respond within 10s", port)
		}
	}

	req, err := http.NewRequest(http.MethodPut, fmt.Sprintf("http://127.0.0.1:%d/json/new?%s", port, url.QueryEscape(panelURL)), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create CDP request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("CDP /json/new failed: %w", err)
	}
	defer resp.Body.Close()

	var created PanelTarget
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		return nil, fmt.Errorf("failed to decode created target: %w", err)
	}
	created.ExtensionID = targetExt.ID
	created.PanelID = cloneID

	// Poll /json/list to verify target is active and document title is loaded
	for attempt := 0; attempt < 25; attempt++ {
		time.Sleep(200 * time.Millisecond)
		panels, _ := ListActivePanels(port)
		for _, p := range panels {
			if p.ID == created.ID {
				created.Title = p.Title
				break
			}
		}
		if created.Title != "" {
			break
		}
	}

	logger.Log(LevelInfo, "PANEL_LAUNCH_SUCCESS", fmt.Sprintf("Panel %s launched successfully [Target ID: %s]", cloneID, created.ID), instanceID, 0, "", "", nil, map[string]interface{}{
		"target_id":    created.ID,
		"extension":    targetExt.Name,
		"extension_id": targetExt.ID,
		"panel_id":     cloneID,
		"url":          created.URL,
		"title":        created.Title,
	})
	return &created, nil
}

// CloseCompanionPanel terminates a specific companion panel by target ID via CDP.
func CloseCompanionPanel(instanceID int, targetID string) error {
	port := getInstanceCDPPort(instanceID)
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/close/%s", port, targetID))
	if err != nil {
		return fmt.Errorf("CDP /json/close failed: %w", err)
	}
	defer resp.Body.Close()

	time.Sleep(200 * time.Millisecond)
	panels, _ := ListActivePanels(port)
	for _, p := range panels {
		if p.ID == targetID {
			return fmt.Errorf("target %s did not close", targetID)
		}
	}

	logger := getLogger()
	logger.Log(LevelInfo, "PANEL_CLOSE_SUCCESS", fmt.Sprintf("Panel target %s closed successfully", targetID), instanceID, 0, "", "", nil, map[string]interface{}{
		"target_id": targetID,
	})
	return nil
}

// FormatExtensionsTable renders human-readable table of installed extensions.
func FormatExtensionsTable(exts []ExtensionMeta) string {
	var b strings.Builder
	b.WriteString("==============================================================================\n")
	b.WriteString("[Lite Chromium Portable] 설치된 확장 프로그램 목록 및 UI 엔트리포인트\n")
	b.WriteString("==============================================================================\n\n")
	b.WriteString(fmt.Sprintf("%-4s %-32s %-18s %s\n", "번호", "확장 프로그램 이름", "지원 UI", "폴더명 / ID"))
	b.WriteString(strings.Repeat("-", 78) + "\n")

	for _, ext := range exts {
		uiDesc := "없음 (Service Worker)"
		if ext.SidePanelUI != "" && ext.PopupUI != "" {
			uiDesc = "사이드패널 / 팝업"
		} else if ext.SidePanelUI != "" {
			uiDesc = "사이드패널"
		} else if ext.PopupUI != "" {
			uiDesc = "팝업 (Popup)"
		}

		b.WriteString(fmt.Sprintf("[%2d] %-30s %-16s %s\n", ext.Index, ext.Name, uiDesc, ext.DirName))
	}
	b.WriteString("\n")
	return b.String()
}

// FormatPanelsTable renders human-readable table of active companion panels.
func FormatPanelsTable(panels []PanelTarget, instanceID int) string {
	var b strings.Builder
	b.WriteString("==============================================================================\n")
	b.WriteString(fmt.Sprintf("[Lite Chromium Portable] 인스턴스 #%d 활성 보조 도구창(패널) 목록 (CDP Port: %d)\n", instanceID, getInstanceCDPPort(instanceID)))
	b.WriteString("==============================================================================\n\n")

	if len(panels) == 0 {
		b.WriteString("현재 실행 중인 보조 도구창(확장 패널)이 없습니다.\n\n")
		return b.String()
	}

	b.WriteString(fmt.Sprintf("%-8s %-32s %-34s %s\n", "패널ID", "창 제목 (Title)", "Target ID", "URL"))
	b.WriteString(strings.Repeat("-", 90) + "\n")

	for _, p := range panels {
		pid := p.PanelID
		if pid == "" {
			pid = "-"
		}
		title := p.Title
		if len(title) > 30 {
			title = title[:27] + "..."
		}
		b.WriteString(fmt.Sprintf("%-8s %-32s %-34s %s\n", pid, title, p.ID, p.URL))
	}
	b.WriteString("\n")
	return b.String()
}
