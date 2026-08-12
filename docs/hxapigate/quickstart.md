---
sidebar_position: 2
---

# 快速开始

本文档介绍如何在本机启动 HXAPIGate 网关与管理平台（HXBootShiro），并验证网关转发能力。整个流程分为四步：初始化数据库 → 启动管理端 → 启动网关 → 验证。

## 环境要求

| 依赖 | 说明 |
|--|--|
| **JDK 21** | 网关与管理端均要求 JDK 21 |
| **MySQL** | 默认 `127.0.0.1:13306`，库名 `hxapigate`，初始化脚本见 `HXBootShiro/hxapigate.sql` |
| **Redis** | 默认 `127.0.0.1:6379`，用于路由缓存与分布式限流 |
| **Maven** | 首次启动前需要执行打包命令 |

:::tip
脚本 `start_gateway.sh` / `start_bootshiro.sh` 中使用了 `/opt/jdk-21/bin/java` 启动，如果 JDK 21 安装在其他位置，请先修改脚本中的 java 路径。
:::

## 0. 初始化数据库（首次必做）

```bash
# 创建库表并导入测试数据（兼容 MySQL 5.7 / 8.0）
mysql -uroot -p < HXBootShiro/hxapigate.sql
```

脚本包含：建库（`hxapigate`）、9 张表结构、核心测试数据（3 个用户 / 4 个角色 / 20 条 API 资源 / 1 个应用）。

初始化脚本自带的测试账号如下：

| 测试账号 | 密码 | 角色 |
|--|--|--|
| `admin` | `admin123` | 管理员角色 |
| `testuser` | `123456` | 用户角色 |
| `user02` | `123456` | 用户角色 |

:::warning
脚本会 DROP 已存在的同名表后重建，**仅限首次初始化 / 开发环境使用**，切勿在生产库执行。
:::

## 1. 启动管理端（HXBootShiro）

管理平台负责 API 路由与鉴权规则的统一管理，路由信息通过 Redis 下发给网关，因此**必须先启动管理端**。

```bash
mvn -f HXBootShiro/pom.xml package -DskipTests   # 首次需打包
./start_bootshiro.sh
```

`start_bootshiro.sh` 脚本做的事情：

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/HXBootShiro"

# 生成本地开发 JWT 密钥（首次运行需手动创建 ~/.hxapigate_jwt_secret；生产请用独立强密钥）
if [ -z "${HXAPI_JWT_SECRET:-}" ] && [ -f ~/.hxapigate_jwt_secret ]; then
  export HXAPI_JWT_SECRET="$(cat ~/.hxapigate_jwt_secret)"
fi

exec /opt/jdk-21/bin/java \
  -jar target/HXBootShiro.jar \
  --spring.profiles.active=dev
```

即：以 `dev` profile 启动 `target/HXBootShiro.jar`，端口为 `18080`。

## 2. 启动网关（HXAPIGate）

```bash
mvn -f HXAPIGate/pom.xml package -DskipTests      # 首次需打包
./start_gateway.sh
```

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/HXAPIGate"

if [ -z "${HXAPI_JWT_SECRET:-}" ] && [ -f ~/.hxapigate_jwt_secret ]; then
  export HXAPI_JWT_SECRET="$(cat ~/.hxapigate_jwt_secret)"
fi

exec /opt/jdk-21/bin/java \
  -jar target/HXAPIGate-3.0.1-SNAPSHOT.jar
```

:::note
网关启动后会自动从 Redis 拉取管理端下发的 API 路由与熔断 / 限流配置，因此启动顺序应为「先管理端、后网关」。
:::

## 3. 验证

| 服务 | 地址 | 说明 |
|--|--|--|
| 管理平台（Web 控制台） | `http://localhost:18080/static/index.html` | 前端入口带 `/static/` 前缀（Spring 静态资源映射于 `/static/**`） |
| API 网关（HTTP 透传入口） | `http://localhost:18081` | 网关端口，按 Redis 路由表转发至后端微服务 |

启动后的验证步骤：

1. 浏览器访问 `http://localhost:18080/static/index.html`，使用管理平台账号登录（README 操作演示部分使用的登录账号为 `admin / 123456`）。
2. 登录后进入「接口管理」，确认初始化数据中的 20 条 API 资源已展示，协议类型包含 HTTP / Dubbo / MCP / WebSocket 等。
3. 配置或确认一条指向本地后端服务的 HTTP 路由后，直接请求 `http://localhost:18081/<接口路径>`，观察请求是否被正确转发。

## 环境变量（可选）

| 变量 | 说明 |
|--|--|
| `HXAPI_JWT_SECRET` | JWT 签名密钥，**生产环境务必设置强随机值**，管理端与网关必须一致；本地开发可写入 `~/.hxapigate_jwt_secret` |
| `HXAPI_DB_USERNAME` / `HXAPI_DB_PASSWORD` | 数据库凭据（默认取 application.yml dev 配置） |

:::tip
本地开发时，首次运行前需要手动创建 `~/.hxapigate_jwt_secret` 文件并写入密钥内容，否则脚本不会注入 JWT 密钥（管理端与网关读取的是同一份配置，必须保持一致）。
:::

## 常见问题

- **网关启动后路由为空**：确认管理端已启动、Redis 中已有路由数据，且网关晚于管理端启动。
- **请求返回鉴权失败**：确认调用方携带了正确的 `Authorization` 头与 `userId` 头，且该路由开启了 `needAuth`；同时确认管理端与网关的 `HXAPI_JWT_SECRET` 一致。
- **大文件上传被拒**：默认请求体上限为 16MB，可通过环境变量 `HXAPI_MAX_CONTENT_LENGTH` 调整（详见配置说明文档）。
