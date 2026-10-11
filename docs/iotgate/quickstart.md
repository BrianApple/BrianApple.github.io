---
sidebar_position: 2
---

# 快速开始

本文给出 IOTGate 网关从 **编译 → 配置 → 启动 → 验证** 的完整流程，覆盖单机与集群两种部署形态。

:::info 版本说明
本文按仓库 master（`v3.0.2-RELEASE`）整理，构建产物为 `IOTGate-3.0.2-RELEASE.jar`。
Gitee 上已发布的 Release 为 **v3.0.1**（2026-08-12，AI 智能体版），v3.0.2 尚未打 tag。
:::

## 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| JDK | **JDK 8 及以上** | 源码编译目标为 `1.8`；实测 JDK 21 亦可运行 |
| Maven | 3.6+ | 用于 `mvn package` |
| 操作系统 | Linux / Windows | 示例均为 Linux |
| 可选 | IOTGateConsole | 管理平台：JDK 21 + Spring Boot 3.5，默认端口 **8686**，需 **MySQL 8.0+** |

## 2. 获取源码并打包

```bash
git clone git@gitee.com:willbeahero/IOTGate.git
cd IOTGate
mvn package -DskipTests
```

产物为 `target/IOTGate-3.0.2-RELEASE.jar`。入口类是 `Entrance.java`，直接 `java -jar` 运行，无容器依赖。

## 3. 编写 iotGate.conf

启动时必须用 `-f` 指定该文件的**本地全路径**。**一条规则 = 一个规约**，多条规则以 `;` 分隔：

```properties
# pId,isBigEndian(0=false),beginHexVal,lengthFieldOffset,lengthFieldLength,isDataLenthIncludeLenthFieldLenth(0=false),exceptDataLenth,port,heartbeat
protocolType=1,0,-1,1,2,1,1,9811,60;2,1,-1,0,4,0,0,9812,300;3,1,-1,4,2,0,0,9813,130;
```

默认内置三种规约：

| 规约编号 | 说明 | 终端接入端口 | 心跳周期 |
|---|---|---|---|
| `1` | modbus TCP | 9811 | 60s |
| `2` | IEC 104 | 9812 | 300s |
| `3` | DLT 645 | 9813 | 130s |

另有**两个可选的网关级配置项**（不写则使用默认值）：

```properties
# 指令服务端口（Console → 网关），默认 10917
commandPort=10917
# 指令鉴权 token：配置后 Console 必须带同样的 X-Gate-Token 请求头
commandToken=change-me
```

:::note
- 文件中以 `#` 开头的行会被忽略（可用于注释掉整行配置）。
- 单机版可通过配置文件个性化配置各规约的**心跳周期**；集群版默认心跳周期为 300 秒。
- **9 个参数的逐项含义、取值与常见配错后果**详见 [iotGate.conf 参数详解](./reference/iotgate-conf.md)；默认两条真实报文结构见 [真实报文帧结构](./reference/real-message-frame.md)。
- 更多规约可通过 IOTGateConsole 远程开启/关闭/新增，也可直接在本文件中追加。
:::

## 4. 启动网关

```bash
java -jar target/IOTGate-3.0.2-RELEASE.jar -n 1 -f /opt/iotgate/iotGate.conf
```

### 命令行参数

现役参数共 5 个，以下清单以 `-h` 输出为准：

| 参数 | 必填 | 是否含参 | 含义 |
|---|---|---|---|
| `-n` | 是 | 是 | 网关编号 |
| `-f` | 是 | 是 | 配置文件 `iotGate.conf` 的本地全路径 |
| `-m` | 否 | 是 | 前置(master)地址（不含端口，前置默认 8888）；多个前置以**逗号分隔** |
| `-k` | 否 | 否 | 开启 kernel 模式，默认端口 10915 |
| `-h` | 否 | 否 | 打印帮助信息 |

### 单机方式启动

用 `-m` 指定前置服务地址：

```bash
java -jar target/IOTGate-3.0.2-RELEASE.jar -n 1 -m 192.168.1.20 -f /opt/iotgate/iotGate.conf
```

### 集群方式启动

`-m` 指定多个前置地址（**逗号分隔**，轮询负载均衡）。**网关侧无需配置 Console 地址**：

