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

网关 `-c -r <consoleIp>` 主动注册到 IOTGateConsole，Console 提供**节点监控、规约启停管理、AI 智能体**等能力，形成完整的"网关-控制台"管理闭环：

```bash
java -jar iotGate.jar -n 1 -c -r 192.168.1.10:8686 -m 192.168.1.20 -f /opt/iotgate/iotGate.conf
```

:::note
使用前提：管理平台需配置 MySQL（本机 13306/3306 均可，见 IOTGateConsole README）并启动；网关侧无需任何配置依赖 Console 的注册表，未启动 Console 时网关仅以 `-m` 模式运行，**不影响数据通道**。
:::

## 集群部署

集群方式启动：命令行参数 `-c -r` 开启"主动注册到前端管理服务"模式，`-r` 指定 IOTGateConsole 地址（支持 `ip` 或 `ip:port`，默认端口 8686），同时 `-m` 指定前置服务地址（**逗号分隔**，支持多前置负载均衡）：

```bash
java -jar iotGate.jar -n 1 -c -r 192.168.1.10:8686 -m 192.168.1.20,192.168.1.21 -f /opt/iotgate/iotGate.conf
```

:::tip
v2.0 起去除 zookeeper 依赖，集群模式通过 `-m` 直连前置，数据通道零改动；网关与前置通讯时默认采用**轮询方式负载均衡**。
:::

## 部署前置检查清单

| 检查项 | 要求 |
|---|---|
| IOTGateConsole 服务 | 已启动，默认端口 8686 可访问 |
| MySQL | 已就绪（本机 13306/3306 均可，见 IOTGateConsole README），`strategy.sql` 已导入 |
| 网关 RPC 端口 | 10916 端口开放，Console 可达（规约启停等 RPC 调用依赖） |
| 前置(master) | 8888 端口可达（`-m` 直连） |
| 网络 | 网关 ↔ Console、网关 ↔ 前置 网络互通 |

## 与 Console 协同机制

| 机制 | 说明 |
|---|---|
| **主动注册** | 网关启动时通过 `-c -r` 主动注册到 IOTGateConsole（`POST /gate/register`），注册成功即自动同步规约 |
| **心跳上报** | 注册成功后网关每 **10s** 向 Console 发送心跳（`POST /gate/heartbeat`） |
| **离线判定** | Console 侧 **30s** 未收到心跳自动判离线并移除 |
| **自愈重注册** | 节点不存在时心跳返回 `retSig=404`，触发网关**重新注册** |
| **正常反注册** | 网关正常关闭时主动反注册（`POST /gate/unregister`） |
| **双通道并存** | Console 侧注册表与静态 `gate.nodes` 配置并存：**主动注册的节点优先，静态配置兜底** |

## 节点管理

实时展示网关节点列表，区分**动态注册**（网关 `-c -r` 主动注册，含最近心跳、在线时长）与**静态配置**（application.properties 中 `gate.nodes` 兜底）两种来源，节点在线状态、RPC 连通状态一目了然：

![节点管理（动态注册节点监控）](/img/iotgate/node-manage-v2.2.png)

## 规约远程管理

远程开启/关闭/新增/删除网关多规约解析服务，规约参数（大小端、长度域偏移/长度、端口等）在线维护，变更实时同步到网关：

![规约管理（多规约策略配置）](/img/iotgate/strategy-page-v2.png)

:::warning
- 网关 RPC 端口为 **10916**（集群模式下开启），Console 经此端口调用网关规约启停等 RPC，请确保网络可达
- kernel 模式默认端口为 **10915**（`-k` 命令行参数开启）
:::
