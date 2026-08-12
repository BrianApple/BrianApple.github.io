---
sidebar_position: 4
---

# 配置说明

本文档汇总 HXAPIGate 的配置项：环境变量、管理端（HXBootShiro）配置、网关分布式缓存配置、路由与拦截配置，以及日志配置。所有配置项均以仓库实际文件为准。

## 环境变量

| 变量 | 说明 | 默认值 |
|--|--|--|
| `HXAPI_JWT_SECRET` | JWT 签名密钥，生产环境务必设置强随机值，管理端与网关必须一致；本地开发可写入 `~/.hxapigate_jwt_secret` | 空（开发兜底值） |
| `HXAPI_DB_USERNAME` | 数据库用户名 | 取 application.yml dev 配置（`hxapigate`） |
| `HXAPI_DB_PASSWORD` | 数据库口令 | 取 application.yml dev 配置（`hxapigate2026`） |
| `HXAPI_WS_IDLE_TIMEOUT` | WebSocket 空闲超时（秒），超时无消息自动断开双向连接；等价 JVM 参数 `-Dws.idle.timeout` | `60` |
| `HXAPI_MAX_CONTENT_LENGTH` | 请求体大小上限（字节），超限返回 HTTP 413 + JSON 错误说明；等价 JVM 参数 `-Dmax.content.length` | `16MB`（16777216） |

:::note
`HXAPI_JWT_SECRET` 通过管理端 `application.yml` 中的 `hxapigate.jwt.secret: "${HXAPI_JWT_SECRET:}"` 注入；两个启动脚本（`start_gateway.sh` / `start_bootshiro.sh`）都会在环境变量未设置时尝试从 `~/.hxapigate_jwt_secret` 读取。
:::

## 管理端配置（HXBootShiro / application.yml）

### 基础配置

```yaml
server:
  port: 18080
spring:
  mvc:
    static-path-pattern: /static/**   # 前端静态资源映射前缀
  profiles:
    active: dev                       # 默认 dev，可通过 --spring.profiles.active 切换
```

数据源使用 Druid 连接池（`com.alibaba.druid.pool.DruidDataSource`），启用 `stat,slf4j,wall` 监控与防注入过滤器。

### 环境 Profile

| Profile | 数据库 | Redis |
|--|--|--|
| dev | `jdbc:mysql://127.0.0.1:13306/hxapigate`，用户名 `${HXAPI_DB_USERNAME:hxapigate}`，口令 `${HXAPI_DB_PASSWORD:hxapigate2026}` | `127.0.0.1:6379` |
| test | `jdbc:mysql://xx.xx.xx.xx:3306/hxapigate` | `127.0.0.1:6379` |
| prod | `jdbc:mysql://xx.xx.xx.xx:3306/hxapigate`（口令使用 jasypt 加密：`ENC(...)`） | `192.168.0.3:6379` |

### MyBatis 配置

```yaml
mybatis:
  type-aliases-package: com.usthe.bootshiro.domain.bo
  mapper-locations: classpath:mapper/*.xml
  config-location: classpath:mybatis-config.xml
  check-config-location: true
  executor-type: simple
```

## 网关分布式缓存配置（DistributeCacheInfo.xml）

网关使用 Redis 作为路由缓存与分布式限流的载体，配置文件为 `HXAPIGate/src/main/resources/DistributeCacheInfo.xml`。

### 单节点模式

```xml
<defualtCacheProcessorName>single</defualtCacheProcessorName>
<BASIC_SERIALIZATION>fastJsonSerialize</BASIC_SERIALIZATION>

<redis_host>
  <ip>127.0.0.1</ip>
  <port>6379</port>
</redis_host>
<redis_password>OFF</redis_password>
<redis_timeout>10000</redis_timeout>
<redis_maxIdle>299</redis_maxIdle>
<redis_maxTotal>1000</redis_maxTotal>
<redis_maxWaitMillis>1000</redis_maxWaitMillis>
<redis_testOnBorrow>true</redis_testOnBorrow>
<redis_testOnReturn>true</redis_testOnReturn>
```

### 集群模式

```xml
<redis_cluster_host class="java.util.Arrays$ArrayList">
  <a class="RedisNodes-array">
    <RedisNodes>
      <ip>127.0.0.1</ip>
      <port>6379</port>
    </RedisNodes>
    <RedisNodes>
      <ip>127.0.0.1</ip>
      <port>6380</port>
    </RedisNodes>
  </a>
</redis_cluster_host>
<redis_cluster_password>root</redis_cluster_password>
<redis_cluster_timeout>10000</redis_cluster_timeout>
<redis_cluster_maxAttempts>10</redis_cluster_maxAttempts>
```

:::tip
`defualtCacheProcessorName` 为 `single` 时使用单节点 Redis，配置 `redis_cluster_*` 系列参数可切换为 Redis Cluster 分布式缓存。
:::

## 路由配置

网关的路由信息由管理端维护并通过 Redis 下发，路由模型对应源码中的 `hx.apigate.databridge.xmlBean.Route`。

### 路由字段说明

