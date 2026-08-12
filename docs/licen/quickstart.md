---
sidebar_position: 2
---

# 快速开始

本文带你从零跑通 Licen 全链路：构建 → 生成密钥对 → 采集机器码 → 签发 License → 部署授权服务 → 验证激活。

## 环境要求

- **Go ≥ 1.26**（licen-server / licen-tool / licen-issuer 均用 Go 编写）
- Linux（机器码采集依赖 sysfs，生产环境为客户 VM）
- 无外部依赖：不需要 MySQL / Redis / Nginx，`licen-server` 单二进制 + SQLite 即可运行

:::note 加固构建前置

生产发布若使用加固构建脚本 `scripts/build-release.sh`，需要 garble（缺失时脚本自动安装），且 garble 最新版依赖 Go ≥ 1.26。

:::

## 构建

在仓库根目录构建三个二进制：

```bash
go build -o licen-server ./cmd/licen-server
go build -o licen-tool ./cmd/licen-tool
go build -o licen-issuer ./cmd/licen-issuer
```

## licen-tool 命令全参数

| 命令 | 参数 | 说明 |
|---|---|---|
| `gen-keypair` | `-d 输出目录` | 生成 RSA-2048 密钥对（默认 `./keys`），输出 `private.pem`（0600，厂商自留）与 `public.pem`（0644，内置到服务端） |
| `machinecode` | `-s 盐` | 显示本机机器码（客户 VM 上执行后报给厂商）；`-s` 自定义盐，需与授权服务配置一致 |
| `gen-license` | `-k 私钥` `-m 机器码` `-p 产品` `-e 版本` `-n 节点数` `-f 功能点` `-d 天数` / `--expires 到期时间` `-c 客户` `-o 输出` | 签发 License；`-k`/`-m`/`-p` 必填，`-d` 与 `--expires` 二选一必填；默认 `-e enterprise`、`-n 1`、`-o license.json`；`-f` 逗号分隔多个功能点 |
| `verify` | `-k 公钥` `-l license文件` | 用公钥离线验证 License 签名与有效性 |

```bash
# 查看完整用法
./licen-tool help
```

## 本地全链路快速开始

以下 6 步在本地即可完整模拟"厂商签发 → 客户激活"流程：

```bash
# 1. 构建
go build -o licen-server ./cmd/licen-server
go build -o licen-tool ./cmd/licen-tool

# 2. 生成密钥对（私钥厂商自留，公钥内置到服务端）
./licen-tool gen-keypair -d ./keys

# 3. 查看本机机器码（客户 VM 上执行，报给厂商）
./licen-tool machinecode

# 4. 厂商签发 License（绑定机器码、节点数、功能点、有效期）
./licen-tool gen-license -k keys/private.pem \
    -m <机器码> -p hxapigate -n 10 -f ai-inference,nlp -d 365 -c "公司一" -o license.json

# 5. 部署授权服务（客户 VM）：放置 license.json + keys/public.pem + config.yaml
./licen-server -c config.yaml
# 日志出现 "License 加载 result=VALID" 即授权生效

# 6. 验证
curl http://<host>:8090/api/v1/health
curl http://<host>:8090/api/v1/license/status
```

:::tip 签发前先验证

签发后可用 `./licen-tool verify -k keys/public.pem -l license.json` 在厂商侧先自检一遍，确认 License 无误再交付。

:::

## 先部署后激活（生产模式）

**核心思想**：客户先部署 licen-server（此时**不需要** license.json），只能用基础功能（健康检查/机器码采集/状态查询/激活）。客户把机器码发给厂商，厂商签发 License 后，客户**上传激活**即解锁全部功能（注册/心跳/管理 API）。

```
客户 VM 部署 server（无 license）
   │  curl /api/v1/machine-code → 机器码
   ▼
厂商签发（二选一）
   │  A. CLI:  licen-tool gen-license -k 私钥 -m <机器码> -p iotgate ...
   │  B. 签发服务: licen-issuer Web 界面 / REST API（见 issuer 文档）
   ▼
客户上传激活
   │  curl -X POST http://<host>:8090/api/v1/activate -d @license.json -H "Content-Type: application/json"
   ▼
全部功能解锁（License 与客户机器码强绑定，拷贝无效）
```

### 未激活时的 API 行为

| API | 未激活 | 激活后 |
|---|---|---|
| `GET /api/v1/health` | ✅ | ✅ |
| `GET /api/v1/machine-code` | ✅ | ✅ |
| `GET /api/v1/license/status` | ✅ | ✅ |
| `POST /api/v1/activate` | ✅（上传激活） | ✅（可换新 License） |
| `POST /api/v1/nodes/register` | 🚫 `LICENSE_NOT_ACTIVATED` | ✅ |
| `POST /api/v1/nodes/heartbeat` | 🚫 | ✅ |
| `/api/v1/admin/*` | 🚫 | ✅ |

### 激活失败安全保证

`activate` 接口**不需要管理 Token**，但只有**厂商私钥签名 + 绑定本机机器码**的 License 才能激活成功：

- 伪造机器码 → `MACHINE_MISMATCH`
- 篡改内容 → `INVALID_SIGNATURE`
- 且**激活失败不影响当前已激活状态**（已激活的 License 继续有效）

## 客户 VM 部署清单

1. 上传 `licen-server` 二进制、`config.yaml`、`keys/public.pem`（**license.json 可后补**）
2. 修改 `config.yaml`：`admin-token`、端口、心跳超时
3. `./licen-server -c config.yaml`（systemd 托管见 `docs/systemd.md`，可选）
4. 启动后：`curl /api/v1/machine-code` 获取机器码 → 发给厂商
5. 厂商签发（CLI 或 licen-issuer）→ 客户上传激活：
   `curl -X POST http://<host>:8090/api/v1/activate -d @license.json -H "Content-Type: application/json"`
   → 返回 `"success": true` 即全部功能启用

:::warning 生产安全

私钥由 `licen-tool gen-keypair` 生成且**只放在厂商内网**；公钥通过 `-ldflags -X main.publicKey=...` 内置进 licen-server 二进制（防公钥替换），生产不要依赖外部 `public.pem` 文件。

:::
