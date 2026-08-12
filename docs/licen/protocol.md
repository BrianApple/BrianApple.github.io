---
sidebar_position: 4
---

# 证书协议

本章基于 `docs/protocol.md`（协议契约 v1，**唯一事实来源**）与 `internal/license` 实现提炼，涵盖 License 证书格式、字段定义、签名校验流程，以及 SDK 与 licen-server 的 REST 通信契约。

:::note 兼容性原则

服务端字段只增不改，向后兼容；所有 SDK（Java/Python/Go/C）必须忽略未知字段。

:::

## 基础信息

| 项目 | 约定 |
|---|---|
| Base URL | `http://<licen-server-host>:8090` |
| 数据格式 | JSON（UTF-8），`Content-Type: application/json` |
| 时间字段 | ISO-8601（如 `2027-08-11T15:32:19+08:00`） |
| 时间戳 | Unix 毫秒（签名用） |

## License 证书格式

License 是**JSON + RSA 签名**的证书文件（默认输出 `license.json`），字段如下：

```json
{
  "licenseId": "LIC-XXXX-1786433000000",
  "product": "hxapigate",
  "edition": "enterprise",
  "machineCode": "sha256-hex",
  "maxNodes": 10,
  "features": ["ai-inference", "nlp"],
  "issuedAt": "2026-08-11T00:00:00+08:00",
  "expiresAt": "2027-08-11T00:00:00+08:00",
  "customer": "公司一",
  "sign": "base64-rsa-signature"
}
```

| 字段 | 说明 |
|---|---|
| `licenseId` | 证书 ID（如 `LIC-` 前缀 + 随机串 + 签发时间戳） |
| `product` | 产品标识（如 hxapigate / iotgate） |
| `edition` | 版本/套餐（默认 enterprise） |
| `machineCode` | 绑定的客户机器码（SHA-256 十六进制） |
| `maxNodes` | 最大并发节点数 |
| `features` | 功能点列表（功能点授权） |
| `issuedAt` / `expiresAt` | 签发时间 / 到期时间（ISO-8601） |
| `customer` | 客户名称（可选） |
| `sign` | RSA 签名（Base64 编码，可选字段） |

## 签名与校验流程

### 签名（厂商侧，licen-tool / licen-issuer）

1. 构造 License 模型，填入 licenseId/product/edition/machineCode/maxNodes/features/issuedAt/expiresAt/customer
2. 生成**规范 JSON**：去掉 `sign` 字段后的 JSON（**字段顺序固定**）
3. 对规范 JSON 计算 SHA-256 摘要
4. 用厂商 RSA-2048 私钥做 **PKCS1v15 + SHA-256** 签名（即 SHA256withRSA）
5. 签名结果 Base64 编码写入 `sign` 字段

### 验签与校验（客户侧，licen-server）

按固定顺序执行，任一环节失败即拒绝：

1. **验签**：去掉 `sign` 字段重新生成规范 JSON → SHA-256 → 用内置公钥 `rsa.VerifyPKCS1v15` 校验签名；失败 → `INVALID_SIGNATURE`
2. **机器码匹配**：License 的 `machineCode` 与本机采集的机器码比对；不一致 → `MACHINE_MISMATCH`
3. **有效期**：当前时间须在 `issuedAt` 与 `expiresAt` 之间（时钟偏差容忍 ±5 分钟，避免 NTP 抖动误判）；未到生效时间 → `NOT_YET_VALID`，已过期 → `EXPIRED`

:::warning 防篡改保证

RSA-2048 私钥签名覆盖除 `sign` 外的全部字段，**改一个字段即 `INVALID_SIGNATURE`**；公钥无法伪造签名，伪造机器码 → `MACHINE_MISMATCH`。

:::

校验结果枚举：`VALID` / `EXPIRED` / `NOT_YET_VALID` / `MACHINE_MISMATCH` / `INVALID_SIGNATURE` / `CLOCK_REVERSED` / `MISSING`。

## REST API 端点

### 注册 `POST /api/v1/nodes/register`

客户端启动时调用（首次注册或重启续约）。同 nodeId 重复注册视为续约，不占新名额。

```json
{
  "appKey": "hxapigate",
  "appSecret": "xxx",
  "nodeId": "uuid-optional（客户端生成，可空则由服务端分配）",
  "nodeName": "hxapigate-1（可选）",
  "ip": "10.0.0.5（可选）",
  "version": "1.0.0（可选）"
}
```

响应 200：`success`、`message`、`nodeId`、`licenseId`、`expiresAt`、`onlineNodes`、`maxNodes`。

### 心跳 `POST /api/v1/nodes/heartbeat`

定时保活（默认 30s），**必须 HMAC 签名**：

```json
{
  "appKey": "hxapigate",
  "nodeId": "uuid",
  "timestamp": "1786433000000",
  "sign": "hex-hmac"
}
```

**签名算法**：

```
sign = hex( HMAC-SHA256(appSecret, nodeId + ":" + timestamp) )
timestamp = 当前 Unix 毫秒
服务端校验：常量时间比较 + |now - timestamp| ≤ 5 分钟（防重放）
```

