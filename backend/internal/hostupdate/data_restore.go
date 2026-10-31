package hostupdate

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"
)

const recoveryPrefix = ".host-updater-recovery-"

// The journal is independent of the UI operation state: checking for a release
// or restarting the updater must never unlock a partially restored deployment.
type dataRestoreJournal struct {
	Stage          string    `json:"stage"`
	Source         string    `json:"source"`
	Directory      string    `json:"directory"`
	BackupChecksum string    `json:"backupChecksum"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type dataManifestEntry struct {
	Name      string
	Mode      os.FileMode
	UID, GID  int
	Size      int64
	Hash      string
	Directory bool
}

type dataRestore struct {
	manager  *Manager
	root     *os.Root
	journal  dataRestoreJournal
	manifest []dataManifestEntry
}

func (m *Manager) recoveryJournalPath() string {
	return filepath.Join(m.config.StateDir, "data-restore.json")
}

func (m *Manager) pendingDataRecovery() error {
	body, err := os.ReadFile(m.recoveryJournalPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取数据恢复记录失败：%w", err)
	}
	var journal dataRestoreJournal
	if err := json.Unmarshal(body, &journal); err != nil {
		return fmt.Errorf("数据恢复记录无效，需要人工检查：%w", err)
	}
	if journal.Stage != "completed" {
		return fmt.Errorf("数据恢复尚未完成（%s），业务服务须保持停止；请核对 data-restore.json 与保留副本后人工处理", journal.Stage)
	}
	return nil
}

func (r *dataRestore) record(stage string) error {
	r.journal.Stage = stage
	r.journal.UpdatedAt = time.Now().UTC()
	body, err := json.MarshalIndent(r.journal, "", "  ")
	if err != nil {
		return err
	}
	// Commit the journal before touching live data. Interruption leaves a durable
	// lock preventing another upgrade from replacing the recovery point.
	f, err := os.CreateTemp(r.manager.config.StateDir, ".data-restore-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(body); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err = os.Rename(f.Name(), r.manager.recoveryJournalPath()); err != nil {
		return err
	}
	dir, err := os.Open(r.manager.config.StateDir)
	if err != nil {
		return err
	}
	err = dir.Sync()
	dir.Close()
	if err != nil {
		return err
	}
	return nil
}

func (m *Manager) dockerOutput(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	var out, stderr bytes.Buffer
	if err := m.runner.Run(ctx, "docker", args, nil, &out, &stderr); err != nil {
		return nil, fmt.Errorf("检查 Docker 数据挂载失败：%w", err)
	}
	return out.Bytes(), nil
}

// Resolve both the stopped container and the saved Compose definition. Never
// interpret a remote daemon's mount path as a path on the updater's host.
func (m *Manager) localDataRoot(version string) (string, error) {
	return m.localDataRootFrom(version, m.previousComposePath(), m.previousEnvPath())
}

func (m *Manager) localDataRootFrom(version, previousCompose, previousEnv string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("自动恢复数据仅支持 Linux 本机 Docker 挂载")
	}
	endpoint := os.Getenv("DOCKER_HOST")
	if os.Getenv("DOCKER_CONTEXT") != "" || endpoint == "" {
		body, err := m.dockerOutput("context", "inspect", "--format", "{{json .Endpoints.docker.Host}}")
		if err != nil {
			return "", err
		}
		if err := json.Unmarshal(body, &endpoint); err != nil {
			return "", err
		}
	}
	if !strings.HasPrefix(endpoint, "unix:///") {
		return "", errors.New("拒绝恢复远程 Docker 数据挂载")
	}
	var ids bytes.Buffer
	if err := m.compose(m.composePath(), version, time.Minute, &ids, "ps", "--all", "-q", "backend"); err != nil {
		return "", err
	}
	list := strings.Fields(ids.String())
	if len(list) != 1 {
		return "", errors.New("必须有且仅有一个可核对的 backend 容器")
	}
	body, err := m.dockerOutput("inspect", list[0])
	if err != nil {
		return "", err
	}
	var containers []struct {
		Mounts []struct {
			Type, Source, Destination, Name string
			RW                              bool
		}
		Config struct {
			Labels map[string]string
			Env    []string
		}
	}
	if err := json.Unmarshal(body, &containers); err != nil {
		return "", err
	}
	if len(containers) != 1 || containers[0].Config.Labels["com.docker.compose.project"] != m.projectName() {
		return "", errors.New("backend 容器不属于当前部署项目")
	}
	var source, mountType, mountName string
	for _, mount := range containers[0].Mounts {
		if strings.HasPrefix(path.Clean(mount.Destination), "/data/") {
			return "", errors.New("不支持 /data 内的嵌套挂载")
		}
		if path.Clean(mount.Destination) == "/data" {
			if source != "" || !mount.RW || (mount.Type != "bind" && mount.Type != "volume") {
				return "", errors.New("数据挂载必须是唯一可写的 bind 或 volume")
			}
			source, mountType, mountName = mount.Source, mount.Type, mount.Name
		}
	}
	for _, env := range containers[0].Config.Env {
		if strings.HasPrefix(env, "CANVAS_BACKEND_DATA_DIR=") && env != "CANVAS_BACKEND_DATA_DIR=/data" {
			return "", errors.New("backend 数据目录必须为 /data")
		}
	}
	args := []string{"compose", "--project-name", m.projectName(), "--project-directory", m.config.InstallDir, "--env-file", previousEnv, "-f", previousCompose, "config", "--format", "json"}
	body, err = m.dockerOutput(args...)
	if err != nil {
		return "", err
	}
	var config struct {
		Services map[string]struct {
			Environment map[string]string
			Volumes     []struct {
				Type, Source, Target string
				ReadOnly             bool `json:"read_only"`
			}
		}
		Volumes map[string]struct{ Name string }
	}
	if err := json.Unmarshal(body, &config); err != nil {
		return "", err
	}
	backend, ok := config.Services["backend"]
	if !ok {
		return "", errors.New("旧部署缺少 backend 定义")
	}
	if value := backend.Environment["CANVAS_BACKEND_DATA_DIR"]; value != "" && value != "/data" {
		return "", errors.New("旧部署数据目录不是 /data")
	}
	matched := 0
	for _, mount := range backend.Volumes {
		if strings.HasPrefix(path.Clean(mount.Target), "/data/") {
			return "", errors.New("旧部署包含 /data 内的嵌套挂载")
		}
		if path.Clean(mount.Target) != "/data" {
			continue
		}
		matched++
		if mount.ReadOnly || mount.Type != mountType {
			return "", errors.New("旧部署与当前数据挂载不一致")
		}
		if mount.Type == "bind" && filepath.Clean(mount.Source) != filepath.Clean(source) {
			return "", errors.New("旧部署与当前数据路径不一致")
		}
		if mount.Type == "volume" && config.Volumes[mount.Source].Name != mountName {
			return "", errors.New("旧部署与当前数据卷不一致")
		}
	}
	if mountType == "volume" {
		body, err := m.dockerOutput("volume", "inspect", mountName)
		if err != nil {
			return "", err
		}
		var volumes []struct {
			Name, Driver, Mountpoint string
			Options                  map[string]string
		}
		if err := json.Unmarshal(body, &volumes); err != nil {
			return "", err
		}
		if len(volumes) != 1 || volumes[0].Name != mountName || volumes[0].Driver != "local" || len(volumes[0].Options) != 0 || filepath.Clean(volumes[0].Mountpoint) != filepath.Clean(source) {
			return "", errors.New("自动恢复仅支持无额外挂载选项的标准本地数据卷；其他驱动或临时挂载需要独立恢复")
		}
	}
	if matched != 1 || !filepath.IsAbs(source) || filepath.Clean(source) == "/" {
		return "", errors.New("无法确认安全的数据挂载路径")
	}
	source, err = filepath.EvalSymlinks(source)
	if err != nil {
		return "", err
	}
	if source == "/" {
		return "", errors.New("拒绝覆盖宿主机根目录")
	}
	if err := rejectNestedHostMounts(source); err != nil {
		return "", err
	}
	protectedPaths := []string{m.config.StateDir, m.config.BackupDir, m.composePath(), m.envPath(), previousCompose, previousEnv}
	if m.custom != nil {
		protectedPaths = append(protectedPaths, m.custom.ComposeFiles...)
		for _, path := range []string{m.config.CustomProfile, m.custom.ProjectDirectory, m.custom.CurrentRelease, m.custom.TargetRelease, m.custom.WebPublisher} {
			if path != "" {
				protectedPaths = append(protectedPaths, path)
			}
		}
	}
	for _, protected := range protectedPaths {
		if err := protectDataRecoveryPath(source, protected); err != nil {
			return "", err
		}
	}

	return source, nil
}

// A local-driver volume can expose the same directory under two host paths.
// Compare ancestor identities as well as names, so bind aliases cannot hide a
// journal or backup inside the directory whose contents are about to move.
func protectDataRecoveryPath(source, protected string) error {
	root, err := os.Stat(source)
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(protected)
	if err != nil {
		return err
	}
	for current := resolved; ; current = filepath.Dir(current) {
		info, err := os.Stat(current)
		if err != nil {
			return err
		}
		if os.SameFile(root, info) {
			return errors.New("数据挂载包含更新器配置、状态或备份，拒绝覆盖")
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	return nil
}

// os.Root confines path traversal, but it does not stop traversal through a
// nested host mount. Reject those too, before creating any recovery directory.
func rejectNestedHostMounts(source string) error {
	body, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		return err
	}
	decode := strings.NewReplacer(`\040`, " ", `\011`, "\t", `\012`, "\n", `\134`, `\`)
	for _, line := range strings.Split(string(body), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}
		mount := decode.Replace(fields[4])
		if strings.HasPrefix(mount, source+string(filepath.Separator)) {
			return errors.New("数据路径包含宿主机嵌套挂载，拒绝自动恢复")
		}
	}
	return nil
}

func (m *Manager) stageLocalData(version string, backup Backup) (*dataRestore, error) {
	return m.stageLocalDataFrom(version, backup, m.previousComposePath(), m.previousEnvPath())
}

func (m *Manager) stageLocalDataFrom(version string, backup Backup, previousCompose, previousEnv string) (*dataRestore, error) {
	if err := m.pendingDataRecovery(); err != nil {
		return nil, err
	}
	source, err := m.localDataRootFrom(version, previousCompose, previousEnv)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(source)
	if err != nil {
		return nil, err
	}
	r := &dataRestore{manager: m, root: root, journal: dataRestoreJournal{Source: source, Directory: recoveryPrefix + randomID(), BackupChecksum: backup.Checksum}}
	fail := func(err error) (*dataRestore, error) {
		root.Close()
		return nil, fmt.Errorf("暂存本地数据失败（服务保持停止）：%w", err)
	}
	if err := r.record("preparing"); err != nil {
		return fail(err)
	}
	if err := root.MkdirAll(r.journal.Directory+"/snapshot", 0700); err != nil {
		return fail(err)
	}
	if err := root.Mkdir(r.journal.Directory+"/previous", 0700); err != nil {
		return fail(err)
	}
	archive, err := zip.OpenReader(backup.Path)
	if err != nil {
		return fail(err)
	}
	defer archive.Close()
	var entry *zip.File
	for _, candidate := range archive.File {
		if candidate.Name == "backend-data.tar" {
			if entry != nil {
				return fail(errors.New("备份包含重复数据归档"))
			}
			entry = candidate
		}
	}
	if entry == nil {
		return fail(errors.New("备份缺少本地数据"))
	}
	reader, err := entry.Open()
	if err != nil {
		return fail(err)
	}
	defer reader.Close()
	stage, err := root.OpenRoot(r.journal.Directory + "/snapshot")
	if err != nil {
		return fail(err)
	}
	defer stage.Close()
	r.manifest, err = extractDataSnapshot(stage, reader, entry.UncompressedSize64)
	if err != nil {
		return fail(err)
	}
	if err := r.record("staged"); err != nil {
		return fail(err)
	}
	return r, nil
}

func archiveDataName(name string) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
		return "", errors.New("数据归档包含绝对路径或反斜杠")
	}
	for _, part := range strings.Split(name, "/") {
		if part == ".." {
			return "", errors.New("数据归档包含父目录跳转")
		}
	}
	clean := path.Clean(name)
	if clean == "" || strings.HasPrefix(strings.Split(clean, "/")[0], recoveryPrefix) {
		return "", errors.New("数据归档使用了恢复保留目录")
	}
	return clean, nil
}

func extractDataSnapshot(root *os.Root, reader io.Reader, limit uint64) ([]dataManifestEntry, error) {
	tr := tar.NewReader(reader)
	seen := map[string]bool{}
	manifest := []dataManifestEntry{}
	var size uint64
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		name, err := archiveDataName(h.Name)
		if err != nil {
			return nil, err
		}
		if seen[name] {
			return nil, fmt.Errorf("数据归档路径重复：%s", name)
		}
		seen[name] = true
		directory := h.Typeflag == tar.TypeDir
		if !directory && h.Typeflag != tar.TypeReg && h.Typeflag != tar.TypeRegA {
			return nil, fmt.Errorf("不支持的数据归档类型：%s", name)
		}
		if name == "." && !directory {
			return nil, errors.New("数据根目录不是目录")
		}
		if name == ".settings-key" && (directory || h.Size != 32) {
			return nil, errors.New("设置加密密钥必须为 32 字节普通文件")
		}
		if h.Uid < 0 || h.Gid < 0 {
			return nil, errors.New("数据归档包含无效的文件所有者")
		}
		if h.Size < 0 || uint64(h.Size) > limit-size {
			return nil, errors.New("数据归档内容超出备份大小")
		}
		size += uint64(h.Size)
		item := dataManifestEntry{Name: name, Mode: os.FileMode(h.Mode) & 0777, UID: h.Uid, GID: h.Gid, Size: h.Size, Directory: directory}
		if directory {
			if err := root.MkdirAll(name, 0700); err != nil {
				return nil, err
			}
		} else {
			if err := root.MkdirAll(path.Dir(name), 0755); err != nil {
				return nil, err
			}
			f, err := root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				return nil, err
			}
			hash := sha256.New()
			_, err = io.CopyN(io.MultiWriter(f, hash), tr, h.Size)
			if err == nil {
				err = f.Chown(h.Uid, h.Gid)
			}
			if err == nil {
				err = f.Chmod(item.Mode)
			}
			if err == nil {
				err = f.Sync()
			}
			closeErr := f.Close()
			if err == nil {
				err = closeErr
			}
			if err != nil {
				return nil, err
			}
			item.Hash = hex.EncodeToString(hash.Sum(nil))
		}
		manifest = append(manifest, item)
	}
	// tar EOF occurs before ZIP EOF; drain the rest to verify the ZIP CRC too.
	if _, err := io.Copy(io.Discard, reader); err != nil {
		return nil, err
	}
	if len(manifest) == 0 {
		return nil, errors.New("数据归档为空")
	}
	// Children first, so restrictive archived directory modes cannot prevent extraction.
	for i := len(manifest) - 1; i >= 0; i-- {
		item := manifest[i]
		if !item.Directory {
			continue
		}
		if err := root.Chown(item.Name, item.UID, item.GID); err != nil {
			return nil, err
		}
		if err := root.Chmod(item.Name, item.Mode); err != nil {
			return nil, err
		}
	}
	if key, err := root.Lstat(".settings-key"); err == nil {
		if !key.Mode().IsRegular() || key.Size() != 32 {
			return nil, errors.New("设置加密密钥必须为 32 字节普通文件")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := fs.WalkDir(root.FS(), ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return syncDataDirectory(root, name)
		}
		return nil
	}); err != nil {
		return nil, err
	}

	return manifest, nil
}

func syncDataDirectory(root *os.Root, name string) error {
	f, err := root.Open(name)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

// Each rename is confined to the opened mount. Original files are moved, never
// deleted or followed (including old symlinks). A failed switch remains locked.
func (r *dataRestore) install() error { return r.installWithRename(r.root.Rename) }
func (r *dataRestore) installWithRename(rename func(string, string) error) error {
	if err := r.record("switching"); err != nil {
		return err
	}
	entries, err := r.root.Open(".")
	if err != nil {
		return err
	}
	names, err := entries.Readdirnames(-1)
	entries.Close()
	if err != nil {
		return err
	}
	slices.Sort(names)
	for _, name := range names {
		if strings.HasPrefix(name, recoveryPrefix) {
			continue
		}
		if err := rename(name, r.journal.Directory+"/previous/"+name); err != nil {
			return err
		}
		if err := syncDataDirectory(r.root, "."); err != nil {
			return err
		}
		if err := syncDataDirectory(r.root, r.journal.Directory+"/previous"); err != nil {
			return err
		}
	}
	snapshot := r.journal.Directory + "/snapshot"
	dir, err := r.root.Open(snapshot)
	if err != nil {
		return err
	}
	names, err = dir.Readdirnames(-1)
	dir.Close()
	if err != nil {
		return err
	}
	slices.Sort(names)
	for _, name := range names {
		if err := rename(snapshot+"/"+name, name); err != nil {
			return err
		}
		if err := syncDataDirectory(r.root, snapshot); err != nil {
			return err
		}
		if err := syncDataDirectory(r.root, "."); err != nil {
			return err
		}
	}
	for _, item := range r.manifest {
		if item.Name == "." {
			if err := r.root.Chown(".", item.UID, item.GID); err != nil {
				return err
			}
			if err := r.root.Chmod(".", item.Mode); err != nil {
				return err
			}
		}
	}
	if err := r.verify(); err != nil {
		return err
	}
	return r.record("installed")
}

func (r *dataRestore) verify() error {
	for _, item := range r.manifest {
		stat, err := r.root.Lstat(item.Name)
		if err != nil {
			return err
		}
		if stat.Mode().Perm() != item.Mode || stat.IsDir() != item.Directory || !item.Directory && (!stat.Mode().IsRegular() || stat.Size() != item.Size) {
			return fmt.Errorf("恢复后文件属性不一致：%s", item.Name)
		}
		if item.Directory {
			continue
		}
		f, err := r.root.Open(item.Name)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, err = io.Copy(hash, f)
		f.Close()
		if err != nil {
			return err
		}
		if hex.EncodeToString(hash.Sum(nil)) != item.Hash {
			return fmt.Errorf("恢复后文件校验失败：%s", item.Name)
		}
	}
	return nil
}
