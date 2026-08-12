---
sidebar_position: 3
---

# 架构与核心机制

本文基于 README 与仓库说明，梳理 iRpc 的架构与核心机制：NIO 通信模型、启动类体系、Leader-Follower 节点机制、基于 Raft 的选举算法与集群动态扩容、消息发送机制。

:::note
iRpc 的 README 未给出完整的类图与源码级说明，以下内容以 README 描述为准，涉及源码包名（如 `iRpc.base.messageDeal.MessageSender`）均来自 README 原文。
:::

## NIO 通信模型

iRpc 是一款基于 **NIO（Non-blocking I/O）** 通信实现的 RPC 框架，网络层基于 Netty 构建：

- 客户端与服务端之间通过 NIO 通道进行通信，支持高并发连接；
- 服务端通过 `serverPort` 监听客户端请求，客户端通过 `serverNode` 中的 `ip` / `port` 连接服务端节点；
- 通信效率高、配置简单是 README 强调的核心卖点。

```
┌─────────────┐   NIO 连接    ┌──────────────────┐
│  客户端       │ ───────────▶ │  iRpcServer 节点  │
│ ClientStarter│ ◀─────────── │  (serverPort)    │
└─────────────┘  响应/回调     └──────────────────┘
```

## 启动类体系

iRpc 的启动入口分为服务端与客户端两类，均支持「默认配置文件 / 指定配置文件 / JavaBean」三种构造方式。

### ServerStarter（服务端启动类）

| 构造方法 | 作用 |
|--|--|
| `ServerStarter()` | 默认加载 resources 目录下名为 `application.yml` 的配置文件 |
| `ServerStarter(String pathName)` | 指定配置 yml 文件名称，格式为 `xxx.yml` |
| `ServerStarter(IRpcServerProperty property)` | 通过 JavaBean 方式配置服务端信息 |

### ClientStarter（客户端启动类）

| 构造方法 | 作用 |
|--|--|
| `ClientStarter()` | 默认加载 resources 目录下名为 `application.yml` 的配置文件 |
| `ClientStarter(String pathName)` | 指定配置 yml 文件名称，格式为 `xxx.yml` |
| `ClientStarter(IRpcClientProperty property)` | 通过 JavaBean 实例化配置信息启动客户端 |

:::tip
2.0.1 版本起支持配置信息通过 JavaBean 方式传入（`IRpcServerProperty` / `IRpcClientProperty`），适合需要动态组装配置的场景。
:::

## Leader-Follower 节点机制

iRpc 支持**单机**与 **Leader-Follower** 两种部署模式，由服务端配置中的 `ClusterNode` 描述集群节点信息：

```yaml
iRpcServer:
  serverPort: 10916
  heartbeat: 60
  nodeName: n0
  ClusterNode: #如果使用单机，则不配置该项,node从n1开始，n0属于localhost
    - node: n0
      ip: 127.0.0.1
      port: 10916
    - node: n1
      ip: 127.0.0.1
      port: 10917
    - node: n2
      ip: 127.0.0.1
      port: 10918
```

关键规则：

- **`nodeName`**：当前服务节点名称，取值为 `ClusterNode` 中某个 `node` 的值（如 `n0`）；
- **`ClusterNode`**：集群模式下，多个节点的 `ClusterNode` 信息**必须一致**，即每个节点都持有完整的集群拓扑；
- **节点命名**：建议使用 `n0-nx`，沿用 dledger 的命名模式；
- **单机模式**：不配置 `ClusterNode` 即可（README 注释说明：node 从 n1 开始，n0 属于 localhost）。

## Raft 选举算法实现

iRpc 的集群**基于 Raft 选举算法实现节点自举**，选举模块基于 dledger（openmessaging-storage-dledger）源码改造：

- **不依赖第三方注册中心**：服务端节点通过 Raft 算法自行选举出 Leader，无需 ZooKeeper / Nacos 等外部组件；
- **全量拓扑感知**：当前选举模式下，节点包含当前集群下的**所有节点信息**（即 `ClusterNode` 全量配置），这是选举与扩容能够达成一致的前提；
- **选举一致性**：参与选举的节点必须持有相同的集群视图，才能通过投票达成共识。

```
  n0 ──┐
  n1 ──┼── Raft 选举 ──▶ 选出 Leader，其余为 Follower
  n2 ──┘   （节点自举，无外部注册中心）
```

:::note
README 未给出选举的具体实现类名与任期（term）等细节，仅说明「选举模块基于 dledger 源码改造」；深入实现可对照 dledger 源码学习。
:::

## 集群动态扩容

iRpc 的集群扩容**依然基于 Raft 选举**，2.0.3 版本起支持动态扩容。扩容有两个硬性前提：

1. 扩容节点与原集群的 **`groupName` 必须一致**；
2. iRpc **不支持两个存在 Leader 节点的集群合并扩容**。

### 扩容模式一：AB + C(A) 或 AB + C(B) -> ABC

AB 集群基于 Raft 算法自举选出 Leader，节点 C 只携带 AB 集群中的**一部分节点信息**参与扩容，最终达成选举一致，形成 ABC 集群。

```
AB（已有 Leader） + C(仅携带 A 或 B 的节点信息)  ──▶  ABC
```

### 扩容模式二：AB + C(AB) -> ABC

AB 集群基于 Raft 算法自举选出 Leader，节点 C 携带**原集群全部节点信息**且 `groupName` 一致，参与集群扩容。

```
AB（已有 Leader） + C(携带 AB 全部节点信息，groupName 一致)  ──▶  ABC
```

:::tip
两种模式的差别在于新节点 C 携带的集群信息是「部分」（C(A) 或 C(B)）还是「全部」（C(AB)）。测试方法见 `iRpc.serverTest` 包中的测试类。
:::

## 消息发送机制

消息发送的核心类为 `iRpc.base.messageDeal.MessageSender`：

| 方法名称 | 发送模式 | 返回结果 |
|--|--|--|
| `synBaseMsgSend` | 同步 | `ResponseData` 对象，`returncode != 200` 表示发送失败 |
| `asynBaseMsgSend` | 异步 | `boolean`，发布成功或失败，通过回调方式异步处理方法执行结果 |

同步调用示例（README 客户端 demo）：

```java
Class<?>[] classType = new Class[]{String.class};
Object[] argsData = new Object[]{"world"};
ResponseData ret = MessageSender.synBaseMsgSend(false,
        "iRpc.rpcService.RPCExportServiceImpl",
        "test",
        classType,
        argsData,
        5000);
System.out.println("客户端同步收到数据：" + ret.getData());
//控制台输出：客户端同步收到数据：hello world
```

参数依次为：是否异步标记（`false` 表示同步）、目标服务全类名、方法名、参数类型数组、参数值数组、超时时间（毫秒）。

:::note
README 说明框架「提供同步和异步（callBack 模式）等多种消息发送方式」，异步模式下通过回调（Callback）处理执行结果；更详细的回调接口定义需查阅源码。
:::

## 参考资料

- README 中给出的启动流程与客户端消息发送流程图（仓库内图片，本文不引用）。
- 系列教程：https://www.xianglong.work/tag/iRpc
- CSDN 专栏：https://blog.csdn.net/sinat_28771747/category_10967790.html
