---
sidebar_position: 5
---

# 多语言 SDK 接入

客户产品技术栈多样（Java / Python / Go / C），Licen 为四种语言提供官方 SDK：**Java**（Spring Boot Starter）、**Go**（零依赖 module）、**Python**（零依赖 pip 包）、**C**（libcurl + 纯 socket 双模式）。本章基于 `docs/multi-language-sdk-design.md` 与各 SDK 实际示例代码提炼。

## 设计原则

- **一套协议，多语言覆盖**：四语言 SDK 共享同一份协议契约（`docs/protocol.md`，唯一事实来源），服务端新增字段向后兼容
- **行为一致性**：注册、心跳、宽限期、自愈、能力校验在各语言 SDK 表现完全一致；零依赖优先，适配内网/离线环境
- **SDK 为纯客户端**：负责注册、心跳、宽限期、自愈、能力校验；**不含验签核心**（验签只在 licen-server）

```
                    ┌─────────────────────────┐
                    │  licen-server (REST+HMAC) │
                    └────────────┬────────────┘
                                 │ 统一协议契约（唯一事实来源）
              ┌──────────────────┼───────────────────┐
      licen-sdk-java      licen-sdk-python    licen-sdk-go
      (Spring Starter)      (pip, 零依赖)     (go module, 零依赖)
      licen-sdk-c (libcurl 或纯 socket)         纯 REST 直连（任意语言兜底）
```

## 通用能力矩阵（四语言全部实现）

| 功能 | 说明 |
|---|---|
| 配置加载 | server-url / app-key / app-secret / node-name / interval / grace / timeout |
| 启动注册 | 启动时一次，失败不阻塞（进宽限期）；定时心跳默认 30s，HMAC 签名 |
| 状态缓存 | 内存缓存最新授权状态（valid/expiresAt/features/maxNodes） |
| 能力校验 | `isValid()` / `hasFeature(name)` / `getStatus()` |
| 离线宽限期 | 断联 grace 秒内视为有效（默认 300s），超时进入降级并回调通知 |
| 自动自愈 | 心跳 `NODE_NOT_FOUND` → 自动重注册 |

## Java SDK（licen-sdk）

形态为 **Spring Boot Starter**，从仓库 `licen-sdk/` 引入（Maven Central 或私有仓库，版本 1.0.0-SNAPSHOT），配置 `licen.sdk.*` 即接入：

```yaml
licen:
  sdk:
    server-url: http://10.0.0.10:8090   # 授权服务地址（客户 VM）
    app-key: hxapigate
    app-secret: xxx
    product: hxapigate                  # 产品标识（须与管理端 App 绑定产品一致）
    node-name: hxapigate-1              # 可选，默认取 hostname
    heartbeat-interval-seconds: 30
    grace-period-seconds: 300           # 授权中心不可达时的宽限期
    connect-timeout-ms: 3000
```

业务代码中由 LicenAutoConfiguration 自动装配，直接注入使用：

```java
import com.licen.sdk.LicenClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MyService {

    @Autowired
    private LicenClient licenClient;

    public void doBusiness() {
        if (!licenClient.isLicenseValid()) {
            throw new IllegalStateException("未持有有效授权");
        }
        if (licenClient.hasFeature("ai-inference")) {
            // 执行 AI 推理功能
        }
        if (licenClient.isDegraded()) {
            // 授权中心不可达且过宽限期，产品自行决定降级行为
        }
        // getStatus() 状态快照 / getNodeId() 节点ID / refreshStatus() 主动刷新
    }
}
```

:::tip 三层产品校验

服务端对产品做三层校验：SDK 声明（product）== App 凭证（appKey/appSecret）== License 签名授权（product 字段），三者一致才放行。

:::

## Go SDK（licen-sdk-go）

形态为 Go module，**零第三方依赖**（仅标准库 net/http），goroutine 心跳 + `context.Context` 取消，`sync.RWMutex` 保护状态；另提供 `licen.StatusListener` 接口实现降级回调，适配 Go 微服务、网关、k8s sidecar 等场景。

```bash
go get github.com/BrianApple/Licen/licen-sdk-go
```

```go
package main

import (
	"context"
	"fmt"
	"log"
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
		log.Fatal(err)
	}
	// 状态变化回调（可选）
	client.OnStatusChange(func(st licen.Status) {
		fmt.Printf("授权状态变化: valid=%v licenseId=%s\n", st.Valid, st.LicenseID)
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client.Start(ctx) // 注册 + 后台心跳
	fmt.Println("已启动, nodeId:", client.NodeID())

	time.Sleep(3 * time.Second)
	fmt.Println("valid:", client.IsValid(), "hasFeature:", client.HasFeature("ai-inference"))
	st := client.Status() // 状态快照
	fmt.Printf("degraded=%v 节点 %d/%d 功能 %v\n", client.IsDegraded(), st.OnlineNodes, st.MaxNodes, st.Features)

	client.Stop()
}
```

