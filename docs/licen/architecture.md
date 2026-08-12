---
sidebar_position: 3
---

# 架构设计

Licen 授权平台本体采用 **Go** 实现（开发者可控、防逆向门槛高于 Java、单二进制部署），本文基于《Licen 授权平台总体设计（v1.0 定稿）》整理。

## 总体架构

```
┌────────────────────────────────────────────────────────────┐
│ 厂商侧（开发机）                                              │
│  licen-tool (Go CLI)  ── 生成密钥对 / 签发License / 验证      │
│         │ 私钥自留，公钥内置到 licen-server 二进制             │
└────────┼───────────────────────────────────────────────────┘
         ▼ License 文件（JSON + RSA 签名，绑定机器码）
┌────────────────────────────────────────────────────────────┐
│ 客户侧（专用 VM）                                            │
│  licen-server (Go 单二进制)                                  │
│   ├─ 启动采集本机机器码 → 验签 → 匹配 → 有效期                 │
│   ├─ REST API：注册 / 心跳 / 状态查询 / 管理                  │
│   ├─ 节点并发控制（maxNodes）+ 心跳超时回收                    │
│   └─ SQLite 存储（节点/应用/审计，零部署成本）                 │
└────────────┬───────────────────────────────────────────────┘
             ▲ 注册/心跳/状态（REST + HMAC 签名）
   ┌─────────┼─────────┬─────────┐
   │         │         │         │
 licen-sdk  licen-sdk  licen-sdk  licen-sdk
 -java      -python    -go       -c
 (已有)     (pip)     (module)  (lib)
```

## 技术选型

| 组件 | 选型 | 理由 |
|---|---|---|
| 语言 | **Go 1.22+** | 开发者可维护；静态编译单二进制；逆向门槛高于 Java |
| HTTP 框架 | **标准库 net/http**（Go 1.22 路由增强） | 接口少，零框架依赖，减少攻击面 |
| 存储 | **SQLite**（modernc.org/sqlite 纯 Go 驱动） | 单文件，客户 VM 零部署；无 CGO 可交叉编译 |
| 配置 | YAML（gopkg.in/yaml.v3）或环境变量 | 简单 |
| 机器码采集 | sysfs 直接读取（Linux）+ WMI（Windows） | 主板/CPU/MAC/磁盘序列号，无需第三方 OSHI |
| 密码学 | 标准库 crypto/rsa、crypto/hmac、crypto/sha256 | RSA-2048 验签、HMAC 签名 |
| 日志 | 标准库 log/slog | 零依赖 |
| 防逆向加固 | L1 去符号+静态链接(musl) + L2 garble 混淆 | 见「安全加固」 |

## 模块划分

### licen-server（客户侧授权服务）

```
licen-server/
├── cmd/licen-server/main.go        # 入口
├── internal/
│   ├── config/                     # 配置加载
│   ├── machine/                    # 机器码采集（Linux sysfs / Windows WMI）
│   ├── license/                    # License 模型 + 验签 + 有效期校验
│   ├── store/                      # SQLite：节点/应用/审计
│   ├── node/                       # 节点注册/心跳/名额控制/超时回收
│   └── api/                        # REST handlers（/api/v1/*）
├── keys/public.pem                 # 内置公钥（构建时替换）
├── config.yaml                     # 部署配置
└── go.mod
```

### licen-tool（厂商 CLI）

```
licen-tool/
├── cmd/licen-tool/main.go
├── internal/
│   ├── keypair/   # gen-keypair
│   ├── license/   # gen-license / verify
│   └── machine/   # machinecode（复用 licen-server 的采集逻辑）
```

### 仓库目录总览

| 目录 | 职责 |
|---|---|
| `cmd/licen-server/` | 授权服务主程序（先部署后激活） |
| `cmd/licen-tool/` | 厂商 CLI 工具 |
| `cmd/licen-issuer/` | 厂商 Web 签发服务（机器码 → license） |
| `internal/config/` | 配置加载 |
| `internal/machine/` | 机器码采集（Linux sysfs） |
| `internal/license/` | License 模型 + RSA 签名/验签/校验/激活 |
| `internal/store/` | SQLite 存储（节点/应用/审计） |
| `internal/node/` | 节点注册/心跳/名额控制/回收 |
| `internal/api/` | REST API（激活门控） |
| `licen-sdk/` | Java 客户端 SDK（Spring Boot Starter） |
| `licen-examples/` | 接入示例 |
| `scripts/` | 加固构建脚本（build-release.sh） |
| `docs/` | 设计文档 + 协议契约 + 演示密钥 + 截图 |

## 签发流程

1. 厂商用 `licen-tool gen-keypair` 生成 RSA-2048 密钥对，**私钥自留**，公钥构建时内置进 licen-server
2. 客户 VM 部署 licen-server 后执行 `curl /api/v1/machine-code` 拿到机器码
3. 厂商二选一签发：
   - **CLI**：`licen-tool gen-license -k 私钥 -m <机器码> -p <产品> -n <节点数> -f <功能点> -d <天数> -c <客户> -o license.json`
   - **Web**：licen-issuer 签发表单（机器码/产品/节点数/有效期 → 生成 + 下载 license.json）
