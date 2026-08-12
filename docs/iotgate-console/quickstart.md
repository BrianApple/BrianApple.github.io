---
sidebar_position: 2
---

# 快速开始

本文介绍 IOTGateConsole 的本地搭建、配置与启动方式。

## 环境要求

- **JDK 21**（Temurin 21 LTS 及以上）
- **MySQL 5.5+**
- **IOTGate 网关节点**（可选，用于节点监控与规约远程管理）

## 初始化数据库

1. 搭建 mysql 服务并导入 `src/main/resources/strategy.sql` 建表：

```bash
mysql -uroot -p < src/main/resources/strategy.sql
```

2. 配置数据库连接：默认连接 `127.0.0.1:13306/iotgatedb`，用户名密码通过**环境变量注入**（避免明文口令入库）：

```bash
export DB_USERNAME=root
export DB_PASSWORD=你的数据库密码
```

或直接编辑 `src/main/resources/application.properties` 中的 `spring.datasource.*`。

:::warning
建议使用环境变量注入数据库口令，勿将明文口令提交到代码仓库。
:::

## 配置网关节点

在 `src/main/resources/application.properties` 中配置 `gate.nodes` 网关节点列表（支持 `ip` 或 `ip:port` 格式，默认 RPC 端口 10916）：

```properties
gate.nodes=192.168.1.20,192.168.1.21:10916
```

:::note
`gate.nodes` 为**静态兜底**配置；网关也可通过 `-c -r <consoleIp>` 主动注册（动态注册），注册的节点优先、静态配置兜底，两者并存。
:::

## 构建启动

```bash
mvn package
java -jar target/iotgate-console.jar
```

启动后默认端口为 **8686**。

## 访问控制台

访问 http://127.0.0.1:8686/static/index.html ，首次访问会跳转到登录页，**用户名密码随意填写**（没有存库！）：

![新版登录页](/img/iotgate-console/login-v2.2-new.png)

## 前端二次开发

前端源码位于 `frontend/` 目录（Vue3 + Vite），开发模式代理 `/rpc` 到 8686：

```bash
cd frontend
npm install
npm run dev
```

构建产物已集成到 `src/main/resources/static/`，`mvn package` 时自动打包。

## 接口清单

| 接口 | 说明 |
|---|---|
| `POST /gate/register` | 网关主动注册（网关 `-c -r` 模式启动时调用，注册成功即同步规约） |
| `POST /gate/heartbeat` | 网关心跳上报（默认每 10s 一次；节点不存在时返回 `retSig=404` 触发网关重新注册） |
| `POST /gate/unregister` | 网关反注册（正常关闭时调用） |
| `GET /gate/nodes` | 查看当前注册表中的节点 |
| `POST /rpc/gateData` | 获取所有网关节点信息（含运行规约） |
| `POST /rpc/addOneStrategy` | 新增规约（表单格式 `data[pid]=xx&data[straName]=xx...`） |
| `POST /rpc/getAllStrategeFromDB` | 获取所有规约名称与编号 |
| `POST /rpc/getAllStrategyAllInfo` | 获取所有规约完整信息 |
| `POST /rpc/updateStrategyNode` | 更新网关节点启用的规约 |
| `POST /rpc/delOneStrategyByPID` | 删除规约（`str=pid`） |
| `POST /rpc/ai/parse` | 智能体解析帧结构描述 |
| `GET /rpc/ai/config` | 获取大模型配置（Key 脱敏） |
| `POST /rpc/ai/config` | 动态更新大模型配置（即时生效） |
| `GET /rpc/events` | SSE 事件流（节点状态/规约变更实时推送） |

:::tip
启动前请确保 MySQL 已就绪并完成 `strategy.sql` 导入；IOTGate 网关节点以 `-c -r <consoleIp>:8686` 启动后即可在节点管理页实时看到注册上线。
:::
