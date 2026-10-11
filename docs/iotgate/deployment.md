---
sidebar_position: 5
---

# 部署指南

IOTGate 网关与 IOTGateConsole 管理平台是两个独立工程，组合成完整部署形态，**二者可选搭配**。

## 两种部署形态

### 仅网关（最小部署）

只用 `-m` 直连前置，无需管理平台，数据通道零依赖：

```bash
java -jar iotGate.jar -n 1 -m 192.168.1.20 -f /opt/iotgate/iotGate.conf
```

- 前置默认端口 8888
- 适合仅需数据采集转发的轻量场景

### 网关 + 管理平台（推荐）

启动网关（**网关侧无需任何 Console 配置**），然后在 IOTGateConsole 的「节点管理」页**登记网关 IP 与指令端口**（默认 10917），Console 即开始探针判活并提供**节点监控、规约启停管理、AI 智能体**等能力：

```bash
# 网关：只指定前置即可
java -jar iotGate.jar -n 1 -m 192.168.1.20 -f /opt/iotgate/iotGate.conf
```

:::note
使用前提：管理平台需配置 MySQL（本机 13306/3306 均可，见 IOTGateConsole README）并启动，导入 `dump-iotgatedb-*.sql` 建表；未启动 Console 时网关仅以 `-m` 模式运行，**不影响数据通道**。
:::

## 集群部署

集群部署同样是**在 Console 侧登记多个网关 IP**，数据通道由 `-m` 逗号分隔指定多个前置（轮询负载均衡）：

```bash
java -jar iotGate.jar -n 1 -m 192.168.1.20,192.168.1.21 -f /opt/iotgate/iotGate.conf
```

:::tip
v2.0 起去除 zookeeper 依赖，集群模式通过 `-m` 直连前置，数据通道零改动；网关与前置通讯时默认采用**轮询方式负载均衡**。
:::

## 部署前置检查清单

| 检查项 | 要求 |
|---|---|
| IOTGateConsole 服务 | 已启动，默认端口 8686 可访问 |
| MySQL | 已就绪（本机 13306/3306 均可，见 IOTGateConsole README），`dump-iotgatedb-*.sql` 已导入 |
| 网关指令端口 | **10917** 开放，Console 可达（规约启停等指令下发依赖） |
| 前置(master) | 8888 端口可达（`-m` 直连） |
| 网络 | Console → 网关（10917）、网关 → 前置（8888）网络互通 |

## 与 Console 的协同机制

**控制通道为 Console 主动模式**（网关不主动上报）：

| 机制 | 说明 |
|---|---|
| **节点登记** | 在 Console「节点管理」页填入网关 IP 与指令端口（默认 10917），写入 `gate_node` 表 |
| **探针判活** | Console 默认每 **10s** 调 `GET /gate/status` 取运行快照，据此判断在线状态与已加载规约 |
| **指令下发** | 规约新增/启停/删除均通过 `POST /gate/command` 由 Console 主动下发 |
| **差量补发** | 以最近一次探针的运行集为差量基准，只下发必要的启停指令；同时决定补发节奏 |
| **自动补发** | 探针发现网关缺少某规约时，Console 自动补发一次 `ADD_PROTOCOL`（解决启动时「规约不存在」） |
| **即时刷新** | 指令下发后 Console 立即探针一次并推送前端（SSE），UI 不必等下一个探针周期 |
| **指令鉴权** | 网关 `iotGate.conf` 配置 `commandToken` 后，Console 需在 `application.properties` 配置同名 `gate.command-token`，请求带 `X-Gate-Token` 头 |

:::warning 已废弃的旧机制
原「网关 `-c -r` 主动注册 → 10s 心跳上报 → 30s 判离线 → 404 自愈重注册」这一整套**已随控制通道反转移除**：`-c` / `-r` 参数不再存在，网关侧也不再有注册/心跳客户端，原 RPC 端口 **10916 不再监听**。
:::

## 节点管理

实时展示网关节点列表，Console 通过 HTTP 探针（默认 10s）判活并区分失败原因，上下线经 SSE 实时推送到前端：

![节点管理](/img/iotgate/node-manage-v3.0.2.png)

| 接口 | 说明 |
|---|---|
| `GET /gate/nodes` | 节点列表（含在线状态） |
| `POST /gate/nodes` | 新增节点（网关 IP + 指令端口） |
| `DELETE /gate/nodes/{ip}` | 删除节点 |

## 规约远程管理

远程开启/关闭/新增/删除网关多规约解析服务，规约参数（大小端、起始符、长度域偏移/长度、是否含长度域、额外长度、端口、心跳）在线维护，**变更实时同步到网关**：

![规约管理（多规约策略配置）](/img/iotgate/strategy-page-v3.0.2.png)

:::warning
- 网关**指令端口为 10917**（`iotGate.conf` 的 `commandPort` 可改），Console 经此端口下发 `POST /gate/command`，请确保网络可达
- 指令端口能触发**高级规约**的 javassist 动态编译（等价于远程执行 Java 代码），**只应暴露在内网**
- kernel 模式默认端口为 **10915**（`-k` 命令行参数开启）
:::