### 授权状态 `GET /api/v1/license/status`

查询当前授权状态（SDK 启动/刷新时调用）。响应含 `valid`、`result`、`machineCode`、`licenseId`、`product`、`edition`、`customer`、`maxNodes`、`features`、`issuedAt`、`expiresAt`；多产品模式返回 `products` 列表。

### 健康检查 `GET /api/v1/health`

```json
{ "status": "UP", "time": 1786433000000, "licenseValid": true }
```

### 机器码查询 `GET /api/v1/machine-code`

部署后查询本机机器码（报给厂商签发 License）：

```json
{ "machineCode": "sha256-hex", "hint": "请将此机器码发送给厂商用于签发 License" }
```

### 激活 `POST /api/v1/activate`（先部署后激活）

License 未激活时，除 health / machine-code / license/status / activate 外，其余接口一律返回 HTTP 403 `LICENSE_NOT_ACTIVATED`。激活请求支持两种格式（均无需管理 Token）：

```json
// 方式一：请求体直接为 license.json 内容
{ "licenseId": "...", "product": "licen-server", ..., "sign": "..." }

// 方式二：包装格式
{ "licenseContent": "{ \"licenseId\": \"...\", ... }" }
```

成功返回 `success: true`；失败返回 400，如 `{ "success": false, "result": "MACHINE_MISMATCH", ... }`。

### 管理接口 `/api/v1/admin/**`（需 `X-Admin-Token` 请求头）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/v1/admin/license/status` | GET | 授权详情（含 License 全文） |
| `/api/v1/admin/license/reload` | POST | 重新加载 license.json（热重载） |
| `/api/v1/admin/nodes` | GET | 节点列表（page/size 参数） |
| `/api/v1/admin/nodes/{id}` | DELETE | 强制下线（释放名额） |
| `/api/v1/admin/apps` | GET / POST | 应用列表 / 创建应用 `{name,product,appKey,appSecret}` |
| `/api/v1/admin/apps/{id}` | DELETE | 删除应用 |
| `/api/v1/admin/audits` | GET | 审计日志（page/size 参数） |

## 错误码

| 错误码 | 含义 | SDK 行为 |
|---|---|---|
| `LICENSE_NOT_ACTIVATED` | License 未激活（先部署后激活模式） | 服务端 403，业务接口不可用；上传厂商 License 后自动恢复 |
| `APP_NOT_FOUND` | appKey 不存在 | 检查配置，终止注册（持续重试） |
| `APP_AUTH_FAILED` | appSecret 错误 | 检查配置，终止注册 |
| `LICENSE_INVALID:<原因>` | License 无效（EXPIRED/MACHINE_MISMATCH/INVALID_SIGNATURE） | 进入 DEGRADED，产品降级 |
| `PRODUCT_MISMATCH` | 应用与 License 产品不匹配 | 检查配置 |
| `NODE_LIMIT_REACHED` | 并发节点数已满 | 周期性重试注册 |
| `NODE_NOT_FOUND` | 心跳节点不存在（已被清理/服务重启） | **自动重新注册（自愈）** |
| `SIGN_INVALID` | 心跳签名错误 | 检查 appSecret/时钟 |
| `TIMESTAMP_REJECTED` | 时间戳偏差 > 5 分钟 | 同步时钟（NTP） |
| `TIMESTAMP_INVALID` | 时间戳格式错误 | SDK bug |

## 统一状态机（SDK 必须实现）

```
        启动
         │
         ▼
   ┌────────────┐ register 成功   ┌─────────┐  心跳成功   ┌─────────┐
   │ UNREGISTERED │──────────────→│ HEALTHY │←───────────│(持续心跳)│
   └────────────┘                 └─────────┘            └─────────┘
         │ 失败(不阻塞启动)             │ 心跳连续失败
         ▼                            ▼
   ┌─────────┐   超过宽限期(默认300s)  ┌─────────┐
   │  GRACE  │──────────────────────→│ DEGRADED │
   └─────────┘                       └─────────┘
         ▲                               │
         └────── 心跳恢复 ────────────────┘
  心跳返回 NODE_NOT_FOUND → 自动重新注册（自愈）
```

- **宽限期（GRACE）**：授权中心不可达 grace 秒内（默认 300s），SDK 返回最近一次有效状态（防网络抖动误杀）
- **降级（DEGRADED）**：超过宽限期，`isValid()` 返回 false，产品自行决定行为（SDK 不强制停止）
- **自愈**：心跳 `NODE_NOT_FOUND` → 立即重新注册，成功即恢复 HEALTHY

## 通用配置项（各语言 SDK 统一）

| 配置 | 默认 | 说明 |
|---|---|---|
| `server-url` | `http://127.0.0.1:8090` | 授权服务地址 |
| `app-key` | - | 应用标识（必填） |
| `app-secret` | - | 应用密钥（必填） |
| `node-name` | hostname | 节点名称 |
| `heartbeat-interval-seconds` | 30 | 心跳间隔 |
| `grace-period-seconds` | 300 | 离线宽限期 |
| `connect-timeout-ms` | 3000 | 连接超时 |
