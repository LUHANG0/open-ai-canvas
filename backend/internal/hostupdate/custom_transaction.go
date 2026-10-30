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
	"os"
	"path/filepath"
	"strings"
	"time"
)

// This record is independent of the UI state. Never resume an interrupted
// publication or database recovery just because state.json was edited.
type customTransaction struct {
	Directory      string            `json:"directory"`
	From           CustomRelease     `json:"from"`
	To             CustomRelease     `json:"to"`
	Inputs         map[string]string `json:"inputs"`
	BackendChanged bool              `json:"backendChanged"`
	WebChanged     bool              `json:"webChanged"`
	Backup         *Backup           `json:"backup,omitempty"`
	Stage          string            `json:"stage"`
}

func (m *Manager) customJournalPath() string {
	return filepath.Join(m.config.StateDir, "custom-transaction.json")
}

func (m *Manager) pendingCustomRecovery() error {
	var transaction customTransaction
	if err := readCustomJSON(m.customJournalPath(), &transaction); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return errors.New("自定义发布恢复记录不可读，需要人工核对")
	}
	if transaction.Stage != "completed" {
		return errors.New("自定义发布存在未完成的事务，需要人工核对容器、站点发布及数据库")
	}
	return nil
}

func fileCustomHash(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (m *Manager) customInputs() (map[string]string, error) {
	var profile CustomProfile
	if err := readCustomJSON(m.config.CustomProfile, &profile); err != nil || customHash(profile) != customHash(*m.custom) {
		return nil, errors.New("发布 profile 已改变，请停止并重新核对更新器配置")
	}
	inputs := map[string]string{}
	files := append([]string{m.config.CustomProfile, m.envPath()}, m.custom.ComposeFiles...)
	for _, file := range files {
		resolved, err := filepath.EvalSymlinks(file)
		if err != nil || resolved != file {
			return nil, errors.New("自定义发布输入必须固定到真实路径，不能经过 current 等可变符号链接")
		}
		if err := protectDataRecoveryPath(m.config.StateDir, file); err != nil {
			return nil, errors.New("源配置不能放在更新器管理的状态目录中")
		}
		info, err := os.Stat(file)
		if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0022 != 0 {
			return nil, errors.New("发布输入必须是不可由组或其他用户修改的普通文件")
		}
		hash, err := fileCustomHash(file)
		if err != nil {
			return nil, err
		}
		inputs[file] = hash
	}
	resolved, err := filepath.EvalSymlinks(m.custom.ProjectDirectory)
	if err != nil || resolved != m.custom.ProjectDirectory {
		return nil, errors.New("projectDirectory 必须固定到真实 release 目录")
	}
	return inputs, nil
}

func (m *Manager) verifyCustomInputs(tx *customTransaction) error {
	for file, hash := range tx.Inputs {
		actual, err := fileCustomHash(file)
		if err != nil || actual != hash {
			return errors.New("本地部署配置在发布期间发生变化，已停止切换；共享配置不会被覆盖")
		}
	}
	return nil
}

func (m *Manager) customHook(tx *customTransaction, phase string) error {
	if !tx.WebChanged {
		return nil
	}
	info, err := os.Stat(m.custom.WebPublisher)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 || info.Mode().Perm()&0022 != 0 {
		return errors.New("站点发布适配器必须是不可由组或其他用户修改的可执行文件")
	}
	hash, err := fileCustomHash(m.custom.WebPublisher)
	if err != nil || hash != m.custom.WebPublisherSHA256 {
		return errors.New("站点发布适配器校验失败")
	}
	ctx, cancel := context.WithTimeout(context.Background(), m.config.StepTimeout)
	defer cancel()
	// No shell and no command supplied by a release manifest. The adapter receives
	// immutable local manifests and a private durable directory for its receipts.
	err = m.runner.Run(ctx, m.custom.WebPublisher, []string{phase, filepath.Join(tx.Directory, "from.json"), filepath.Join(tx.Directory, "to.json"), filepath.Join(tx.Directory, "publication")}, nil, io.Discard, io.Discard)
	if err != nil {
		return fmt.Errorf("站点发布适配器 %s 失败（详细输出不公开）", phase)
	}
	return nil
}

func (m *Manager) prepareCustomTransaction(from, to CustomRelease) (*customTransaction, error) {
	inputs, err := m.customInputs()
	if err != nil {
		return nil, err
	}
	directory, err := os.MkdirTemp(m.config.StateDir, "custom-release-*")
	if err != nil {
		return nil, err
	}
	tx := &customTransaction{Directory: directory, From: from, To: to, Inputs: inputs, BackendChanged: from.Components["backend"] != to.Components["backend"], WebChanged: from.Components["web"] != to.Components["web"], Stage: "prepared"}
	// The directory is retained on error for diagnosis; it contains credentials.
	if err := os.Mkdir(filepath.Join(directory, "publication"), 0700); err != nil {
		return nil, err
	}
	for path, value := range map[string]any{"from.json": from, "to.json": to} {
		if err := writeCustomFile(filepath.Join(directory, path), value); err != nil {
			return nil, err
		}
	}
	if err := replaceFile(m.envPath(), filepath.Join(directory, "previous.env"), 0600); err != nil {
		return nil, err
	}
	if err := m.renderCustomCompose(from, filepath.Join(directory, "from-compose.json")); err != nil {
		return nil, err
	}
	if err := m.renderCustomCompose(to, filepath.Join(directory, "to-compose.json")); err != nil {
		return nil, err
	}
	var oldConfig, newConfig map[string]any
	for name, target := range map[string]*map[string]any{"from-compose.json": &oldConfig, "to-compose.json": &newConfig} {
		if err := readCustomJSON(filepath.Join(directory, name), target); err != nil {
			return nil, err
		}
		services, ok := (*target)["services"].(map[string]any)
		if !ok {
			return nil, errors.New("冻结后的服务配置无效")
		}
		for _, name := range append(append([]string{}, customServices...), "migrate") {
			row, ok := services[name].(map[string]any)
			if !ok {
				return nil, errors.New("冻结后的服务配置无效")
			}
			delete(row, "image")
		}
	}
	if customHash(oldConfig) != customHash(newConfig) {
		return nil, errors.New("解析期间出现镜像以外的部署配置变化，拒绝切换")
	}
	for _, name := range []string{"from.json", "to.json", "from-compose.json", "to-compose.json", "previous.env"} {
		path := filepath.Join(directory, name)
		hash, err := fileCustomHash(path)
		if err != nil {
			return nil, err
		}
		tx.Inputs[path] = hash
	}
	if tx.WebChanged {
		tx.Inputs[m.custom.WebPublisher] = m.custom.WebPublisherSHA256
	}
	fromPath := filepath.Join(directory, "from-compose.json")
	if _, err := os.Stat(m.composePath()); err == nil {
		old, _ := fileCustomHash(m.composePath())
		next, _ := fileCustomHash(fromPath)
		if old != next {
			return nil, errors.New("当前冻结配置与本地 Compose 不一致，必须先重新核对部署合同")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := m.prepareCustomImages(to); err != nil {
		return nil, err
	}
	if ids, err := m.customMigrations(false); err != nil {
		return nil, err
	} else if len(ids) != 0 {
		return nil, errors.New("当前项目仍有迁移容器运行，拒绝开始另一次发布")
	}
	if err := m.verifyCustomDeployment(from, fromPath); err != nil {
		return nil, fmt.Errorf("当前部署与导入清单不一致：%w", err)
	}
	if err := m.customHook(tx, "preflight"); err != nil {
		return nil, err
	}
	if tx.BackendChanged {
		if err := checkBackupDiskSpace(m.config.BackupDir); err != nil {
			return nil, err
		}
	}
	if err := m.verifyCustomInputs(tx); err != nil {
		return nil, err
	}
	return tx, nil
}

func (m *Manager) prepareCustomImages(r CustomRelease) error {
	for _, name := range customServices {
		image := r.Components[name].Image
		if strings.Contains(image, "@sha256:") {
			ctx, cancel := context.WithTimeout(context.Background(), m.config.StepTimeout)
			err := m.runner.Run(ctx, "docker", []string{"pull", image}, nil, io.Discard, io.Discard)
			cancel()
			if err != nil {
				return fmt.Errorf("拉取 %s 固定摘要镜像失败", name)
			}
		}
		if _, err := m.customImageID(image); err != nil {
			return fmt.Errorf("校验 %s 目标镜像失败：%w", name, err)
		}
	}
	return nil
}

func (m *Manager) customImageID(image string) (string, error) {
	var output bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if err := m.runner.Run(ctx, "docker", []string{"image", "inspect", image, "--format", "{{.Id}}"}, nil, &output, io.Discard); err != nil {
		return "", errors.New("不可变镜像在本机不可用")
	}
	id := strings.TrimSpace(output.String())
	if !strings.HasPrefix(id, "sha256:") || !hexDigest.MatchString(strings.TrimPrefix(id, "sha256:")) || (strings.HasPrefix(image, "sha256:") && id != image) {
		return "", errors.New("镜像内容 ID 不符合清单")
	}
	return id, nil
}

func (m *Manager) verifyCustomDeployment(r CustomRelease, compose string) error {
	var rendered bytes.Buffer
	if err := m.compose(compose, r.ID, time.Minute, &rendered, "config", "--format", "json"); err != nil {
		return err
	}
	var config struct {
		Services map[string]struct {
			Environment map[string]string
			Command     []string
			Entrypoint  []string
			Volumes     []struct {
				Type, Source, Target string
				ReadOnly             bool `json:"read_only"`
			}
		}
		Volumes map[string]struct{ Name string }
	}
	if err := json.Unmarshal(rendered.Bytes(), &config); err != nil {
		return errors.New("冻结后的 Compose 无效")
	}
	for _, name := range customServices {
		var ids bytes.Buffer
		if err := m.compose(compose, r.ID, time.Minute, &ids, "ps", "--all", "-q", name); err != nil {
			return err
		}
		list := strings.Fields(ids.String())
		if len(list) != 1 {
			return fmt.Errorf("%s 必须有且仅有一个运行容器", name)
		}
		body, err := m.dockerOutput("inspect", list[0])
		if err != nil {
			return err
		}
		var containers []struct {
			Image  string
			Config struct {
				Labels               map[string]string
				Env, Cmd, Entrypoint []string
			}
			Mounts []struct {
				Type, Source, Destination, Name string
				RW                              bool
			}
			State struct {
				Running bool
				Health  struct{ Status string }
			}
		}
		if err := json.Unmarshal(body, &containers); err != nil {
			return err
		}
		expected, err := m.customImageID(r.Components[name].Image)
		if err != nil {
			return err
		}
		if len(containers) != 1 {
			return errors.New("容器检查结果无效")
		}
		c := containers[0]
		if c.Image != expected || c.Config.Labels["com.docker.compose.project"] != m.projectName() || c.Config.Labels["com.docker.compose.service"] != name || !c.State.Running || c.State.Health.Status != "healthy" {
			return fmt.Errorf("%s 镜像、project、服务或健康状态与清单不符", name)
		}
		definition, ok := config.Services[name]
		if !ok {
			return errors.New("冻结配置缺少组件")
		}
		environment := map[string]string{}
		for _, entry := range c.Config.Env {
			key, value, _ := strings.Cut(entry, "=")
			environment[key] = value
		}
		for key, value := range definition.Environment {
			if actual, ok := environment[key]; !ok || actual != runtimeCustomString(value) {
				return fmt.Errorf("%s 运行环境与共享配置不一致", name)
			}
		}
		if definition.Command != nil && customHash(runtimeCustomArguments(definition.Command)) != customHash(c.Config.Cmd) {
			return fmt.Errorf("%s 运行命令与本地配置不一致", name)
		}
		if definition.Entrypoint != nil && customHash(runtimeCustomArguments(definition.Entrypoint)) != customHash(c.Config.Entrypoint) {
			return fmt.Errorf("%s 运行入口与本地配置不一致", name)
		}
		if len(c.Mounts) != len(definition.Volumes) {
			return fmt.Errorf("%s 运行挂载与本地配置不一致", name)
		}
		for _, volume := range definition.Volumes {
			matched := false
			for _, mount := range c.Mounts {
				if mount.Destination != volume.Target || mount.Type != volume.Type || mount.RW == volume.ReadOnly {
					continue
				}
				if volume.Type == "bind" {
					matched = filepath.Clean(mount.Source) == filepath.Clean(volume.Source)
				} else if volume.Type == "volume" {
					matched = mount.Name == config.Volumes[volume.Source].Name
				}
				if matched {
					break
				}
			}
			if !matched {
				return fmt.Errorf("%s 挂载路径或数据卷与本地配置不一致", name)
			}
		}
	}
	backend := r.Components["backend"]
	return m.checkHealthBuild(m.healthURL(), backend.Version, backend.Commit)
}

func (m *Manager) verifyCustomStable(r CustomRelease) error {
	deadline := time.Now().Add(m.config.HealthTimeout)
	var stable time.Time
	for time.Now().Before(deadline) {
		if err := m.verifyCustomDeployment(r, m.composePath()); err != nil {
			stable = time.Time{}
		} else if stable.IsZero() {
			stable = time.Now()
		} else if time.Since(stable) >= m.config.StableWindow {
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	return errors.New("独立组件镜像、后端提交或就绪状态未通过稳定窗口")
}

func (tx *customTransaction) writers() []string {
	if !tx.BackendChanged && tx.From.Components["yingce-agent"] == tx.To.Components["yingce-agent"] {
		return []string{"web"}
	}
	return []string{"web", "backend", "yingce-agent"}
}

func (m *Manager) customRecord(tx *customTransaction, stage string) error {
	tx.Stage = stage
	return writeCustomFile(m.customJournalPath(), tx)
}

func (m *Manager) runCustomUpdate(from, to CustomRelease) {
	tx, err := m.prepareCustomTransaction(from, to)
	if err != nil {
		m.failWithoutRollback(PhaseFailed, err)
		return
	}
	if err := replaceFile(filepath.Join(tx.Directory, "from-compose.json"), m.composePath(), 0600); err != nil {
		m.failWithoutRollback(PhaseFailed, err)
		return
	}
	if err := m.customRecord(tx, "stopping"); err != nil {
		m.failWithoutRollback(PhaseFailed, err)
		return
	}
	m.setPhase(PhaseDraining, "停止本次受影响服务；保留 PostgreSQL、Redis、共享配置和源 Compose")
	if err := m.compose(m.composePath(), from.ID, m.config.StepTimeout, nil, append([]string{"stop"}, tx.writers()...)...); err != nil {
		m.customRecoverBeforeMigration(tx, err)
		return
	}
	if tx.BackendChanged {
		m.setPhase(PhaseBackingUp, "创建后端切换前的最终数据库、素材与密钥备份")
		backup, err := m.createBackup(from.ID)
		if err != nil {
			m.customRecoverBeforeMigration(tx, err)
			return
		}
		tx.Backup = &backup
		if _, err := m.localDataRootFrom(from.ID, filepath.Join(tx.Directory, "from-compose.json"), filepath.Join(tx.Directory, "previous.env")); err != nil {
			m.customRecoverBeforeMigration(tx, err)
			return
		}
	}
	if err := m.verifyCustomInputs(tx); err != nil {
		m.customRecoverBeforeMigration(tx, err)
		return
	}
	if err := m.customRecord(tx, "switching"); err != nil {
		m.customRecoverBeforeMigration(tx, err)
		return
	}
	if tx.BackendChanged {
		m.setPhase(PhaseMigrating, "使用目标后端的固定镜像执行迁移")
		if err := m.compose(filepath.Join(tx.Directory, "to-compose.json"), to.ID, m.config.StepTimeout, nil, "run", "--rm", "--no-deps", "--pull", "never", "--label", "io.mengceng.host-updater="+filepath.Base(tx.Directory), "migrate"); err != nil {
			m.customAutomaticRollback(tx, err)
			return
		}
	}
	m.setPhase(PhaseSwitching, "切换冻结后的本地部署；不改源文件、共享环境或 release 指针")
	if err := replaceFile(filepath.Join(tx.Directory, "to-compose.json"), m.composePath(), 0600); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	if err := m.customUp(tx.writers(), to.ID); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	if err := m.customHook(tx, "publish"); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	m.setPhase(PhaseVerifying, "核对三个组件的实际镜像、后端提交、健康稳定窗口与站点发布回执")
	if err := m.verifyCustomStable(to); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	if err := m.customHook(tx, "verify"); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	if err := m.verifyCustomInputs(tx); err != nil {
		m.customManualFailure(tx, err)
		return
	}
	if err := writeCustomFile(m.customCurrentPath(), to); err != nil {
		m.customAutomaticRollback(tx, err)
		return
	}
	// Persist rollback provenance before clearing the independent recovery lock.
	m.mu.Lock()
	m.state.CustomRollback = tx
	m.state.LastBackup = tx.Backup
	m.state.RollbackVersion = ""
	if !tx.BackendChanged {
		m.state.RollbackVersion = from.ID
	}
	err = m.saveStateLocked()
	m.mu.Unlock()
	if err != nil {
		m.customManualFailure(tx, err)
		return
	}
	if err := m.customRecord(tx, "completed"); err != nil {
		m.customManualFailure(tx, err)
		return
	}
	m.customFinish(PhaseSucceeded, nil, false)
}

func (m *Manager) customUp(services []string, version string) error {
	args := []string{"up", "-d", "--no-deps", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "600"}
	return m.compose(m.composePath(), version, m.config.StepTimeout, nil, append(args, services...)...)
}

func (m *Manager) customRecoverBeforeMigration(tx *customTransaction, cause error) {
	if err := m.compose(m.composePath(), tx.From.ID, m.config.StepTimeout, nil, append([]string{"start"}, tx.writers()...)...); err != nil {
		m.customManualFailure(tx, errors.Join(cause, err))
		return
	}
	if err := m.verifyCustomStable(tx.From); err != nil {
		m.customManualFailure(tx, errors.Join(cause, err))
		return
	}
	if err := m.customRecord(tx, "completed"); err != nil {
		m.customManualFailure(tx, errors.Join(cause, err))
		return
	}
	m.customFinish(PhaseFailed, cause, false)
}

func (m *Manager) customAutomaticRollback(tx *customTransaction, cause error) {
	m.setPhase(PhaseRollingBack, "发布失败，恢复对应的独立组件与站点发布；仅后端迁移路径恢复数据")
	m.mu.Lock()
	m.state.Operation.AutomaticRollback = true
	_ = m.saveStateLocked()
	m.mu.Unlock()
	if err := m.restoreCustomTransaction(tx, true); err != nil {
		m.customManualFailure(tx, errors.Join(cause, err))
		return
	}
	m.customFinish(PhaseRolledBack, cause, true)
}

func (m *Manager) customManualFailure(tx *customTransaction, cause error) {
	// Keep the journal incomplete and stop all writers if publication or recovery
	// is ambiguous. An operator must inspect the durable receipts before resuming.
	err := m.stopFailedRecovery(cause)
	m.mu.Lock()
	automatic := m.state.Operation.AutomaticRollback
	if m.state.Operation.Phase == PhaseRollingBack {
		m.state.Operation.RollbackError = safeOperationError(cause)
	}
	m.mu.Unlock()
	m.customFinish(PhaseManualIntervention, err, automatic)
}

func (m *Manager) customFinish(phase Phase, cause error, automatic bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now().UTC()
	m.state.Operation.Phase = phase
	m.state.Operation.FinishedAt = &now
	m.state.Operation.Error = safeOperationError(cause)
	m.state.Operation.AutomaticRollback = automatic
	m.appendLogLocked(phase, "二改发布操作结束；源 Compose、共享配置、原 release 与保留镜像未被替换")
	if phase == PhaseRolledBack {
		m.state.CustomRollback = nil
		m.state.RollbackVersion = ""
		m.state.LastBackup = nil
	}
	if err := m.saveStateLocked(); err != nil {
		m.state.Operation.Phase = PhaseManualIntervention
		m.state.Operation.Error = "保存最终发布状态失败，需要核对现场"
	}
}

func (m *Manager) startCustomRollback(reason string) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.customBlocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	if m.state.Operation.Phase.Active() || m.state.Operation.Phase == PhaseManualIntervention {
		return m.customSnapshotLocked(), errors.New("已有发布或待核对的恢复现场")
	}
	tx := m.state.CustomRollback
	if tx == nil || tx.BackendChanged {
		return m.customSnapshotLocked(), errors.New("没有可直接回退的代码发布；后端成功发布后的数据恢复须在维护窗口单独核对，不能覆盖上线后写入")
	}
	current, err := m.currentCustomRelease()
	if err != nil {
		return m.customSnapshotLocked(), err
	}
	if customHash(current) != customHash(tx.To) {
		return m.customSnapshotLocked(), errors.New("当前发布与回退记录不一致")
	}
	if err := m.verifyCustomInputs(tx); err != nil {
		return m.customSnapshotLocked(), err
	}
	if strings.TrimSpace(reason) == "" {
		return m.customSnapshotLocked(), errors.New("请填写回退原因")
	}
	now := time.Now().UTC()
	m.state.Operation = Operation{ID: randomID(), Phase: PhaseRollingBack, FromVersion: tx.To.ID, TargetVersion: tx.From.ID, StartedAt: &now, Logs: []LogEntry{}}
	if err := m.saveStateLocked(); err != nil {
		return m.customSnapshotLocked(), err
	}
	// Use a copy: the persisted rollback record remains a completed checkpoint.
	copyTx := *tx
	go func() {
		if err := m.restoreCustomTransaction(&copyTx, false); err != nil {
			m.customManualFailure(&copyTx, err)
			return
		}
		m.customFinish(PhaseRolledBack, nil, false)
	}()
	return m.customSnapshotLocked(), nil
}

func (m *Manager) restoreCustomTransaction(tx *customTransaction, automatic bool) error {
	if err := m.verifyCustomInputs(tx); err != nil {
		return err
	}
	if tx.BackendChanged && (!automatic || tx.Backup == nil || tx.Backup.Version != tx.From.ID) {
		return errors.New("拒绝无匹配最终备份的后端恢复")
	}
	if tx.BackendChanged {
		if err := verifyZipBackup(tx.Backup.Path, tx.Backup.Checksum); err != nil {
			return err
		}
	}
	if err := m.customRecord(tx, "rolling-back"); err != nil {
		return err
	}
	if err := m.compose(m.composePath(), tx.To.ID, m.config.StepTimeout, nil, append([]string{"stop"}, tx.writers()...)...); err != nil {
		return err
	}
	if err := m.stopCustomMigrations(); err != nil {
		return err
	}
	var recovery *dataRestore
	if tx.BackendChanged {
		var err error
		recovery, err = m.stageLocalDataFrom(tx.From.ID, *tx.Backup, filepath.Join(tx.Directory, "from-compose.json"), filepath.Join(tx.Directory, "previous.env"))
		if err != nil {
			return err
		}
		defer recovery.root.Close()
	}
	if err := replaceFile(filepath.Join(tx.Directory, "from-compose.json"), m.composePath(), 0600); err != nil {
		return err
	}
	if recovery != nil {
		if err := recovery.record("restoring-database"); err != nil {
			return err
		}
		if err := m.restoreDatabase(*tx.Backup); err != nil {
			return err
		}
		if err := recovery.install(); err != nil {
			return err
		}
	}
	if err := m.customUp(tx.writers(), tx.From.ID); err != nil {
		return err
	}
	if err := m.customHook(tx, "rollback"); err != nil {
		return err
	}
	if err := m.verifyCustomStable(tx.From); err != nil {
		return err
	}
	// rollback must verify its own external publication before returning success.
	if err := m.verifyCustomInputs(tx); err != nil {
		return err
	}
	if err := writeCustomFile(m.customCurrentPath(), tx.From); err != nil {
		return err
	}
	if recovery != nil {
		if err := recovery.record("completed"); err != nil {
			return err
		}
	}
	return m.customRecord(tx, "completed")
}

// Killing a Compose client does not prove that its one-off migration container
// has stopped. Never restore PostgreSQL while that writer might still run.
func (m *Manager) customMigrations(owned bool) ([]string, error) {
	args := []string{"ps", "-q", "--filter", "label=com.docker.compose.project=" + m.projectName(), "--filter", "label=com.docker.compose.service=migrate"}
	if owned {
		args = append(args, "--filter", "label=io.mengceng.host-updater")
	}
	body, err := m.dockerOutput(args...)
	if err != nil {
		return nil, errors.New("无法核对运行中的迁移容器")
	}
	return strings.Fields(string(body)), nil
}

func (m *Manager) stopCustomMigrations() error {
	ids, err := m.customMigrations(true)
	if err != nil {
		return err
	}
	for _, id := range ids {
		// The client must outlive Docker's grace period, including a forced
		// stop of a migration that does not handle its termination signal.
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		err := m.runner.Run(ctx, "docker", []string{"stop", "--time", "60", id}, nil, io.Discard, io.Discard)
		cancel()
		if err != nil {
			return errors.New("无法停止更新器启动的迁移容器；禁止恢复数据库")
		}
	}
	remaining, err := m.customMigrations(false)
	if err != nil || len(remaining) != 0 {
		return errors.New("仍有迁移容器可能写入数据库，需人工核对")
	}
	return nil
}
