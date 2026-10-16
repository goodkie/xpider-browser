package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
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
	Enabled     bool   `json:"enabled"`
	LiveActive  bool   `json:"live_active"`
}

// PanelTarget represents an active companion tool window target reported by CDP.
type PanelTarget struct {
	ID                  string `json:"id"`
	WindowID            int64  `json:"window_id,omitempty"`
	Title               string `json:"title"`
	Type                string `json:"type"`
	URL                 string `json:"url"`
	ExtensionID         string `json:"extension_id,omitempty"`
	PanelID             string `json:"panel_id,omitempty"`
	DevtoolsFrontendURL string `json:"devtoolsFrontendUrl,omitempty"`
}

var (
	panelSeqCounter uint64
	panelSeqMu      sync.Mutex
)

// generateUniquePanelID creates a collision-free unique panel ID.
func generateUniquePanelID() string {
	panelSeqMu.Lock()
	panelSeqCounter++
	seq := panelSeqCounter
	panelSeqMu.Unlock()

	r, _ := rand.Int(rand.Reader, big.NewInt(100000))
	return fmt.Sprintf("p_%d_%d_%d", time.Now().UnixNano()%100000000, seq, r.Int64())
}

// computeExtensionID computes the 32-character Chrome extension ID.
// If the manifest specifies a public key, it uses the first 16 bytes of sha256(decodedKey).
// Otherwise, it computes the exact Chromium-compatible ID using the UTF-16LE wide-character path bytes.
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
		absPath, err := filepath.Abs(dirPath)
		if err != nil {
			absPath = dirPath
		}
		// On Windows, Chromium's crx_file::id_util::GenerateIdForPath hashes base::FilePath::value(),
		// which is a std::wstring (UTF-16LE).
		runes := utf16.Encode([]rune(absPath))
		buf := make([]byte, len(runes)*2)
		for i, r := range runes {
			buf[i*2] = byte(r)
			buf[i*2+1] = byte(r >> 8)
		}
		h := sha256.Sum256(buf)
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

// CDPClient is a lightweight, zero-dependency RFC 6455 WebSocket client for CDP commands.
type CDPClient struct {
	conn  net.Conn
	msgID int
	mu    sync.Mutex
}

// ConnectCDP opens a WebSocket connection to the browser-level CDP endpoint.
func ConnectCDP(wsURLStr string) (*CDPClient, error) {
	u, err := url.Parse(wsURLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid websocket url: %w", err)
	}
	conn, err := net.DialTimeout("tcp", u.Host, 4*time.Second)
	if err != nil {
		return nil, fmt.Errorf("dial websocket %s: %w", u.Host, err)
	}

	key := make([]byte, 16)
	_, _ = rand.Read(key)
	secKey := base64.StdEncoding.EncodeToString(key)

	req := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n",
		u.RequestURI(), u.Host, secKey)
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, fmt.Errorf("write websocket upgrade: %w", err)
	}

	buf := make([]byte, 2048)
	n, err := conn.Read(buf)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("read websocket upgrade response: %w", err)
	}
	resp := string(buf[:n])
	if !strings.Contains(resp, "101") {
		conn.Close()
		return nil, fmt.Errorf("websocket handshake failed: %s", resp)
	}

	return &CDPClient{conn: conn}, nil
}