```bash
java -jar target/IOTGate-3.0.2-RELEASE.jar -n 1 -m 192.168.1.20,192.168.1.21 -f /opt/iotgate/iotGate.conf
```

:::tip
v2.0 起已去除 ZooKeeper 依赖：集群通过 `-m` 直连前置，数据通道（8888）逻辑零改动。
:::

:::warning 已移除的参数：`-c` / `-r` / `-z`
`-c`、`-r`（原「网关主动注册到前端管理服务」）与 `-z`（原 ZooKeeper 地址）**均已移除**，传入会直接启动失败：

```text
启动参数错误: Unrecognized option: -c
usage: iotGateServer ...
```

进程以**退出码 255** 结束。节点接入已改为**在 Console 侧登记网关 IP 与指令端口**，见 [部署指南](./deployment.md)。
:::

## 5. 验证启动

网关启动后会常驻**指令服务**（默认 **10917**），可直连探针确认：

```bash
curl http://127.0.0.1:10917/gate/status
```

返回网关运行快照（网关编号、启动时间、已加载规约及其 running 状态等）。控制台正是依靠这个探针判活、并在发现规约缺失时自动补发。

## 6. 与控制台的控制通道

| 方向 | 接口 | 说明 |
|---|---|---|
| Console → 网关 | `GET /gate/status` | **探针**：取网关运行快照，Console 默认每 **10s** 轮询一次判活 |
| Console → 网关 | `POST /gate/command` | **下发指令**：`SYNC_STRATEGY` / `ADD_PROTOCOL` / `ADD_PROTOCOL_HIGH` / `START_PROTOCOL` / `STOP_PROTOCOL` / `DELETE_PROTOCOL` |

- 网关**不主动上报**运行状态，Console 侧状态全部来自探针结果
- 配置了 `commandToken` 时，Console 必须在请求头携带 `X-Gate-Token`

:::warning 安全提示
10917 的 `/gate/command` 支持**高级规约**，可触发 javassist 运行时动态编译（等价于远程执行 Java 代码），**只应暴露在内网**。
:::

## 7. 端口一览

| 端口 | 说明 |
|---|---|
| **8888** | 前置(master)数据通道（`-m` 参数直连，默认端口） |
| **10915** | kernel 模式默认端口（`-k` 命令行参数开启） |
| **10917** | 指令服务端口（Console → 网关），可由 `commandPort` 修改 |
| **9811 / 9812 / 9813** | 各规约的终端接入端口（由 `iotGate.conf` 的 `port` 字段决定） |
| **8686** | IOTGateConsole 管理平台默认端口 |

:::warning
**10916（原集群 RPC 端口）不再监听**。若有防火墙策略或巡检脚本按 10916 判活，需同步调整。
:::

## 8. 配合控制台使用

网关配合 IOTGateConsole 使用时，访问控制台登录页，用户名密码随意输入（没有存库）：

![新版登录页](/img/iotgate/login-v3.0.2.png)

## 9. 压测验证

win10 笔记本、堆内存 2G、线程数 6k 条件下的压测聚合报告：

![IOTGate 开源版压测聚合报告](/img/iotgate/benchmark-report.png)

本地压测数据：单网关、单前置节点，每秒处理并发心跳 8000+，20W 在线终端（长连接保持）内存占用量 1G 左右。

## 10. 常见问题

| 现象 | 原因与处置 |
|---|---|
| 启动即退出并打印 `启动参数错误` | 参数拼写错误，或使用了已移除的 `-c` / `-r` / `-z`；`-n` 与 `-f` 均为必填 |
| 报找不到配置文件 | `-f` 必须是 `iotGate.conf` 的**绝对路径**且进程有读权限；网关会把日志/缓存写到该文件的**父目录**下 |
| 指令服务起不来 | 10917 被占用，改用 `commandPort` 指定其他端口（Console 侧登记节点时端口要一致） |
| 控制台看不到节点 | 确认节点登记的端口 = 网关 `commandPort`（默认 10917），且控制台到网关网络可达 |
| 改完 conf 不生效 | `protocolType` 只在**启动时**读取；修改后需重启网关（运行中新增/启停规约请走控制台） |
