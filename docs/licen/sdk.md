---
sidebar_position: 5
---

# 多语言 SDK 接入

Licen 提供 Java / Go / Python / C **四语言官方 SDK**，共享同一份协议契约（`docs/protocol.md`，唯一事实来源），行为完全一致：注册、心跳、宽限期、自愈、能力校验。所有 SDK 均为**纯客户端**，不含验签核心（验签只在 licen-server）。

## 设计原则

- **一套协议，多语言覆盖**：四语言 SDK 按同一份 REST + HMAC 契约独立实现，服务端新增字段向后兼容，不破坏旧 SDK
- **行为一致性**：注册、心跳、宽限期、自愈、能力校验在各语言表现完全一致（统一状态机 + 统一错误码）
- **零依赖优先**：客户环境多为内网/离线，SDK 尽量不引入第三方依赖
- **C 适配嵌入式**：C SDK 兼顾资源受限环境（可无 libcurl）

| 语言 | 状态 | 形态 | 说明 |
|---|---|---|---|
| Java | ✅ 可用 | `licen-sdk/` | Spring Boot Starter，配置 `licen.sdk.*` 即接入 |
| Go | ✅ 可用 | `licen-sdk-go/` | 零依赖，`go get` 即用 |
| Python | ✅ 可用 | `licen-sdk-python/` | 零依赖，`pip install` |
| C | ✅ 可用 | `licen-sdk-c/` | libcurl + 纯 socket 双模式，适配嵌入式 |

## 通用功能矩阵（四语言全部实现）

| 功能 | 说明 | 优先级 |
|---|---|---|
| 配置加载 | server-url / app-key / app-secret / node-name / interval / grace / timeout | P0 |
| 启动注册 | 启动时一次，失败不阻塞（进宽限期） | P0 |
| 定时心跳 | 默认 30s，HMAC 签名 | P0 |
| 状态缓存 | 内存缓存最新授权状态（valid/expiresAt/features/maxNodes） | P0 |
| 能力校验 | `isValid()` / `hasFeature(name)` / `getStatus()` | P0 |
| 离线宽限期 | 断联 grace 秒内视为有效（默认 300s） | P0 |
| 自动自愈 | 心跳 NODE_NOT_FOUND → 自动重注册 | P0 |
| 状态持久化 | 本地文件缓存授权状态，重启先读缓存（防启动即断网误杀） | P1 |
| 降级回调 | 状态变化时回调/事件通知（产品可感知并决定行为） | P1 |
| 手动刷新 | `refresh()` 主动拉取 | P1 |

## Java SDK（Spring Boot Starter）

`licen-sdk/`，Maven Central（或私有仓库）发布。Spring 环境由 `LicenAutoConfiguration` 自动装配，直接注入 `LicenClient` 即可。

**配置**（application.yml）：

```yaml
licen:
  sdk:
    # 授权服务地址（客户VM上的 licen-server）
    server-url: http://127.0.0.1:8091
    # 应用凭证（在授权服务管理端创建）
    app-key: hxapigate
    app-secret: licen-demo-secret-2026
    node-name: example-hxapigate
    heartbeat-interval-seconds: 5
    grace-period-seconds: 30
```

**业务代码**：

```java
@Autowired
private LicenClient licenClient;

// 启动：注册 + 定时心跳（应用启动时调用）
licenClient.start();

// 是否持有有效授权
if (licenClient.isLicenseValid()) {
    // 正常服务
}

// 是否拥有指定功能点
if (licenClient.hasFeature("ai-inference")) {
    // 开启 AI 推理功能
}

// 是否降级（授权中心不可达超过宽限期）
if (licenClient.isDegraded()) {
    // 产品自行决定行为（SDK 不强制停止）
}

// 停止心跳线程（应用关闭时调用）
licenClient.stop();
```

## Go SDK

`licen-sdk-go/`，`go get github.com/BrianApple/Licen/licen-sdk-go`，仅标准库 `net/http`（零第三方依赖）；goroutine 心跳 + `context.Context` 取消，`sync.RWMutex` 保护状态。

```go
package main

import (
	"context"
	"fmt"
	"time"

	"github.com/BrianApple/Licen/licen-sdk-go"
)

func main() {
	client, err := licen.NewClient(licen.Config{
		ServerURL: "http://10.0.0.10:8090",
		AppKey:    "hxapigate",
		AppSecret: "xxx",
		NodeName:  "example-go-sdk",
	})
	if err != nil {
		panic(err)
	}

	// 状态变化回调（可选）
	client.OnStatusChange(func(st licen.Status) {
		fmt.Printf("📢 授权状态变化: valid=%v licenseId=%s\n", st.Valid, st.LicenseID)
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.Start(ctx)

	// 能力校验
	_ = client.IsValid()                 // bool
	_ = client.HasFeature("ai-inference") // bool
	_ = client.Status()                  // 含 OnlineNodes/MaxNodes/Features
	_ = client.IsDegraded()              // bool

	// 周期性查看状态
	ticker := time.NewTicker(3 * time.Second)
	for range ticker.C {
		st := client.Status()
		fmt.Printf("状态: valid=%v 节点=%d/%d 功能=%v\n",
			st.Valid, st.OnlineNodes, st.MaxNodes, st.Features)
	}
}
```

