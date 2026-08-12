---
sidebar_position: 2
---

# 快速开始

本文档介绍如何从源码构建并启动 IOTGateConsole，以及如何将它连接到 IOTGate 网关集群。

## 环境要求

- **JDK 21**（Temurin 21 LTS 及以上）
- **MySQL 5.5+**
- **IOTGate 节点**（至少一个运行中的网关，用于验证节点管理）

## 初始化数据库

### 1. 搭建 MySQL 并建表

启动 MySQL 服务，导入项目自带的建表 SQL：

```bash
mysql -u root -p < src/main/resources/strategy.sql
```

### 2. 配置数据库连接

控制台默认连接 `127.0.0.1:13306/iotgatedb`。用户名密码通过**环境变量注入**（避免明文口令入库）：

```bash
export DB_USERNAME=root
export DB_PASSWORD=你的数据库密码
```

或直接编辑 `src/main/resources/application.properties` 中的 `spring.datasource.*` 配置项：

```properties
spring.datasource.url=${DB_URL:jdbc:mysql://127.0.0.1:13306/iotgatedb?useUnicode=true&characterEncoding=utf-8}
spring.datasource.username = ${DB_USERNAME:root}
spring.datasource.password = ${DB_PASSWORD:}
spring.datasource.type =com.alibaba.druid.pool.DruidDataSource
```

:::tip
`DB_URL` / `DB_USERNAME` / `DB_PASSWORD` 均为可覆盖的环境变量，未设置时使用默认值（root/空密码，仅适合本地开发）。生产部署请务必通过环境变量注入口令，勿在代码/配置中硬编码。
:::

## 配置网关节点（连接 IOTGate 集群）

在 `src/main/resources/application.properties` 中配置 `gate.nodes` 网关节点列表：

```properties
# 网关节点静态配置(替代原Zookeeper注册发现机制)
# 多个节点用逗号分隔，支持 ip 或 ip:port(默认RPC端口10916)
gate.nodes=127.0.0.1

# 节点状态监控探测周期(秒)
gate.monitor.interval=10

# 心跳超时阈值(秒)：超过该时间未收到心跳的节点判离线并移除
gate.registry.heartbeat-timeout-seconds=30
# 离线节点清理扫描周期(秒)
gate.registry.scan-interval-seconds=10
```

关键配置项说明：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `gate.nodes` | `127.0.0.1` | 静态网关节点列表，逗号分隔，支持 `ip` 或 `ip:port`（默认 RPC 端口 10916） |
| `gate.monitor.interval` | `10` | 节点状态监控探测周期（秒） |
| `gate.registry.heartbeat-timeout-seconds` | `30` | 心跳超时阈值（秒），超过该时间未收到心跳判离线并移除 |
| `gate.registry.scan-interval-seconds` | `10` | 离线节点清理扫描周期（秒） |

### 动态注册（推荐）

网关侧以 `-c -r <consoleIp>` 模式启动，即可主动注册到控制台，无需手工维护节点列表：

```bash
java -jar iotGate.jar -n 1 -f /opt/iot/iotGate.conf -c -r 192.168.1.100:8686 -m 192.168.1.10
```

注册成功后每 10s 心跳上报，节点自动出现在控制台节点管理页；静态 `gate.nodes` 仅作为兜底。

:::note
动态注册的节点与静态配置节点**并存**：主动注册的节点优先，静态配置兜底。两种来源的节点在线状态均由 TCP 探测判定，无差别对待。
:::

## 编译与启动

### 1. 打包

在项目根目录执行：

```bash
mvn package
```

### 2. 启动

启动可执行 jar 包，默认端口为 **8686**：

```bash
java -jar target/IOTGateConsole-2.2.0-RELEASE.jar
```

入口类为 `IotGateConsoleApplication`。

### 3. 访问控制台

浏览器访问：

```
http://127.0.0.1:8686/static/index.html
```

首次访问会跳转到登录页，**用户名密码随意填写**（没有存库！）。

:::warning
登录页不校验账号密码，仅为演示交互设计，请勿用于公网生产环境而不加任何访问控制。
:::

## 验证运行

- 打开**节点管理**页：应能看到静态配置的 `gate.nodes` 节点；若网关以 `-c -r` 启动，还能看到动态注册的节点（含最近心跳、在线时长）
- 打开**规约管理**页：应能看到数据库中的规约策略列表
- 观察控制台日志：节点探测、心跳接收、SSE 推送等运行信息

## 前端二次开发（可选）

前端源码位于 `frontend/` 目录（Vue3 + Vite）。如需二次开发：

```bash
cd frontend
npm install
npm run dev
```

开发模式会代理 `/rpc` 到 8686 端口。构建产物已集成到 `src/main/resources/static/`，前端改动后重新构建即可。

## 常见问题

### 节点一直显示离线？

确认网关已启动且 10916 RPC 端口可达；在线状态由每 10s 一次的 TCP 探测（2s 超时）判定，连接失败/超时即显示离线。静态配置不存在的 IP 会一直显示离线。

### 数据库连接失败？

确认 MySQL 已启动、`strategy.sql` 已导入，且 `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` 与你的数据库环境一致。默认连接 `127.0.0.1:13306/iotgatedb`（本机 13306/3306 均可，见 IOTGate README）。
