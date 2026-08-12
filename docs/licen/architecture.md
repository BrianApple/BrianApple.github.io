---
sidebar_position: 3
---

# 架构设计

本章基于 `docs/design.md` 提炼，介绍 Licen 授权平台的总体架构、模块划分、签发/校验流程与数据存储设计。

## 总体架构

Licen 分为**厂商侧**与**客户侧**两个信任域：

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
```

核心链路：厂商用私钥签发绑定机器码的 License → 客户部署 licen-server 并上传激活 → 激活通过后，客户产品通过 SDK 注册节点、心跳保活、查询授权状态。

:::note 平台语言决策

授权平台本体（licen-server + licen-tool）统一使用 **Go** 实现（开发者可控、防逆向门槛高于 Java、单二进制部署）。Java 仅在客户产品接入侧（licen-sdk）保留。

:::

## 技术选型

| 组件 | 选型 | 理由 |
|---|---|---|
| 语言 | Go 1.22+ | 静态编译单二进制；逆向门槛高于 Java |
| HTTP 框架 | 标准库 net/http（Go 1.22 路由增强） | 接口少，零框架依赖，减少攻击面 |
| 存储 | SQLite（modernc.org/sqlite 纯 Go 驱动） | 单文件，客户 VM 零部署；无 CGO 可交叉编译 |
| 配置 | YAML（gopkg.in/yaml.v3）或环境变量 | 简单 |
| 机器码采集 | sysfs 直接读取（Linux）+ WMI（Windows） | 主板/CPU/MAC/磁盘序列号，无需第三方 OSHI |
| 密码学 | 标准库 crypto/rsa、crypto/hmac、crypto/sha256 | RSA-2048 验签、HMAC 签名 |
| 日志 | 标准库 log/slog | 零依赖 |
| 防逆向加固 | L1 去符号+静态链接(musl) + L2 garble 混淆 | 见安全加固 |

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

各模块职责：

- **config**：加载 YAML 配置（端口、admin-token、心跳超时、license-file 路径等）
- **machine**：采集硬件指纹并计算 SHA-256 机器码（锚点优先级：系统UUID→磁盘→MAC→主板→CPU 取非空源）
- **license**：License 数据模型、RSA 验签、有效期校验、激活逻辑
- **store**：SQLite 持久化节点、应用（appKey/appSecret）、审计日志
- **node**：节点注册、心跳保活、maxNodes 名额控制、超时自动回收
- **api**：REST 处理器，未激活时对业务接口做门控（403 `LICENSE_NOT_ACTIVATED`）

### licen-tool（厂商 CLI）

```
licen-tool/
├── cmd/licen-tool/main.go
├── internal/
│   ├── keypair/   # gen-keypair
│   ├── license/   # gen-license / verify
│   └── machine/   # machinecode（复用 licen-server 的采集逻辑）
```

### licen-issuer（厂商 Web 签发服务）

Web UI + REST API，提供签发、台账管理、产品库、定制版 SDK 下载、客户档案归档能力；已签发授权持久化在台账（`data/licenses.json` 原子写盘），吊销/重签全程留痕。

## 签发流程（厂商侧）

1. 客户在 VM 上部署 licen-server，调用 `GET /api/v1/machine-code`（或 `licen-tool machinecode`）获取本机机器码并发给厂商
2. 厂商用 `licen-tool gen-license` 或 licen-issuer 签发表单，录入机器码、产品、节点数、功能点、有效期、客户名
3. 签发时用厂商私钥（RSA-2048）对 License 内容签名，输出 `license.json`（JSON + RSA 签名，绑定机器码）
4. 厂商把 license.json 回传给客户，客户上传激活

:::warning 密钥边界

私钥只存在于厂商侧（licen-tool 生成、licen-issuer 配置引用）；公钥通过 `-ldflags -X main.publicKey=...` 内置进 licen-server 二进制，防公钥替换。

:::

## 校验/激活流程（客户侧）

licen-server 启动或收到激活请求时，按固定顺序执行校验：

1. **验签**：用内置公钥验证 License 的 RSA 签名（SHA256withRSA），篡改任一字段 → `INVALID_SIGNATURE`
2. **机器码匹配**：License 绑定的机器码与本机采集的机器码比对，不一致 → `MACHINE_MISMATCH`
3. **有效期**：当前时间在 issuedAt 与 expiresAt 之间（时钟偏差容忍 5 分钟），过期 → `EXPIRED`
4. **激活落库**：校验通过后 License 生效，全部功能解锁

激活失败不影响当前已激活状态；激活成功后，业务接口开放注册/心跳/管理能力。

## 节点并发控制

- 每个 License 限定最大并发节点数（maxNodes）
- 客户端启动时调用 `POST /api/v1/nodes/register` 注册，同 nodeId 重复注册视为续约，不占新名额
- 客户端定时（默认 30s）发送 HMAC 签名的心跳保活
- **心跳超时自动回收**名额，防止僵尸节点长期占用；管理端也可 `DELETE /api/v1/admin/nodes/{id}` 强制下线释放名额

## 数据存储

| 存储 | 位置 | 内容 |
|---|---|---|
| SQLite | licen-server 数据目录 | 节点（注册信息/心跳时间）、应用（appKey/appSecret）、审计日志 |
| license.json | licen-server 配置指定（单文件或目录） | 授权证书本体（含签名） |
| 台账 JSON | licen-issuer `data/licenses.json` | 已签发授权记录（原子写盘，重启不丢） |
| 产品库/归档 | licen-issuer `data/` | products.json、customer-products.json、`archive/{客户}/{产品}/` |

:::note 多产品共存

licen-server 配置 `license-file` 指向**目录**（如 `./licenses/`）即进入多产品模式：目录下自动按产品分文件 `<product>.json`，各产品独立激活、独立校验、互不覆盖；`GET /api/v1/license/status` 返回 `products` 列表，`maxNodes` 为所有有效产品之和。

:::

## 安全加固

| 层次 | 手段 | 状态 |
|---|---|---|
| L1 | musl 静态链接、`-ldflags "-s -w"` 去符号、release 优化 | 必做 |
| L2 | garble 混淆（开源，Go 专用，`-literals -tiny -seed=random` 每次构建结果不同） | 必做 |
| L3 | 防调试（ptrace 检测）、二进制自校验、关键逻辑内联 | 二期按需 |
| L4 | RSA-2048 签名防伪造（架构保证） | 已具备 |

> 认知：客户侧软件无绝对防逆向，L1+L2 已将逆向成本提升至"专业级"，对绝大多数客户足够。
