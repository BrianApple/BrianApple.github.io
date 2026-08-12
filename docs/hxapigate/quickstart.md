---
sidebar_position: 2
---

# 快速开始

本文档介绍 HXAPIGate 的本地启动步骤：环境依赖、数据库初始化、管理端与网关的启动、访问地址及可选环境变量。

## 环境依赖

| 依赖 | 要求 | 说明 |
|---|---|---|
| **JDK** | 21 | 网关与管理端均要求 |
| **MySQL** | 默认 `127.0.0.1:13306` | 库名 `hxapigate`，初始化脚本 `HXBootShiro/hxapigate.sql` |
| **Redis** | 默认 `127.0.0.1:6379` | 路由缓存与分布式限流 |

## 0. 初始化数据库（首次必做）

```bash
# 创建库表并导入测试数据（兼容 MySQL 5.7 / 8.0）
mysql -uroot -p < HXBootShiro/hxapigate.sql
```

脚本包含：建库（`hxapigate`）、**9 张表结构**、核心测试数据（**3 个用户 / 4 个角色 / 20 条 API 资源 / 1 个应用**）。

| 测试账号 | 密码 | 角色 |
|---|---|---|
| `admin` | `admin123` | 管理员角色 |
| `testuser` | `123456` | 用户角色 |
| `user02` | `123456` | 用户角色 |

:::warning
脚本会 DROP 已存在的同名表后重建，**仅限首次初始化/开发环境**，切勿在生产库执行。
:::

:::note
README 中「登录演示」部分使用的口令为 `admin / 123456`，与上表（`admin / admin123`）不一致，请以实际初始化脚本导入的数据为准。
:::

## 1. 启动管理端（HXBootShiro）

```bash
mvn -f HXBootShiro/pom.xml package -DskipTests   # 首次需打包
./start_bootshiro.sh
```

## 2. 启动网关（HXAPIGate）

```bash
mvn -f HXAPIGate/pom.xml package -DskipTests      # 首次需打包
./start_gateway.sh
```

:::tip
网关启动后会自动从 Redis 拉取管理端下发的 API 路由与熔断/限流配置，无需手动同步。
:::

## 3. 本地访问地址

| 服务 | 地址 | 说明 |
|---|---|---|
| 管理平台（Web 控制台） | `http://localhost:18080/static/index.html` | 前端入口带 `/static/` 前缀（Spring 静态资源映射于 `/static/**`），默认账号 `admin / 123456` |
| API 网关（HTTP 透传入口） | `http://localhost:18081` | 网关端口，按 Redis 路由表转发至后端微服务 |

![登录页](/img/hxapigate/login.png)

登录后进入管理平台首页（含 ECharts 类型分布/接口状态统计图表）：

![首页](/img/hxapigate/index.png)

## 环境变量（可选）

| 变量 | 说明 |
|---|---|
| `HXAPI_JWT_SECRET` | JWT 签名密钥，**生产环境务必设置强随机值**，管理端与网关必须一致；本地开发可写入 `~/.hxapigate_jwt_secret` |
| `HXAPI_DB_USERNAME` / `HXAPI_DB_PASSWORD` | 数据库凭据（默认取 application.yml dev 配置） |

```bash
# 生产环境注入示例
export HXAPI_JWT_SECRET="$(openssl rand -base64 64)"
export HXAPI_DB_USERNAME="hxapigate"
export HXAPI_DB_PASSWORD="your-strong-password"
```

:::tip
更多网关运行参数（WebSocket 空闲超时 `HXAPI_WS_IDLE_TIMEOUT`、请求体上限 `HXAPI_MAX_CONTENT_LENGTH` 等）见[配置与运维](./config)与[高级特性专题](./features)。
:::

## 下一步

- 了解「API 资源 + 请求方式」细粒度授权模型与 JWT License：见[授权与认证](./auth)
- 配置路由、负载策略与日志溯源：见[配置与运维](./config)
- 体验 MCP 协议转换、WebSocket 双向透传、文件代理等高级特性：见[高级特性专题](./features)
