package shell

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/haiphen/haiphen-cli/internal/acl"
	"github.com/haiphen/haiphen-cli/internal/auth"
	"github.com/haiphen/haiphen-cli/internal/broker"
	_ "github.com/haiphen/haiphen-cli/internal/broker/alpaca"
	"github.com/haiphen/haiphen-cli/internal/brokerstore"
	"github.com/haiphen/haiphen-cli/internal/config"
	"github.com/haiphen/haiphen-cli/internal/signal"
	"github.com/haiphen/haiphen-cli/internal/store"
	"github.com/haiphen/haiphen-cli/internal/util"
)

// CheckAuth loads the token, resolves the role, and updates state.
// Errors are silently swallowed (state reflects "not logged in").
func CheckAuth(cfg *config.Config, st store.Store, aclClient *acl.Client, state *State) {
	tok, err := st.LoadToken()
	if err != nil || tok == nil || strings.TrimSpace(tok.AccessToken) == "" {
		state.Set(KeyLoggedIn, false)
		return
	}

	state.Set(KeyLoggedIn, true)

	role, err := aclClient.ResolveRole(tok.AccessToken)
	if err != nil {
		return
	}

	state.Set(KeyEmail, role.Email)
	state.Set(KeyPlan, role.Plan)
	state.Set(KeyRole, role.Role)
	state.Set(KeyEntitled, role.Entitled)

	// Extract user from email
	if role.Email != "" {
		state.Set(KeyUser, role.Email)
	}
}

// RunLogin opens the browser OAuth flow, stores the token, and updates state.
func RunLogin(ctx context.Context, cfg *config.Config, st store.Store, aclClient *acl.Client, state *State) error {
	a := auth.New(cfg, st)
	tok, err := a.Login(ctx, auth.LoginOptions{Force: false})
	if err != nil {
		return err
	}

	state.Set(KeyLoggedIn, true)

	role, err := aclClient.ResolveRole(tok.AccessToken)
	if err != nil {
		// Login succeeded but role resolution failed — still logged in
		return nil
	}

	state.Set(KeyEmail, role.Email)
	state.Set(KeyUser, role.Email)
	state.Set(KeyPlan, role.Plan)
	state.Set(KeyRole, role.Role)
	state.Set(KeyEntitled, role.Entitled)

	return nil
}

// CheckBroker probes the brokerstore for saved credentials and updates state.
func CheckBroker(cfg *config.Config, state *State) {
	bs, err := brokerstore.New(cfg.Profile)
	if err != nil {
		return
	}
	if !bs.Exists("alpaca") {
		state.Set(KeyBrokerOK, false)
		return
	}

	state.Set(KeyBrokerOK, true)
	state.Set(KeyBrokerName, "alpaca")
}

// ConnectBroker loads credentials and returns a connected broker.
func ConnectBroker(ctx context.Context, cfg *config.Config) (broker.Broker, error) {
	bs, err := brokerstore.New(cfg.Profile)
	if err != nil {
		return nil, err
	}
	creds, err := bs.Load("alpaca")
	if err != nil {
		return nil, err
	}
	if creds == nil {
		return nil, fmt.Errorf("no broker configured; run broker init first")
	}

	b, err := broker.New("alpaca", creds.APIKey, creds.APISecret)
	if err != nil {
		return nil, err
	}
	if err := b.Connect(ctx); err != nil {
		return nil, err
	}
	return b, nil
}

// CheckDaemon reads the signal PID file and updates state.
func CheckDaemon(cfg *config.Config, state *State) {
	pid, running := signal.IsRunning(cfg.Profile)
	if running {
		state.Set(KeyDaemonPID, pid)
	} else {
		state.Set(KeyDaemonPID, 0)
	}

	// Count rules
	dir, err := signal.SignalsDir(cfg.Profile)
	if err != nil {
		return
	}
	rules, err := signal.LoadRulesFromDir(dir)
	if err != nil {
		return
	}
	state.Set(KeyRuleCount, len(rules))
}

// ---- Prospect action response types ----