也可以注册 `licen.StatusListener` 接口实现降级回调，适配 Go 微服务、网关、k8s sidecar 等场景。

## Python SDK（licen-sdk-python）

形态为 pip 包（PyPI 名 `licen-sdk`，Python 3.9+），**零第三方依赖**（stdlib：`urllib.request` / `hmac` / `hashlib` / `threading` / `json`），后台 daemon 线程心跳，主线程查询状态。

```bash
pip install licen-sdk
```

```python
from licen_sdk import LicenClient

client = LicenClient(
    server_url="http://10.0.0.10:8090",
    app_key="hxapigate",
    app_secret="xxx",
    node_name="example-python-sdk",
)

# 状态变化回调（可选）
client.on_status_change(lambda st: print(f"授权状态变化: valid={st.valid} licenseId={st.license_id}"))

client.start()
print("已启动, nodeId:", client.node_id)

print("valid:", client.is_valid())                      # bool
print("hasFeature:", client.has_feature("ai-inference"))  # bool
st = client.status()  # 状态快照（dict）
print(f"degraded={client.is_degraded()} 节点 {st.online_nodes}/{st.max_nodes} 功能 {st.features}")

client.stop()
```

:::note 附加能力

`licen-sdk-python` 同时提供 CLI 子命令 `licen-sdk status`，可快速查看当前授权状态。

:::

## C SDK（licen-sdk-c）

形态为静态库 `.a` / 动态库 `.so` + 头文件 `licen.h`，CMake + Makefile 双构建，支持交叉编译（arm64）。**双模式**：libcurl 模式（默认，依赖 libcurl + pthread，功能完整，TLS 可扩展）；纯 socket 模式（零依赖，`make no_curl` 或 `-DLICEN_NO_CURL=ON`，仅 POSIX socket，适配嵌入式/资源受限环境，无 TLS，内网部署可接受）。

```bash
make                 # libcurl 模式，生成 liblicen.a + licen-demo
make no_curl         # 纯 socket 模式（零依赖）
cmake -B build && cmake --build build          # CMake 方式
cmake -B build -DLICEN_NO_CURL=ON && cmake --build build
```

```c
#include <stdio.h>
#include <string.h>
#include <licen.h>

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
    if (licen_start(c) != 0) {                    // 注册 + 后台心跳线程
        fprintf(stderr, "licen_start 失败: %s\n", licen_last_error(c));
        licen_destroy(c);
        return 1;
    }
    printf("已启动, nodeId=%s\n", licen_node_id(c));

    if (licen_is_valid(c) && licen_has_feature(c, "ai-inference")) {
        // 执行业务
    }
    licen_status_t st;
    licen_get_status(c, &st);  // 状态快照
    int degraded = licen_is_degraded(c);

    licen_stop(c);
    licen_destroy(c);
    return 0;
}
```

**核心 API**：`licen_init` / `licen_start` / `licen_stop` / `licen_destroy` / `licen_is_valid` / `licen_has_feature` / `licen_is_degraded` / `licen_get_status` / `licen_refresh` / `licen_on_status_change` / `licen_last_error`。所有查询 API 线程安全，可在任意线程调用；C ABI 稳定后，C++/Rust/Node(N-API)/.NET 可通过 FFI 复用。

## 兜底方案：纯 REST 直连

任何语言（含未覆盖的 Rust/Node.js/PHP 等）可直接按 `docs/protocol.md` 调用 REST API，无 SDK 也能接入；SDK 的价值在于心跳、宽限期、自愈、缓存逻辑的封装：

```bash
# 注册 / 查询授权状态
curl -X POST http://<host>:8090/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -d '{"appKey":"hxapigate","appSecret":"xxx","nodeName":"my-node"}'
curl http://<host>:8090/api/v1/license/status
```

心跳需按协议计算 HMAC 签名（见[证书协议](./protocol.md)）。

## 版本与发布渠道

| 语言 | 渠道 | 备注 |
|---|---|---|
| Java | Maven Central（或私有仓库） | 保持 1.0.0-SNAPSHOT |
| Python | PyPI `licen-sdk` | 开源项目建议公开 |
| Go | GitHub Releases + Go Proxy | `github.com/BrianApple/Licen/licen-sdk-go` |
| C | GitHub Releases 源码包 + 编译产物（linux-x86_64/arm64） | 附 CMake/Makefile |

所有 SDK 与 server 协议版本 v1 兼容；server 只增不改字段，SDK 各自独立版本号，遵循语义化版本。协议契约（`docs/protocol.md` + OpenAPI）变更时，SDK 必须同步。