4. 客户上传激活：`POST /api/v1/activate`，服务端验签通过后持久化并解锁全部功能

## 校验流程

License 加载与激活时执行**三步校验**（`internal/license` 的 `Validate`）：

```
验签（RSA-2048，SHA256withRSA）
   │ 失败 → INVALID_SIGNATURE（改一个字段即失败）
   ▼
机器码匹配（绑定本机硬件指纹 SHA-256）
   │ 不一致 → MACHINE_MISMATCH（整套拷走也跑不起来）
   ▼
有效期（issuedAt/expiresAt，±5 分钟时钟偏差容忍）
   ├─ 早于签发时间 5 分钟以上 → NOT_YET_VALID
   ├─ 晚于到期时间 5 分钟以上 → EXPIRED
   └─ 通过 → VALID
```

校验结果枚举：`VALID` / `EXPIRED` / `NOT_YET_VALID` / `MACHINE_MISMATCH` / `INVALID_SIGNATURE` / `CLOCK_REVERSED` / `MISSING`。

## 节点并发控制与回收

- License 限定最大并发节点数 `maxNodes`，在线节点数 ≥ maxNodes 时新注册返回 `NODE_LIMIT_REACHED`
- 节点注册后通过心跳（默认 30s）保活，心跳带 HMAC 签名 + 时间戳（±5 分钟防重放）
- **心跳超时自动回收名额**，防僵尸占用；管理员也可通过 `DELETE /api/v1/admin/nodes/{id}` 强制下线
- 同 nodeId 重复注册视为续约，不占新名额；心跳返回 `NODE_NOT_FOUND` 时 SDK 自动重新注册（自愈）

## SQLite 存储

客户 VM 上 `licen-server` 用 SQLite（纯 Go 驱动 modernc.org/sqlite，无 CGO）存储三类数据：

- **节点**：注册节点、在线状态、最后心跳时间
- **应用**：appKey/appSecret（供产品 SDK 注册与签名）
- **审计**：注册/心跳/激活/管理操作日志

单文件、零部署成本，随二进制拷贝即用。

## 多产品共存

客户现场可能分阶段部署多个产品（如 AI 引擎、应用服务、边缘网关），每个产品需要独立 License，互不影响：

- **licen-server 配置**：`license-file` 指向**目录**（如 `./licenses/`）即进入多产品模式；指向单文件（`./license.json`）保持旧行为（向后兼容）
- **签发**：每个产品各签发一个 License（issuer 的签发表单填不同 `product`），客户分别上传激活
- **存储**：目录下自动按产品分文件 `<product>.json`，各产品**独立激活、独立校验、互不覆盖**；吊销/续签一个产品不影响其他产品
- **查询**：`GET /api/v1/license/status` 返回 `products` 列表（每产品单独状态/节点/功能点/有效期）；`maxNodes` 为所有有效产品之和
- **节点限额**：每产品按各自 `maxNodes` 限额，总在线节点数不超过所有有效产品之和

## 安全加固

### 核心安全设计

- **RSA-2048**：License 由厂商私钥签名，服务端公钥验签；公钥无法伪造签名
- **机器码绑定**：硬件指纹锚点（系统UUID→磁盘→MAC→主板→CPU 取优先级最高的非空源）→ SHA-256，加盘/换网卡/调 vCPU/VM 迁移不变码，License 无法迁移服务器
- **HMAC 心跳**：appSecret 签名 + 时间戳防重放（±5min），常量时间比较
- **节点名额**：在线节点数 ≥ maxNodes 拒绝注册；心跳超时回收防僵尸占用
- **三层鉴权**：应用凭证（注册）+ HMAC 签名（心跳）+ 管理 Token（管理 API）
- **防逆向**：Go 静态编译（CGO_ENABLED=0）、去符号（-s -w）、garble 混淆

### 加固层次

| 层次 | 手段 | 状态 |
|---|---|---|
| L1 | musl 静态链接、`-ldflags "-s -w"` 去符号、release 优化 | ✅ 必做 |
| L2 | **garble 混淆**（开源，Go 专用） | ✅ 必做 |
| L3 | 防调试（ptrace 检测）、二进制自校验、关键逻辑内联 | ⏸️ 二期按需 |
| L4 | RSA-2048 签名防伪造（架构保证） | ✅ 已具备 |

:::note 认知

客户侧软件无绝对防逆向，L1+L2 已将逆向成本提升至"专业级"，对绝大多数客户足够。

:::

### 加固构建

生产发布建议使用加固构建脚本 `scripts/build-release.sh`，产物为**静态链接 + 去符号 + garble 混淆**：

```bash
./scripts/build-release.sh                # 当前平台（linux/amd64）
./scripts/build-release.sh linux amd64    # 交叉构建指定平台
SKIP_GARBLE=1 ./scripts/build-release.sh  # 仅静态+去符号，跳过混淆（构建更快）
```

产物输出到 `dist/<version>/<os>-<arch>/`，包含 `licen-server` / `licen-tool` / `licen-issuer` 三个二进制（均无符号表、函数名/字符串全部混淆，garble `-literals -tiny -seed=random` 每次构建结果不同），外加配置模板与协议文档。构建后脚本自动校验「静态链接」和「符号剥离」两项加固指标。
