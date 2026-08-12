---
sidebar_position: 2
---

# 快速开始

本文档介绍如何从源码构建 IOTGate，完成最小配置并启动一个可运行的网关实例。

## 环境要求

- **操作系统**：Linux（README 中的启动命令面向 Linux 环境）
- **Java 环境**：能够执行 `java -jar` 的 JDK（v2.2 配套控制台要求 JDK 21，网关本身以可执行 jar 形式运行）
- **构建工具**：Maven（`mvn package` 打 jar 包）
- **知识准备**：物联网应用层协议基础知识，如**大小端（字节序）**、**长度域**、**拆包/黏包**等概念

:::warning
IOTGate 的使用有一定门槛：配置多规约解析规则时，需要正确理解长度域偏移、长度域长度、长度是否包含长度域本身等参数，否则报文将无法正确拆包。
:::

## 获取源码

源码地址（源码优先更新码云仓库）：

- GitHub：https://github.com/BrianApple/IOTGate
- 码云（Gitee）：https://gitee.com/willbeahero/IOTGate

```bash
git clone https://gitee.com/willbeahero/IOTGate.git
cd IOTGate
```

## 编译打包

README 要求"自行将项目打成 jar 包"，在项目根目录执行：

```bash
mvn package
```

构建产物位于 `target/` 目录下，可执行 jar 包形如 `IOTGate-2.2.0-RELEASE.jar`，启动时将其作为 `iotGate.jar` 使用：

```bash
java -jar target/IOTGate-2.2.0-RELEASE.jar -n 1 -f /path/to/iotGate.conf
```

## 最小配置

### 1. 编写规约配置文件 iotGate.conf

网关启动时通过 `-f`（必选参数）加载多规约规则文件，多个规则之间**分号分隔**。仓库自带的 `iotGate.conf` 内容如下：

```properties
# pId,isBigEndian(0=false),beginHexVal,lengthFieldOffset,lengthFieldLength,isDataLenthIncludeLenthFieldLenth(0=false),exceptDataLenth,port,heartbeat
protocolType=1,0,-1,1,2,1,1,9811,60;2,1,-1,0,4,0,0,9812,300;3,1,-1,4,2,0,0,9813,130;
```

其中：

- `pId`：规约编号，`pId=1` 为默认规约
- `isBigEndian`：是否大端，`0` 表示 false
- `beginHexVal`：起始符（十六进制值），`-1` 表示无
- `lengthFieldOffset`：长度域偏移
- `lengthFieldLength`：长度域长度
- `isDataLenthIncludeLenthFieldLenth`：数据长度是否包含长度域本身，`0` 表示 false
- `exceptDataLenth`：额外长度
- `port`：该规约对应的端口号（废弃了原 `-p` 命令行参数指定启动端口的方式）
- `heartbeat`：该规约的心跳周期（秒）

### 2. 准备前置服务（master）

IOTGate 与前置（master）通过数据通道通信，前置默认端口为 **8888**。最小部署时只需知道前置的 IP 地址即可。

## 启动步骤

命令行参数说明：

| 参数 | 是否必选 | 是否含参 | 含义 |
|------|---------|---------|------|
| `-n` | 是 | 是 | 网关编号 |
| `-c` | 否 | 否 | 开启"主动注册到前端管理服务(IOTGateConsole)"，需配合 `-r` 指定 Console 地址 |
| `-r` | 否 | 是 | 前端管理服务(Console)地址，支持 `ip` / `ip:port` / `http://ip:port`，默认端口 8686，如 `192.168.1.10:8686` |
| `-m` | 否 | 是 | 前置 ip 地址（不含端口，前置默认 8888） |
| `-k` | 否 | 否 | 开启 kernel 模式，默认端口为 10915 |
| `-f` | 是 | 是 | 配置文件 `iotGate.conf` 的本地全路径 |

### 单机方式启动

使用 `-m` 指定前置服务地址：

```bash
java -jar iotGate.jar -n 1 -f /opt/iot/iotGate.conf -m 192.168.1.10
```

### 集群方式启动

使用 `-c -r` 开启"主动注册到前端管理服务"模式，`-r` 指定 IOTGateConsole 地址（支持 `ip` 或 `ip:port`，默认端口 8686），同时 `-m` 指定前置服务地址（多个地址逗号分隔；v2.0 起去除 Zookeeper 依赖，通过 `-m` 直连前置，数据通道零改动）：

```bash
java -jar iotGate.jar -n 1 -f /opt/iot/iotGate.conf -c -r 192.168.1.100:8686 -m 192.168.1.10,192.168.1.11
```

:::tip
`-n`（网关编号）与 `-f`（配置文件全路径）是必选参数，其余参数按部署形态选用。
:::

## 验证运行

### 端口监听检查

启动后网关会监听以下端口（取决于启动参数）：

- **8888**：前置(master)数据通道（`-m` 参数直连）
- **9811 / 9812 / 9813 等**：各规约对应的终端接入端口（由 `iotGate.conf` 中 `port` 字段决定）

```bash
ss -lntp | grep -E '8888|9811|9812|9813'
```

### 终端连接验证

使用 TCP 客户端连接规约端口（如 9811），发送符合规约结构的真实报文，观察网关是否正常拆包并转发给前置：

```bash
# 以 nc 为例连接规约 1 的端口
nc 127.0.0.1 9811
```

### 集群模式验证

若以 `-c -r` 启动，注册成功后网关每 **10s** 向 Console 发送一次心跳；Console 侧 **30s** 未收到心跳自动判定节点离线。可在 IOTGateConsole 的节点管理页实时查看网关节点状态、最近心跳与在线时长。