// TargetSummary is a row from GET /v1/prospect/targets.
type TargetSummary struct {
	TargetID           string `json:"target_id"`
	Name               string `json:"name"`
	Ticker             string `json:"ticker"`
	Sector             string `json:"sector"`
	Industry           string `json:"industry"`
	Domains            string `json:"domains,omitempty"`   // JSON array string
	LeadCount          int    `json:"lead_count"`          // enriched by count query
	InvestigationCount int    `json:"investigation_count"` // enriched by count query
}

// LeadSummary is a row from GET /v1/prospect/leads.
type LeadSummary struct {
	LeadID     string  `json:"lead_id"`
	Entity     string  `json:"entity_name"`
	CVSS       float64 `json:"cvss_score"`
	Severity   string  `json:"severity"`
	SignalType string  `json:"signal_type"`
	TargetID   string  `json:"target_id,omitempty"`
}

// CrawlResult is returned by POST /v1/prospect/targets/:id/crawl.
type CrawlResult struct {
	LeadsCreated int         `json:"leads_found"`
	TargetID     string      `json:"target_id"`
	TargetName   string      `json:"target_name"`
	Leads        []CrawlLead `json:"leads,omitempty"`
}

// CrawlLead is a single lead returned in the crawl response.
type CrawlLead struct {
	LeadID          string `json:"lead_id"`
	SourceID        string `json:"source_id"`
	Severity        string `json:"severity"`
	EntityName      string `json:"entity_name"`
	VulnerabilityID string `json:"vulnerability_id"`
}

// AnalysisResult is returned by POST /v1/prospect/leads/:id/investigate.
type AnalysisResult struct {
	InvestigationID string        `json:"investigation_id"`
	LeadID          string        `json:"lead_id"`
	Score           float64       `json:"aggregate_score"`
	ClaudeSummary   *SynthSummary `json:"claude_summary,omitempty"`
	Steps           []StepScore   `json:"steps,omitempty"`
}

// SynthSummary holds the deterministic synthesis output.
type SynthSummary struct {
	Summary         string   `json:"summary"`
	Impact          string   `json:"impact"`
	Recommendations []string `json:"recommendations"`
	DataGaps        []string `json:"data_gaps,omitempty"`
}

// StepScore is a single pipeline service step result.
type StepScore struct {
	Service        string   `json:"service"`
	Score          *float64 `json:"score"`
	Findings       []string `json:"findings"`
	Recommendation string   `json:"recommendation"`
	DurationMs     int      `json:"duration_ms"`
	Status         string   `json:"status"`
}

// CredentialInfo represents a configured credential provider.
type CredentialInfo struct {
	Provider  string `json:"provider"`
	Label     string `json:"label"`
	UpdatedAt string `json:"updated_at"`
}

// OutreachDraft is returned by POST /v1/prospect/leads/:id/outreach.
type OutreachDraft struct {
	OutreachID string `json:"outreach_id"`
	LeadID     string `json:"lead_id"`
	Subject    string `json:"subject"`
	BodyText   string `json:"body_text"`
	Status     string `json:"status"`
}

// FetchTargets returns prospect targets with optional filters.
func FetchTargets(ctx context.Context, cfg *config.Config, token string, sector string, limit int) ([]TargetSummary, error) {
	path := "/v1/prospect/targets?"
	if sector != "" {
		path += "sector=" + sector + "&"
	}
	if limit > 0 {
		path += fmt.Sprintf("limit=%d", limit)
	}
	data, err := util.ServiceGet(ctx, cfg.APIOrigin, path, token)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Items []TargetSummary `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Items, nil
}

// FetchLeads returns prospect leads with optional target filter.
func FetchLeads(ctx context.Context, cfg *config.Config, token string, targetID string, limit int) ([]LeadSummary, error) {
	path := "/v1/prospect/leads?"
	if targetID != "" {
		path += "target_id=" + targetID + "&"
	}
	if limit > 0 {
		path += fmt.Sprintf("limit=%d", limit)
	}
	data, err := util.ServiceGet(ctx, cfg.APIOrigin, path, token)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Items []LeadSummary `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Items, nil
}

