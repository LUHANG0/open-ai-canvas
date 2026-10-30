package hostupdate

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// CustomProfile is trusted host configuration, never supplied by the browser or
// a remote release. Source Compose files and the shared env are read-only inputs.
type CustomProfile struct {
	Format             int      `json:"format"`
	ProjectName        string   `json:"projectName"`
	ProjectDirectory   string   `json:"projectDirectory"`
	ComposeFiles       []string `json:"composeFiles"`
	EnvFile            string   `json:"envFile"`
	CurrentRelease     string   `json:"currentRelease"`
	TargetRelease      string   `json:"targetRelease"`
	WebPublisher       string   `json:"webPublisher,omitempty"`
	WebPublisherSHA256 string   `json:"webPublisherSha256,omitempty"`
}

type CustomComponent struct {
	Image   string `json:"image"`
	Version string `json:"version"`
	Commit  string `json:"commit"`
}

// ID names the deployment as a whole; component versions and commits may differ.
// Image is either a local content ID or a registry reference pinned by digest.
type CustomRelease struct {
	Format     int                        `json:"format"`
	ID         string                     `json:"id"`
	BasedOn    string                     `json:"basedOn,omitempty"`
	Components map[string]CustomComponent `json:"components"`
}

var customID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)
var projectID = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]*$`)
var hexCommit = regexp.MustCompile(`^[a-f0-9]{40}$`)
var hexDigest = regexp.MustCompile(`^[a-f0-9]{64}$`)
var immutableCustomImage = regexp.MustCompile(`^(sha256:[a-f0-9]{64}|[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64})$`)
var customServices = []string{"backend", "web", "yingce-agent"}

func validateCustomProfile(p CustomProfile) error {
	if p.Format != 1 || !projectID.MatchString(p.ProjectName) || len(p.ComposeFiles) == 0 {
		return errors.New("自定义发布合同缺少有效格式、project 或 Compose 文件")
	}
	paths := append([]string{p.ProjectDirectory, p.EnvFile, p.CurrentRelease, p.TargetRelease}, p.ComposeFiles...)
	for _, path := range paths {
		if !filepath.IsAbs(path) || filepath.Clean(path) != path || path == "/" {
			return errors.New("自定义发布合同必须使用明确的绝对路径")
		}
	}
	seen := map[string]bool{}
	for _, path := range p.ComposeFiles {
		if seen[path] {
			return errors.New("自定义发布合同包含重复 Compose")
		}
		seen[path] = true
	}
	if p.CurrentRelease == p.TargetRelease {
		return errors.New("当前发布记录与候选清单必须分开")
	}
	if p.WebPublisher != "" || p.WebPublisherSHA256 != "" {
		if !filepath.IsAbs(p.WebPublisher) || !hexDigest.MatchString(p.WebPublisherSHA256) {
			return errors.New("站点发布适配器需要绝对路径及 SHA-256")
		}
	}
	return nil
}

func validateCustomRelease(r CustomRelease) error {
	if r.Format != 1 || !customID.MatchString(r.ID) || (r.BasedOn != "" && !customID.MatchString(r.BasedOn)) {
		return errors.New("自定义发布清单格式或 ID 无效")
	}
	if len(r.Components) != len(customServices) {
		return errors.New("自定义发布清单必须完整列出 backend、web 与 yingce-agent")
	}
	for _, name := range customServices {
		c, ok := r.Components[name]
		if !ok || !immutableCustomImage.MatchString(c.Image) || !hexCommit.MatchString(c.Commit) || !customID.MatchString(c.Version) {
			return fmt.Errorf("组件 %s 必须包含不可变镜像、独立版本和完整提交", name)
		}
	}
	return nil
}

func readCustomJSON(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("读取自定义发布合同：%w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("自定义发布合同包含多余或超限内容")
	}
	return nil
}

func readCustomRelease(path string) (CustomRelease, error) {
	var r CustomRelease
	if err := readCustomJSON(path, &r); err != nil {
		return r, err
	}
	return r, validateCustomRelease(r)
}

func customHash(value any) string {
	body, _ := json.Marshal(value)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func (m *Manager) customCurrentPath() string {
	return filepath.Join(m.config.StateDir, "custom-current.json")
}

func (m *Manager) currentCustomRelease() (CustomRelease, error) {
	path := m.customCurrentPath()
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		path = m.custom.CurrentRelease
	}
	return readCustomRelease(path)
}

func (m *Manager) customCandidate() (CustomRelease, CustomRelease, error) {
	from, err := m.currentCustomRelease()
	if err != nil {
		return from, CustomRelease{}, err
	}
	to, err := readCustomRelease(m.custom.TargetRelease)
	if err != nil {
		return from, to, err
	}
	if to.ID == from.ID {
		if customHash(to) != customHash(from) {
			return from, to, errors.New("同一发布 ID 的内容发生变化，拒绝覆盖")
		}
	} else if to.BasedOn != from.ID {
		return from, to, errors.New("候选清单不是基于当前发布，请重新制作候选")
	}
	return from, to, nil
}

func (m *Manager) customBlocked() error {
	if err := m.pendingDataRecovery(); err != nil {
		return err
	}
	return m.pendingCustomRecovery()
}

func (m *Manager) checkCustom(_ context.Context) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.customBlocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	if m.state.Operation.Phase.Active() || m.state.Operation.Phase == PhaseManualIntervention {
		return m.customSnapshotLocked(), errors.New("已有发布操作或待人工核对的恢复现场")
	}
	from, to, err := m.customCandidate()
	if err != nil {
		m.state.Operation.Phase = PhaseFailed
		m.state.Operation.Error = safeOperationError(err)
		m.state.CustomTargetHash = ""
		m.state.LatestRelease = nil
		_ = m.saveStateLocked()
		return m.customSnapshotLocked(), err
	}
	m.state.CustomTargetHash = customHash(to)
	m.state.LatestRelease = &Release{Version: to.ID, Name: to.ID, Body: "宿主机已准备的二改发布清单；保留本地配置与独立组件版本。", Components: to.Components}
	m.state.Operation = Operation{Phase: PhaseReady, Logs: []LogEntry{}}
	if from.ID == to.ID {
		m.state.Operation.Phase = PhaseNoUpdate
	}
	m.appendLogLocked(m.state.Operation.Phase, "已核对本机候选清单，不查询或替换为上游 Release")
	if err := m.saveStateLocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	return m.customSnapshotLocked(), nil
}

func (m *Manager) startCustomUpdate(target string) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.customBlocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	if m.state.Operation.Phase.Active() || m.state.Operation.Phase == PhaseManualIntervention {
		return m.customSnapshotLocked(), errors.New("已有发布操作或待人工处理的现场")
	}
	from, to, err := m.customCandidate()
	if err != nil {
		return m.customSnapshotLocked(), err
	}
	if target != to.ID || from.ID == to.ID || m.state.LatestRelease == nil || m.state.LatestRelease.Version != target || m.state.CustomTargetHash != customHash(to) {
		return m.customSnapshotLocked(), errors.New("候选内容与最近一次检查不一致，请重新检查")
	}
	if from.Components["web"] != to.Components["web"] && m.custom.WebPublisher == "" {
		return m.customSnapshotLocked(), errors.New("前端发生变化，但未配置站点 CDN/预加载发布适配器")
	}
	now := time.Now().UTC()
	m.state.Operation = Operation{ID: randomID(), Phase: PhasePreflight, FromVersion: from.ID, TargetVersion: to.ID, StartedAt: &now, Logs: []LogEntry{}}
	if err := m.saveStateLocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	go m.runCustomUpdate(from, to)
	return m.customSnapshotLocked(), nil
}

func (m *Manager) customSnapshotLocked() Status {
	r, err := m.currentCustomRelease()
	checks := []Check{{Key: "custom-profile", Label: "二改发布合同", Status: "passed", Detail: m.custom.ProjectName, Blocking: true}, {Key: "version", Label: "当前发布", Status: "passed", Detail: r.ID, Blocking: true}, {Key: "publication", Label: "站点发布适配器", Status: "pending", Detail: "前端更新必须校验 CDN、预加载与对外资源", Blocking: true}}
	if err != nil {
		checks[1].Status = "failed"
		checks[1].Detail = err.Error()
	}
	if blocked := m.customBlocked(); blocked != nil {
		checks = append(checks, Check{Key: "recovery", Label: "发布恢复现场", Status: "failed", Detail: blocked.Error(), Blocking: true})
	}
	latest := cloneRelease(m.state.LatestRelease)
	return Status{Supported: true, Connected: true, Repository: m.config.Repository, Deployment: "custom-compose-host-updater", CurrentVersion: r.ID, Components: r.Components, LatestRelease: latest, UpdateAvailable: err == nil && latest != nil && latest.Version != r.ID && m.state.CustomTargetHash != "", Checks: checks, LastBackup: cloneBackup(m.state.LastBackup), RollbackVersion: m.state.RollbackVersion, Operation: cloneOperation(m.state.Operation)}
}

func writeCustomFile(path string, value any) error {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".custom-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(append(body, '\n')); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

// config --format json already escapes literal dollars for another Compose
// load. Preserve that representation on disk; unescape only when comparing a
// container's runtime environment/arguments or using its database identity.
func runtimeCustomString(value string) string { return strings.ReplaceAll(value, "$$", "$") }

func runtimeCustomArguments(values []string) []string {
	if values == nil {
		return nil
	}
	result := make([]string, len(values))
	for i, value := range values {
		result[i] = runtimeCustomString(value)
	}
	return result
}

func (m *Manager) renderCustomCompose(r CustomRelease, path string) error {
	if runtime.GOOS != "linux" {
		return errors.New("自定义发布仅支持 Linux 本机 Docker")
	}
	endpoint := os.Getenv("DOCKER_HOST")
	if os.Getenv("DOCKER_CONTEXT") != "" || endpoint == "" {
		body, err := m.dockerOutput("context", "inspect", "--format", "{{json .Endpoints.docker.Host}}")
		if err != nil {
			return err
		}
		if err := json.Unmarshal(body, &endpoint); err != nil {
			return err
		}
	}
	if !strings.HasPrefix(endpoint, "unix:///") {
		return errors.New("自定义发布拒绝远程 Docker 连接")
	}
	args := []string{"compose", "--project-name", m.custom.ProjectName, "--project-directory", m.custom.ProjectDirectory, "--env-file", m.custom.EnvFile}
	for _, file := range m.custom.ComposeFiles {
		args = append(args, "-f", file)
	}
	args = append(args, "config", "--format", "json")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	var out bytes.Buffer
	if err := m.runner.Run(ctx, "docker", args, nil, &out, io.Discard); err != nil {
		return errors.New("合并本地 Compose 失败；详细环境不写入公开日志")
	}
	var config map[string]any
	if err := json.Unmarshal(out.Bytes(), &config); err != nil {
		return errors.New("合并后的 Compose JSON 无效")
	}
	services, ok := config["services"].(map[string]any)
	if !ok {
		return errors.New("Compose 缺少服务定义")
	}
	for _, name := range append(append([]string{}, customServices...), "migrate", "postgres", "redis") {
		service, ok := services[name].(map[string]any)
		if !ok {
			return fmt.Errorf("Compose 缺少 %s 服务", name)
		}
		if name == "migrate" {
			service["image"] = r.Components["backend"].Image
		} else if c, ok := r.Components[name]; ok {
			service["image"] = c.Image
		}
	}
	if err := validateCustomDatabase(services); err != nil {
		return err
	}
	// A prepared image is the only build input accepted during host switching.
	for _, service := range services {
		if row, ok := service.(map[string]any); ok {
			delete(row, "build")
			delete(row, "pull_policy")
		}
	}
	return writeCustomFile(path, config)
}

func validateCustomDatabase(services map[string]any) error {
	environment := func(name string) map[string]any {
		row, _ := services[name].(map[string]any)
		env, _ := row["environment"].(map[string]any)
		resolved := map[string]any{}
		for key, value := range env {
			if text, ok := value.(string); ok {
				resolved[key] = runtimeCustomString(text)
			} else {
				resolved[key] = value
			}
		}
		return resolved
	}
	backend, migrate, postgres := environment("backend"), environment("migrate"), environment("postgres")
	if backend["CANVAS_DATABASE_DRIVER"] != "postgres" || backend["CANVAS_AUTO_MIGRATE"] != "false" || backend["CANVAS_BACKEND_DATA_DIR"] != "/data" || migrate["CANVAS_DATABASE_DRIVER"] != "postgres" || backend["DATABASE_URL"] != migrate["DATABASE_URL"] {
		return errors.New("自定义发布要求 PostgreSQL、独立迁移、/data 与相同的应用/迁移数据库连接")
	}
	connection, _ := backend["DATABASE_URL"].(string)
	parsed, err := url.Parse(connection)
	if err != nil || parsed == nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Hostname() != "postgres" || (parsed.Port() != "" && parsed.Port() != "5432") || parsed.User == nil || parsed.User.Username() != postgres["POSTGRES_USER"] || strings.TrimPrefix(parsed.Path, "/") != postgres["POSTGRES_DB"] {
		return errors.New("应用数据库必须明确连接当前 Compose 的 postgres；外部数据库需要独立发布合同")
	}
	password, ok := parsed.User.Password()
	if !ok || password != postgres["POSTGRES_PASSWORD"] {
		return errors.New("应用与备份 PostgreSQL 凭据不一致")
	}
	for key := range parsed.Query() {
		if key == "host" || key == "hostaddr" || key == "port" || key == "user" || key == "dbname" || key == "password" || key == "service" || key == "servicefile" {
			return errors.New("数据库连接不能通过查询参数覆盖备份目标")
		}
	}
	return nil
}

func (m *Manager) postgresIdentity() (string, string, error) {
	if m.custom == nil {
		values, err := readEnvFile(m.envPath())
		if err != nil {
			return "", "", err
		}
		return firstNonEmpty(values["POSTGRES_USER"], "open_ai_canvas"), firstNonEmpty(values["POSTGRES_DB"], "open_ai_canvas"), nil
	}
	var output bytes.Buffer
	if err := m.compose(m.composePath(), "", time.Minute, &output, "config", "--format", "json"); err != nil {
		return "", "", err
	}
	var config struct {
		Services map[string]struct{ Environment map[string]string }
	}
	if err := json.Unmarshal(output.Bytes(), &config); err != nil {
		return "", "", errors.New("无法解析 PostgreSQL 备份身份")
	}
	env := config.Services["postgres"].Environment
	if env["POSTGRES_USER"] == "" || env["POSTGRES_DB"] == "" {
		return "", "", errors.New("冻结配置缺少 PostgreSQL 备份身份")
	}
	return runtimeCustomString(env["POSTGRES_USER"]), runtimeCustomString(env["POSTGRES_DB"]), nil
}
