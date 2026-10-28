# 从 Git 提交构建发布源码

发布源码不再从上一版服务器目录复制后叠加补丁。先提交并检查本次改动，从干净的 Git HEAD 导出；生产配置、用户数据和凭据仍留在发布源码之外。

```sh
python3 scripts/release-source.py export --output /absolute/path/to/new-candidate
```

输出 `source.tar` 与 `source-manifest.json`。清单绑定完整提交号、归档哈希、每个文件内容、类型和可执行权限；未提交或未跟踪文件会阻止导出。导出检查 Git 原始 blob，拒绝 export-ignore、export-subst 或子模块造成的不完整快照。

将归档和原始清单传到候选目录，检查归档 SHA-256 后解压到空的 `source/`。构建前、切换前及发布后执行：

```sh
python3 source/scripts/release-source.py verify \
  --source source --manifest source-manifest.json
```

缺失、额外、内容或权限不同的文件都会返回非零退出码。清单须来自本地 Git 导出，不能从服务器候选重新生成，否则会把漂移错误地认证为基准。部署 Compose 叠加配置、自定义打包 Dockerfile、构建产物和验收记录存放在 `source/` 外。

校验源码后仍须完成类型检查、相关测试、构建及隔离验收。发布时传入清单中的 `BUILD_COMMIT`，记录运行基础镜像 ID、构建产物哈希与运行镜像 ID。保留自定义运行依赖前先核对对应受影响的源码和依赖合同；有变化时必须重新构建相应组件。不可仅通过修改镜像标签或提交号宣称代码已更新。

上线后检查后端就绪接口的提交号、实际运行镜像与前端公网/CDN 文件哈希；这些检查与源码清单一起组成发布证据。CMS 已发布内容和数据库不是 Git 源码，不用默认配置覆盖。保留上版源码、镜像及配置回退依据，回退不覆盖上线后产生的业务数据。

自检：`python3 -m unittest discover -s scripts -p test_release_source.py`。