// TriggerCrawl starts a targeted crawl for a prospect target.
func TriggerCrawl(ctx context.Context, cfg *config.Config, token string, targetID string) (*CrawlResult, error) {
	path := fmt.Sprintf("/v1/prospect/targets/%s/crawl", targetID)
	data, err := util.ServicePost(ctx, cfg.APIOrigin, path, token, nil)
	if err != nil {
		return nil, err
	}
	var result CrawlResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// TriggerAnalysis runs the full investigation pipeline (6-service sequential
// pipeline + deterministic synthesis) on a lead.
func TriggerAnalysis(ctx context.Context, cfg *config.Config, token string, leadID string) (*AnalysisResult, error) {
	path := fmt.Sprintf("/v1/prospect/leads/%s/investigate", leadID)
	data, err := util.ServicePost(ctx, cfg.APIOrigin, path, token, nil)
	if err != nil {
		return nil, err
	}
	var result AnalysisResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// FetchReport fetches a LaTeX report for a prospect target.
func FetchReport(ctx context.Context, cfg *config.Config, token string, targetID string) ([]byte, error) {
	path := fmt.Sprintf("/v1/prospect/targets/%s/report?format=latex", targetID)
	return util.ServiceGet(ctx, cfg.APIOrigin, path, token)
}

// SetCredential stores a crawler credential via the API.
func SetCredential(ctx context.Context, cfg *config.Config, token string, provider string, value string) error {
	path := fmt.Sprintf("/v1/prospect/credentials/%s", provider)
	_, err := util.ServicePut(ctx, cfg.APIOrigin, path, token, map[string]string{
		"api_key": value,
	})
	return err
}

// FetchCredentials returns the list of configured credentials.
func FetchCredentials(ctx context.Context, cfg *config.Config, token string) ([]CredentialInfo, error) {
	data, err := util.ServiceGet(ctx, cfg.APIOrigin, "/v1/prospect/credentials", token)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Items []CredentialInfo `json:"items"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Items, nil
}

// DraftOutreach creates an outreach draft for a prospect lead.
func DraftOutreach(ctx context.Context, cfg *config.Config, token string, leadID string) (*OutreachDraft, error) {
	path := fmt.Sprintf("/v1/prospect/leads/%s/outreach", leadID)
	data, err := util.ServicePost(ctx, cfg.APIOrigin, path, token, nil)
	if err != nil {
		return nil, err
	}
	var draft OutreachDraft
	if err := json.Unmarshal(data, &draft); err != nil {
		return nil, err
	}
	return &draft, nil
}

// ApproveOutreach approves a draft outreach for sending.
func ApproveOutreach(ctx context.Context, cfg *config.Config, token string, leadID string) error {
	path := fmt.Sprintf("/v1/prospect/leads/%s/outreach/approve", leadID)
	_, err := util.ServicePost(ctx, cfg.APIOrigin, path, token, nil)
	return err
}

// ServiceStatus holds health probe results.
type ServiceStatus struct {
	Name   string
	Origin string
	OK     bool
	Ms     int64
	Error  string
}

// CheckServices runs concurrent health probes against all platform services.
func CheckServices(ctx context.Context, cfg *config.Config) ([]ServiceStatus, error) {
	services := []struct {
		name   string
		origin string
	}{
		{"api", cfg.APIOrigin},
		{"secure", cfg.SecureOrigin},
		{"network", cfg.NetworkOrigin},
		{"graph", cfg.GraphOrigin},
		{"risk", cfg.RiskOrigin},
		{"causal", cfg.CausalOrigin},
		{"supply", cfg.SupplyOrigin},
	}

	results := make([]ServiceStatus, len(services))
	var wg sync.WaitGroup
	for i, svc := range services {
		wg.Add(1)
		go func(idx int, name, origin string) {
			defer wg.Done()
			start := time.Now()
			_, err := util.ServiceGet(ctx, origin, "/v1/health", "")
			ms := time.Since(start).Milliseconds()
			r := ServiceStatus{Name: name, Origin: origin, Ms: ms}
			if err != nil {
				r.Error = err.Error()
			} else {
				r.OK = true
			}
			results[idx] = r
		}(i, svc.name, svc.origin)
	}
	wg.Wait()

	return results, nil
}