// Close closes the underlying network connection.
func (c *CDPClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Send sends a masked RFC 6455 client-to-server text frame.
func (c *CDPClient) Send(payload []byte) error {
	var frame []byte
	frame = append(frame, 0x81) // FIN + text opcode

	l := len(payload)
	var maskKey [4]byte
	_, _ = rand.Read(maskKey[:])

	if l < 126 {
		frame = append(frame, 0x80|byte(l))
	} else if l <= 65535 {
		frame = append(frame, 0x80|126)
		frame = append(frame, byte(l>>8), byte(l&0xff))
	} else {
		frame = append(frame, 0x80|127)
		b := make([]byte, 8)
		binary.BigEndian.PutUint64(b, uint64(l))
		frame = append(frame, b...)
	}

	frame = append(frame, maskKey[:]...)
	masked := make([]byte, l)
	for i := 0; i < l; i++ {
		masked[i] = payload[i] ^ maskKey[i%4]
	}
	frame = append(frame, masked...)

	_, err := c.conn.Write(frame)
	return err
}

// Read reads an unmasked RFC 6455 server-to-client frame.
func (c *CDPClient) Read() ([]byte, error) {
	c.conn.SetReadDeadline(time.Now().Add(6 * time.Second))
	header := make([]byte, 2)
	if _, err := io.ReadFull(c.conn, header); err != nil {
		return nil, err
	}
	length := int(header[1] & 0x7f)
	if length == 126 {
		lenBytes := make([]byte, 2)
		if _, err := io.ReadFull(c.conn, lenBytes); err != nil {
			return nil, err
		}
		length = int(binary.BigEndian.Uint16(lenBytes))
	} else if length == 127 {
		lenBytes := make([]byte, 8)
		if _, err := io.ReadFull(c.conn, lenBytes); err != nil {
			return nil, err
		}
		length = int(binary.BigEndian.Uint64(lenBytes))
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(c.conn, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

// Call executes a CDP command on the root browser target.
func (c *CDPClient) Call(method string, params map[string]interface{}) (map[string]interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.msgID++
	reqID := c.msgID
	reqMap := map[string]interface{}{
		"id":     reqID,
		"method": method,
		"params": params,
	}
	data, _ := json.Marshal(reqMap)
	if err := c.Send(data); err != nil {
		return nil, err
	}

	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		msgBytes, err := c.Read()
		if err != nil {
			return nil, err
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(msgBytes, &resp); err == nil {
			if idVal, ok := resp["id"].(float64); ok && int(idVal) == reqID {
				if errObj, ok := resp["error"].(map[string]interface{}); ok {
					return nil, fmt.Errorf("CDP error %v: %v", errObj["code"], errObj["message"])
				}
				if resObj, ok := resp["result"].(map[string]interface{}); ok {
					return resObj, nil
				}
				return resp, nil
			}
		}
	}
	return nil, fmt.Errorf("CDP call %s timed out waiting for id %d", method, reqID)
}

// CallSession executes a CDP command targeted to an attached target session.
func (c *CDPClient) CallSession(sessionID, method string, params map[string]interface{}) (map[string]interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.msgID++
	reqID := c.msgID
	reqMap := map[string]interface{}{
		"id":        reqID,
		"sessionId": sessionID,
		"method":    method,
		"params":    params,
	}
	data, _ := json.Marshal(reqMap)
	if err := c.Send(data); err != nil {
		return nil, err
	}

	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		msgBytes, err := c.Read()
		if err != nil {
			return nil, err
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(msgBytes, &resp); err == nil {
			if idVal, ok := resp["id"].(float64); ok && int(idVal) == reqID {
				if errObj, ok := resp["error"].(map[string]interface{}); ok {
					return nil, fmt.Errorf("CDP session error %v: %v", errObj["code"], errObj["message"])
				}
				if resObj, ok := resp["result"].(map[string]interface{}); ok {
					return resObj, nil
				}
				return resp, nil
			}
		}
	}
	return nil, fmt.Errorf("CDP session call %s timed out waiting for id %d", method, reqID)
}

// QueryLiveExtensionIDs queries the running browser's CDP targets to discover active extension IDs and titles.
func QueryLiveExtensionIDs(port int) (map[string]string, error) {
	ids := make(map[string]string)
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/list", port))
	if err != nil {
		return ids, fmt.Errorf("failed to query /json/list on port %d: %w", port, err)
	}
	defer resp.Body.Close()

	var targets []PanelTarget
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return ids, fmt.Errorf("failed to decode /json/list: %w", err)
	}

	for _, t := range targets {
		if strings.HasPrefix(t.URL, "chrome-extension://") {
			u, err := url.Parse(t.URL)
			if err == nil && u.Host != "" {
				extID := strings.ToLower(u.Host)
				ids[extID] = extID
				if t.Title != "" {
					ids[strings.ToLower(strings.TrimSpace(t.Title))] = extID
				}
			}
		}
	}
	return ids, nil
}

// DiscoverInstalledExtensions scans extsDir and parses manifests for active and installed extensions.
func DiscoverInstalledExtensions(extsDir string, liveIDs map[string]string, profileDir string) ([]ExtensionMeta, error) {
	entries, err := os.ReadDir(extsDir)
	if err != nil {
		return nil, fmt.Errorf("read extensions dir %s: %w", extsDir, err)
	}

	disabledMap := make(map[string]bool)
	var enabledList []string
	if profileDir != "" {
		cfgFile := filepath.Join(profileDir, "extensions_config.json")
		if data, err := os.ReadFile(cfgFile); err == nil {
			var cfg InstanceExtensionConfig
			if err := json.Unmarshal(data, &cfg); err == nil {
				for _, d := range cfg.DisabledExtensions {
					disabledMap[strings.ToLower(d)] = true
				}
				enabledList = cfg.EnabledExtensions
			}
		}
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

		fullPath, _ := filepath.Abs(filepath.Join(extsDir, entry.Name()))
		extID := computeExtensionID(key, fullPath)

		// Cross-reference live targets by ID, manifest name, or directory name
		isLive := false
		if liveIDs != nil {
			if mapped, ok := liveIDs[extID]; ok && mapped != "" {
				isLive = true
			} else if mapped, ok := liveIDs[strings.ToLower(strings.TrimSpace(name))]; ok && mapped != "" {
				extID = mapped
				isLive = true
			} else if mapped, ok := liveIDs[strings.ToLower(entry.Name())]; ok && mapped != "" {
				extID = mapped
				isLive = true
			}
		}

		isEnabled := true
		lowerDir := strings.ToLower(entry.Name())
		if disabledMap[lowerDir] {
			isEnabled = false
		} else if enabledList != nil {
			found := false
			for _, e := range enabledList {
				if strings.ToLower(e) == lowerDir {
					found = true
					break
				}
			}
			isEnabled = found
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
			FullPath:    fullPath,
			Enabled:     isEnabled,
			LiveActive:  isLive,
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

// ListActivePanels retrieves all open companion panel targets from the browser via CDP.
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

// verifyInstanceOwnership verifies that the port corresponds to the registered instance process.
func verifyInstanceOwnership(instanceID int, port int, registryFile string) error {
	client := http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
	if err != nil {
		// Port not responding: cold start is permitted
		return nil
	}
	resp.Body.Close()

	reg, err := readRegistry(registryFile)
	if err != nil {
		return fmt.Errorf("port %d is responding, but instance registry is unreadable: %w", port, err)
	}

	var found *InstanceRecord
	for _, inst := range reg.Instances {
		if inst.InstanceID == instanceID {
			instCopy := inst
			found = &instCopy
			break
		}
	}
	if found == nil {
		return fmt.Errorf("port %d is in use, but instance #%d is not registered in instances.json; refuse to hijack alien process", port, instanceID)
	}

	state, why := verifyOwner(*found)
	if state == ProcStopped {
		return fmt.Errorf("port %d is in use, but registered PID %d for instance #%d is stopped (%s); refuse to control unverified process", port, found.PID, instanceID, why)
	}

	return nil
}

// LaunchCompanionPanel opens a new companion tool window for an extension in the specified instance.
func LaunchCompanionPanel(engineExe, appRoot string, instanceID int, extIndexOrName string, uiMode string, cloneID string) (*PanelTarget, error) {
	port := getInstanceCDPPort(instanceID)
	dataDir := filepath.Join(appRoot, "data")
	profileDir := filepath.Join(dataDir, "profiles", fmt.Sprintf("instance-%d", instanceID))
	registryFile := filepath.Join(dataDir, "instances.json")
	lockFile := filepath.Join(dataDir, "instances.lock")
	extsDir := filepath.Join(appRoot, "extensions")

	// 1. Verify instance ownership before controlling existing port
	if err := verifyInstanceOwnership(instanceID, port, registryFile); err != nil {
		return nil, fmt.Errorf("instance ownership verification failed: %w", err)
	}

	client := http.Client{Timeout: 2 * time.Second}
	verResp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
	isWarm := (err == nil)
	var wsDebuggerURL string

	if isWarm {
		var verData struct {
			WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
		}
		_ = json.NewDecoder(verResp.Body).Decode(&verData)
		verResp.Body.Close()
		wsDebuggerURL = verData.WebSocketDebuggerURL
	}

	// 2. Cold start if not warm
	if !isWarm {
		loadedExts := discoverInstanceExtensions(extsDir, profileDir)
		err := launchInstanceWithApp(engineExe, profileDir, instanceID, loadedExts, "about:blank", "", registryFile, lockFile)
		if err != nil {
			return nil, fmt.Errorf("cold start failed: %w", err)
		}

		ready := false
		for attempt := 0; attempt < 50; attempt++ {
			time.Sleep(200 * time.Millisecond)
			if resp, chkErr := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port)); chkErr == nil {
				var verData struct {
					WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&verData)
				resp.Body.Close()
				if verData.WebSocketDebuggerURL != "" {
					wsDebuggerURL = verData.WebSocketDebuggerURL
					ready = true
					break
				}
			}
		}
		if !ready {
			return nil, fmt.Errorf("browser started but CDP port %d did not respond within 10s", port)
		}
	}

	// 3. Always refresh live extension IDs after engine is confirmed running
	liveIDs, _ := QueryLiveExtensionIDs(port)
	exts, err := DiscoverInstalledExtensions(extsDir, liveIDs, profileDir)
	if err != nil {
		return nil, fmt.Errorf("failed to discover extensions: %w", err)
	}

	var targetExt *ExtensionMeta
	for i := range exts {
		if fmt.Sprintf("%d", exts[i].Index) == extIndexOrName ||
			strings.EqualFold(exts[i].DirName, extIndexOrName) ||
			strings.EqualFold(exts[i].ID, extIndexOrName) ||
			strings.EqualFold(exts[i].Name, extIndexOrName) ||
			strings.Contains(strings.ToLower(exts[i].Name), strings.ToLower(extIndexOrName)) {
			targetExt = &exts[i]
			break
		}
	}
	if targetExt == nil {
		return nil, fmt.Errorf("no matching extension found for %q", extIndexOrName)
	}
	if !targetExt.Enabled {
		return nil, fmt.Errorf("extension %q (%s) is disabled in instance #%d configuration", targetExt.Name, targetExt.DirName, instanceID)
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

	// 4. Generate unique collision-free panel ID
	if cloneID == "" {
		cloneID = generateUniquePanelID()
	}

	// 5. Build URL safely preserving existing query parameters and fragments
	baseRaw := fmt.Sprintf("chrome-extension://%s/%s", targetExt.ID, strings.TrimPrefix(uiPath, "/"))
	parsedURL, err := url.Parse(baseRaw)
	if err != nil {
		return nil, fmt.Errorf("invalid base panel URL %s: %w", baseRaw, err)
	}
	q := parsedURL.Query()
	q.Set("panel_id", cloneID)
	parsedURL.RawQuery = q.Encode()
	panelURL := parsedURL.String()

	logger := getLogger()
	logger.Log(LevelInfo, "PANEL_LAUNCH_REQUEST", fmt.Sprintf("Launching companion tool window for %s (panel_id: %s)", targetExt.Name, cloneID), instanceID, 0, "", "", nil, map[string]interface{}{
		"extension":    targetExt.Name,
		"extension_id": targetExt.ID,
		"ui_path":      uiPath,
		"panel_id":     cloneID,
		"url":          panelURL,
		"warm_start":   isWarm,
	})

	// 6. Connect to Browser CDP WebSocket
	cdpClient, err := ConnectCDP(wsDebuggerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to CDP browser websocket: %w", err)
	}
	defer cdpClient.Close()

	// 7. Explicitly request a new window target: Target.createTarget(newWindow: true)
	createRes, err := cdpClient.Call("Target.createTarget", map[string]interface{}{
		"url":       panelURL,
		"newWindow": true,
	})
	if err != nil {
		return nil, fmt.Errorf("CDP Target.createTarget(newWindow: true) failed: %w", err)
	}
	targetID, _ := createRes["targetId"].(string)
	if targetID == "" {
		return nil, fmt.Errorf("CDP Target.createTarget did not return targetId: %v", createRes)
	}

	// 8. Retrieve and verify actual OS window ID
	var windowID int64
	winRes, err := cdpClient.Call("Browser.getWindowForTarget", map[string]interface{}{
		"targetId": targetID,
	})
	if err == nil {
		if wid, ok := winRes["windowId"].(float64); ok {
			windowID = int64(wid)
		}
	}

	// 9. Attach and verify DOM / extension environment (Fail-Closed)
	attachRes, err := cdpClient.Call("Target.attachToTarget", map[string]interface{}{
		"targetId": targetID,
		"flatten":  true,
	})
	if err != nil {
		_ = closeTarget(port, targetID)
		return nil, fmt.Errorf("failed to attach to created target %s: %w", targetID, err)
	}
	sessionID, _ := attachRes["sessionId"].(string)

	evalExpr := `JSON.stringify({
		readyState: document.readyState,
		runtimeId: (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : null,
		isError: (document.title && document.title.toLowerCase().indexOf('error') >= 0) || (location.href && location.href.indexOf('chrome-error://') >= 0),
		title: document.title,
		url: location.href,
		hasBody: !!document.body
	})`

	verified := false
	var lastTitle string
	var lastErr string

	for attempt := 0; attempt < 32; attempt++ {
		time.Sleep(250 * time.Millisecond)
		evalRes, err := cdpClient.CallSession(sessionID, "Runtime.evaluate", map[string]interface{}{
			"expression":    evalExpr,
			"returnByValue": true,
			"awaitPromise":  true,
		})
		if err != nil {
			lastErr = err.Error()
			continue
		}
		resObj, ok := evalRes["result"].(map[string]interface{})
		if !ok {
			continue
		}
		valStr, ok := resObj["value"].(string)
		if !ok {
			continue
		}

		var health struct {
			ReadyState string `json:"readyState"`
			RuntimeID  string `json:"runtimeId"`
			IsError    bool   `json:"isError"`
			Title      string `json:"title"`
			URL        string `json:"url"`
			HasBody    bool   `json:"hasBody"`
		}
		if err := json.Unmarshal([]byte(valStr), &health); err != nil {
			continue
		}

		lastTitle = health.Title
		if health.IsError {
			lastErr = fmt.Sprintf("loaded error page: title=%q url=%q", health.Title, health.URL)
			break
		}
		if (health.ReadyState == "complete" || health.ReadyState == "interactive") && health.RuntimeID == targetExt.ID && health.HasBody {
			verified = true
			break
		}
	}

	if !verified {
		_ = closeTarget(port, targetID)
		logger.Log(LevelError, "PANEL_LAUNCH_HEALTH_FAIL", fmt.Sprintf("Panel failed health check: %s", lastErr), instanceID, 0, "", "", nil, map[string]interface{}{
			"target_id":    targetID,
			"extension_id": targetExt.ID,
			"last_error":   lastErr,
		})
		return nil, fmt.Errorf("panel window launched but failed health verification (fail-closed): %s", lastErr)
	}

	target := &PanelTarget{
		ID:          targetID,
		WindowID:    windowID,
		Title:       lastTitle,
		Type:        "page",
		URL:         panelURL,
		ExtensionID: targetExt.ID,
		PanelID:     cloneID,
	}

	logger.Log(LevelInfo, "PANEL_LAUNCH_SUCCESS", fmt.Sprintf("Companion tool window %s launched successfully [Target ID: %s, Window ID: %d]", cloneID, targetID, windowID), instanceID, 0, "", "", nil, map[string]interface{}{
		"target_id":    targetID,
		"window_id":    windowID,
		"extension":    targetExt.Name,
		"extension_id": targetExt.ID,
		"panel_id":     cloneID,
		"url":          panelURL,
		"title":        lastTitle,
	})

	return target, nil
}

func closeTarget(port int, targetID string) error {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/close/%s", port, targetID))
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// CloseCompanionPanel terminates a specific companion panel by target ID via CDP, failing closed on errors.
func CloseCompanionPanel(instanceID int, targetID string) error {
	port := getInstanceCDPPort(instanceID)
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/json/version", port))
	if err != nil {
		return fmt.Errorf("instance #%d CDP port %d unreachable: %w", instanceID, port, err)
	}
	resp.Body.Close()

	if err := closeTarget(port, targetID); err != nil {
		return fmt.Errorf("CDP /json/close failed: %w", err)
	}

	time.Sleep(200 * time.Millisecond)
	panels, err := ListActivePanels(port)
	if err != nil {
		return fmt.Errorf("failed to verify panel closure: %w", err)
	}
	for _, p := range panels {
		if p.ID == targetID {
			return fmt.Errorf("target %s did not close and remains active", targetID)
		}
	}

	logger := getLogger()
	logger.Log(LevelInfo, "PANEL_CLOSE_SUCCESS", fmt.Sprintf("Companion panel target %s closed successfully", targetID), instanceID, 0, "", "", nil, map[string]interface{}{
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
	b.WriteString(fmt.Sprintf("%-4s %-28s %-16s %-10s %s\n", "번호", "확장 프로그램 이름", "지원 UI", "상태", "폴더명 / ID"))
	b.WriteString(strings.Repeat("-", 84) + "\n")

	for _, ext := range exts {
		uiDesc := "없음 (Worker)"
		if ext.SidePanelUI != "" && ext.PopupUI != "" {
			uiDesc = "사이드패널/팝업"
		} else if ext.SidePanelUI != "" {
			uiDesc = "사이드패널"
		} else if ext.PopupUI != "" {
			uiDesc = "팝업 (Popup)"
		}

		status := "비활성"
		if ext.Enabled {
			if ext.LiveActive {
				status = "활성(Live)"
			} else {
				status = "활성"
			}
		}

		name := ext.Name
		if len(name) > 26 {
			name = name[:23] + "..."
		}

		b.WriteString(fmt.Sprintf("[%2d] %-26s %-14s %-8s %s (%s)\n", ext.Index, name, uiDesc, status, ext.DirName, ext.ID))
	}
	b.WriteString("\n")
	return b.String()
}

// FormatPanelsTable renders human-readable table of active companion panels.
func FormatPanelsTable(panels []PanelTarget, instanceID int) string {
	var b strings.Builder
	b.WriteString("==============================================================================\n")
	b.WriteString(fmt.Sprintf("[Lite Chromium Portable] 인스턴스 #%d 활성 보조 도구창 목록 (CDP Port: %d)\n", instanceID, getInstanceCDPPort(instanceID)))
	b.WriteString("==============================================================================\n\n")

	if len(panels) == 0 {
		b.WriteString("현재 실행 중인 보조 도구창(확장 패널)이 없습니다.\n\n")
		return b.String()
	}

	b.WriteString(fmt.Sprintf("%-16s %-10s %-28s %-34s %s\n", "패널ID", "윈도우ID", "창 제목 (Title)", "Target ID", "URL"))
	b.WriteString(strings.Repeat("-", 100) + "\n")

	for _, p := range panels {
		pid := p.PanelID
		if pid == "" {
			pid = "-"
		}
		winStr := "-"
		if p.WindowID > 0 {
			winStr = fmt.Sprintf("%d", p.WindowID)
		}
		title := p.Title
		if len(title) > 26 {
			title = title[:23] + "..."
		}
		b.WriteString(fmt.Sprintf("%-16s %-10s %-28s %-34s %s\n", pid, winStr, title, p.ID, p.URL))
	}
	b.WriteString("\n")
	return b.String()
}