适配场景：Go 微服务、网关、k8s sidecar、云原生组件。附加 `licen.StatusListener` 接口实现降级回调。

## Python SDK

`licen-sdk-python/`，`pip install licen-sdk`，Python 3.9+，**零第三方依赖**（stdlib：`urllib.request` / `hmac` / `hashlib` / `threading` / `json`）；后台 daemon 线程心跳，主线程查询状态。

```python
import time
from licen_sdk import LicenClient

client = LicenClient(
    server_url="http://10.0.0.10:8090",
    app_key="hxapigate",
    app_secret="xxx",
    node_name="example-python-sdk",
)

def on_change(status):
    print(f"📢 授权状态变化: valid={status.valid} licenseId={status.license_id}")

client.on_status_change(on_change)
client.start()

# 能力校验
client.is_valid()                # bool
client.has_feature("ai-inference")  # bool
st = client.status()             # 含 license_id/online_nodes/max_nodes/features
client.is_degraded()             # bool

time.sleep(3)
client.stop()
```

适配场景：AI 推理服务、数据处理服务、模型服务。同时提供 CLI 子命令 `licen-sdk status`；异步模式（asyncio）二期。

## C SDK

`licen-sdk-c/`，静态库 `.a` / 动态库 `.so`（Windows `.lib`/`.dll` 二期）+ 头文件 `licen.h`；CMake + Makefile 双构建；支持交叉编译（arm64）。

**依赖策略（双模式）**：

- **模式 A（默认）**：libcurl + pthread —— Linux 普遍存在，功能完整，TLS 可扩展
- **模式 B（可选）**：`LICEN_NO_CURL=1` 时用纯 POSIX socket 自实现最小 HTTP 客户端 —— 零依赖，适配嵌入式/资源受限；无 TLS（内网部署可接受）

**示例代码**：

```c
#include <stdio.h>
#include <string.h>
#include "licen.h"

static void on_change(const licen_status_t *st, void *userdata) {
    printf("📢 授权状态变化: valid=%d licenseId=%s\n", st->valid, st->license_id);
}

int main(void) {
    licen_config_t cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.server_url = "http://10.0.0.10:8090";
    cfg.app_key = "hxapigate";
    cfg.app_secret = "xxx";
    cfg.node_name = "edge-gw-1";
    cfg.heartbeat_interval_sec = 5;

    licen_client_t *c = licen_init(&cfg);
    if (c == NULL) {
        fprintf(stderr, "licen_init 失败\n");
        return 1;
    }

    licen_on_status_change(c, on_change, NULL);
    if (licen_start(c) != 0) {
        fprintf(stderr, "licen_start 失败: %s\n", licen_last_error(c));
        licen_destroy(c);
        return 1;
    }

    licen_status_t st;
    licen_get_status(c, &st);            // 查询式 API，无回调也能用
    bool ok  = licen_is_valid(c);
    bool fea = licen_has_feature(c, "ai-inference");
    bool deg = licen_is_degraded(c);

    licen_stop(c);
    licen_destroy(c);
    return 0;
}
```

适配场景：边缘网关、嵌入式引擎、IOTGate 类 C/C++ 产品。C ABI 稳定后，C++/Rust/Node(N-API)/.NET 可通过 FFI 复用。

## 兜底方案：纯 REST 直连

任何语言（含未覆盖的 Rust/Node.js/PHP 等）可直接按 `docs/protocol.md` 调用 REST API，无 SDK 也能接入：

```bash
# 注册
curl -X POST http://<host>:8090/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -d '{"appKey":"hxapigate","appSecret":"xxx","nodeName":"my-node"}'

# 心跳（HMAC 签名）
SIGN=$(printf "%s:%s" "$NODE_ID" "$TS" | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')
curl -X POST http://<host>:8090/api/v1/nodes/heartbeat \
  -H "Content-Type: application/json" \
  -d "{\"appKey\":\"hxapigate\",\"nodeId\":\"$NODE_ID\",\"timestamp\":\"$TS\",\"sign\":\"$SIGN\"}"

# 状态查询
curl http://<host>:8090/api/v1/license/status
```

SDK 的价值在于把心跳/宽限期/自愈/缓存逻辑封装好；纯 REST 直连需要自己实现这些逻辑。

## 发布与版本管理

| 语言 | 渠道 | 备注 |
|---|---|---|
| Java | Maven Central（或私有仓库） | 保持 1.0.0-SNAPSHOT |
| Python | PyPI `licen-sdk` | 开源项目建议公开 |
| Go | GitHub Releases + Go Proxy | `github.com/BrianApple/licen-sdk-go` |
| C | GitHub Releases 源码包 + 编译产物（linux-x86_64/arm64） | 附 CMake/Makefile |

所有 SDK 与 server 协议版本 v1 兼容；server 只增不改字段；SDK 各自独立版本号，遵循语义化版本。协议契约 `docs/protocol.md`（人类可读）+ `docs/openapi.yaml`（机器可读）为唯一事实来源，SDK 变更必须同步契约。
