---
sidebar_position: 4
---

# 配置与运维

本文档介绍 HXAPIGate 的配置与运维：环境变量、管理端多环境配置、路由与负载策略、日志管理、traceId 链路溯源及日志查询。

## 环境变量总览

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HXAPI_JWT_SECRET` | 本地开发可写入 `~/.hxapigate_jwt_secret` | JWT 签名密钥，**生产环境务必设置强随机值**，管理端与网关必须一致 |
| `HXAPI_DB_USERNAME` / `HXAPI_DB_PASSWORD` | application.yml dev 配置 | 数据库凭据 |
| `HXAPI_WS_IDLE_TIMEOUT` | 60s | WebSocket 空闲超时（亦可使用 JVM 参数 `-Dws.idle.timeout`） |
| `HXAPI_MAX_CONTENT_LENGTH` | 16MB（单位字节） | 请求体大小上限（亦可使用 JVM 参数 `-Dmax.content.length`） |

:::tip
`HXAPI_WS_IDLE_TIMEOUT` 与 `HXAPI_MAX_CONTENT_LENGTH` 的详细行为见[高级特性专题](./features)。
:::

## 管理端多环境配置（application.yml）

管理端默认读取 application.yml 的 **dev** 配置，可通过 `--spring.profiles.active` 切换 **prod / test** 环境：

| 环境 | 说明 |
|---|---|
| `dev` | 默认环境；日志同样落盘（`--spring.profiles.active=dev` 也写文件） |
| `prod` / `test` | 额外输出 MyBatis SQL 调试日志（`SystemSqlOut.log`） |

- 数据库凭据支持 `HXAPI_DB_USERNAME` / `HXAPI_DB_PASSWORD` 环境变量覆盖，默认取 dev 配置
- 配置结构示意（实际值以环境变量与项目内 application.yml 为准）：

```yaml
spring:
  profiles:
    active: dev          # 可切换 prod / test
  datasource:
    username: ${HXAPI_DB_USERNAME:root}
    password: ${HXAPI_DB_PASSWORD:}
  redis:
    host: 127.0.0.1
    port: 6379

hxapi:
  jwt:
    secret: ${HXAPI_JWT_SECRET:}   # 管理端与网关共用同一密钥
```

```bash
# 以生产环境启动管理端
./start_bootshiro.sh --spring.profiles.active=prod
```

## 路由配置（熔断参数 UI 可视化）

管理端接口管理支持路由配置，熔断参数可在 UI 上**可视化配置**：

| 参数 | 说明 |
|---|---|
| 失败阈值 | 触发熔断的失败计数阈值 |
| 成功阈值 | 恢复/关闭熔断所需的成功计数阈值 |
| 超时毫秒 | 单次请求的超时时间 |

- 接口熔断基于**状态机管理**，**配置值优先于 TPS 自动推导值**
- 新增接口的路由信息带有安全限制，保障服务运行安全
- 网关核心单元测试覆盖限流/负载均衡/熔断状态机（14 用例全通过）

## 负载策略

路由负载支持以下策略（轮询和赋权值）：

| 策略 | 说明 |
|---|---|
| `ROUND_ROBIN` | 轮询 |
| `RANDOM` | 随机 |
| `WEIGHTED` | 加权（按后端节点配置的权重） |
| `TPS_LIMIT` | 按 TPS 限制分配 |

WebSocket 等节点配置型协议在后端节点（IP:端口）上同样支持权重/TPS 配置，走标准路由链的负载均衡。

## 日志管理（slf4j + logback）

网关与管理端统一使用 **slf4j + logback** 记录日志，按天 + 大小滚动，**历史日志最多保留 90 天**（超期自动清理）：

| 模块 | 日志目录 | 文件 | 说明 |
|---|---|---|---|
| 网关 HXAPIGate | `HXAPIGate/logs/HXAPIGate/` | `sys.log` | INFO 及以上全量日志（单文件最大 50MB） |
| 网关 HXAPIGate | `HXAPIGate/logs/HXAPIGate/` | `sys-error.log` | 仅 ERROR 错误日志 |
| 管理端 HXBootShiro | `HXBootShiro/logs/HXBootShiro/` | `SystemOut.log` | INFO/WARN 运行日志（ERROR 不重复记录） |
| 管理端 HXBootShiro | `HXBootShiro/logs/HXBootShiro/` | `SystemErrOut.log` | 仅 ERROR 错误日志 |
| 管理端 HXBootShiro | `HXBootShiro/logs/HXBootShiro/` | `SystemSqlOut.log` | MyBatis SQL 调试日志（prod/test 环境） |

- 归档规则：`<文件名>-yyyy-MM-dd.%i.log`，单文件超过 50MB 触发滚动，历史保留 90 天
- 配置文件：网关 `HXAPIGate/src/main/resources/logback.xml`、管理端 `HXBootShiro/src/main/resources/logback-spring.xml`

## 日志溯源（traceId + 协议标识）

所有日志行统一携带 **traceId（请求溯源 ID）** 与 **proto（代理协议）** 两个标识字段，格式示例：

```text
2026-08-10 22:34:25.319 [nioEventLoopGroup-3-1] INFO  [wstest-final] [websocket] hx.apigate.socket.handlers.TranceDataHandler : 226 - WebSocket 代理后端连接成功: ...
2026-08-10 22:34:25.345 [nioEventLoopGroup-3-1] INFO  [mytest-001] [http] hx.apigate.socket.handlers.GatewayServerHandler : 89 - ...
```

- **traceId**：网关在请求入口自动生成 **16 位十六进制 ID**；调用方也可通过请求头 `X-Trace-Id` 传入自定义 ID（跨服务链路联查），网关/管理端均通过响应头 `X-Trace-Id` 原样回传
- **proto**：标识该请求命中的代理协议（`http` / `mcp` / `websocket` / `dubbo`），长连接（WS）按连接级标记，贯穿握手/转发/断开全生命周期
- **实现方式**：slf4j MDC（`%X{traceId}` / `%X{proto}`），HTTP 请求在 `GatewayServerHandler` 入口注入、异步转发回调中恢复、结束清理，杜绝线程复用串号
- **配套代码**：网关 `TraceUtil` + `TraceIdOutboundHandler`、管理端 `TraceIdFilter`

```bash
# 调用方传入自定义 TraceId 示例
curl http://localhost:18081/user/list \
  -H "X-Trace-Id: 9f3a2c1b4d5e6f70"
```

## 日志查询（请求链路追踪）

参考主流网关（APISIX/ShenYu）日志页：支持按 **TraceId / 协议 / 级别 / 关键词 / 时间范围** 多条件搜索网关与管理端日志，点击「链路」查看单个请求的完整处理路径（时间线视图，按时间升序贯穿网关转发 + 管理端调用）。

![日志查询](/img/hxapigate/log-search.png)

按 TraceId 检索（示例：websocket 请求的 2 条链路日志）：

![日志查询-按 TraceId 检索](/img/hxapigate/log-search-trace.png)

请求完整链路（时间线：连接建立 → 握手成功，含级别/协议/来源标注）：

![请求链路](/img/hxapigate/log-trace-drawer.png)