| 字段 | 含义 |
|--|--|
| `matchUrl` | 匹配路径，示例：`account/login`（对应 `http://localhost:8081/account/login`） |
| `version` / `versionWeight` | 版本号与版本权重（金丝雀发布 / 灰度） |
| `stratege` | 负载策略，`circle`（轮询）/ `weight`（加权） |
| `protocal` | 通讯规约：`http` / `dubbo` / `mcp` / `websocket`；dubbo 类型无需配置 `routeNodes`，Dubbo 本身自动实现路由发现与负载 |
| `needAuth` | 是否需要授权：`true` 时会从请求头获取 `authorization` 和 `userId` 值进行鉴权 |
| `mcpExpose` | 是否暴露为 MCP 工具（仅 HTTP 类型支持，勾选后网关内置 `/mcp` 端点做协议转换） |
| `routeNodes` | 后端节点列表（IP:端口 + 权重 / TPS） |
| `allTps` | 吞吐量，全路由限流（限流由 Redis 计数信号量实现） |
| `cbFailThreshold` / `cbSuccessThreshold` / `cbTimeout` | 熔断参数（见下） |

### 熔断参数

| 参数 | 含义 | 默认推导规则 |
|--|--|--|
| `cbFailThreshold` | 熔断失败阈值 | `tps < 2 ? 1 : (tps > 100 ? 50 : tps >> 1)` |
| `cbSuccessThreshold` | 半开连续成功恢复阈值 | `tps < 5 ? 1 : (tps > 100 ? 20 : tps >> 2)` |
| `cbTimeout` | 熔断打开持续时间（ms） | `1000` |

:::note
熔断参数 `0` 表示自动推导；配置值（>0）优先于 TPS 自动推导值。熔断采用状态机管理（Closed / Open / Half-Open），并可在管理端「接口管理」中 UI 可视化配置。
:::

### 负载策略

网关支持多种负载均衡策略：`ROUND_ROBIN`（轮询）、`RANDOM`（随机）、`WEIGHTED`（加权）、`TPS_LIMIT`（按 TPS 限流）。其中加权策略基于平滑加权轮询实现（节点权重在 1–10 之间截断，见 `Route.nextNodeByWeight()`）。

## 拦截与代理能力配置

网关的拦截能力随协议类型不同而不同，均可通过管理端「新增 API」配置：

- **HTTP 代理**：支持 `multipart/form-data` 文件上传无损透传与二进制文件下载回传，大小限制由 `HXAPI_MAX_CONTENT_LENGTH` 控制，超限返回：

```json
{"code":413,"msg":"request body too large, max xxx bytes"}
```

- **WebSocket 代理**：管理端协议类型选择 `WebSocket` 并配置后端节点（IP:端口 + 权重 / TPS），网关识别 `Upgrade: websocket` 握手后与后端建立连接并双向透传；空闲超时由 `HXAPI_WS_IDLE_TIMEOUT` 控制。
- **MCP 代理**：协议类型选择 `MCP` 时为原样透传（后端需为标准 MCP Server）；协议类型保持 `HTTP` 并勾选「暴露为 MCP 工具」时，网关内置 `/mcp` 端点做协议转换，后端 REST 接口零改造即可被 MCP 客户端发现与调用。

## 日志配置

网关与管理端统一使用 **slf4j + logback**，按天 + 大小滚动，历史日志最多保留 90 天（超期自动清理）。

| 模块 | 日志目录 | 文件 | 说明 |
|--|--|--|--|
| 网关 | `HXAPIGate/logs/HXAPIGate/` | `sys.log` | INFO 及以上全量日志（单文件最大 50MB） |
| 网关 | `HXAPIGate/logs/HXAPIGate/` | `sys-error.log` | 仅 ERROR 错误日志 |
| 管理端 | `HXBootShiro/logs/HXBootShiro/` | `SystemOut.log` | INFO/WARN 运行日志（ERROR 不重复记录） |
| 管理端 | `HXBootShiro/logs/HXBootShiro/` | `SystemErrOut.log` | 仅 ERROR 错误日志 |
| 管理端 | `HXBootShiro/logs/HXBootShiro/` | `SystemSqlOut.log` | MyBatis SQL 调试日志（prod/test 环境） |

- 归档规则：`<文件名>-yyyy-MM-dd.%i.log`，单文件超过 50MB 触发滚动。
- 配置文件：网关 `HXAPIGate/src/main/resources/logback.xml`、管理端 `HXBootShiro/src/main/resources/logback-spring.xml`。

### 日志溯源（traceId + 协议标识）

所有日志行统一携带 **traceId（请求溯源 ID）** 与 **proto（代理协议）** 两个标识字段，格式示例：

```text
2026-08-10 22:34:25.319 [nioEventLoopGroup-3-1] INFO  [wstest-final] [websocket] hx.apigate.socket.handlers.TranceDataHandler : 226 - WebSocket 代理后端连接成功: ...
2026-08-10 22:34:25.345 [nioEventLoopGroup-3-1] INFO  [mytest-001] [http] hx.apigate.socket.handlers.GatewayServerHandler : 89 - ...
```

- **traceId**：网关在请求入口自动生成 16 位十六进制 ID；调用方也可通过请求头 `X-Trace-Id` 传入自定义 ID（跨服务链路联查），网关 / 管理端均通过响应头 `X-Trace-Id` 原样回传。
- **proto**：标识请求命中的代理协议（`http` / `mcp` / `websocket` / `dubbo`），长连接（WS）按连接级标记。
- 实现方式：slf4j MDC（`%X{traceId}` / `%X{proto}`），配套代码为网关 `TraceUtil` + `TraceIdOutboundHandler`、管理端 `TraceIdFilter`。
