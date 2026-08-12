---
sidebar_position: 1
---

# iRpc 产品介绍

## 项目定位

iRpc 是一款基于 **NIO 通信**实现的轻量级高性能 RPC 框架，支持**单机**及 **Leader-Follower** 两种部署模式，配置简单、通信效率高。

它最突出的特点是：**不依赖第三方注册中心**即可实现服务端自主选举（选举模块基于 Apache 开源项目 dledger 源码改造而来），因此开箱即用，无需额外部署 ZooKeeper、Nacos 等注册中心组件。

:::note
本文档基于 Gitee 仓库 `willbeahero/iRpc` 的 README 提炼。该仓库 README 内容相对精简，部分细节（如服务端完整示例代码、协议报文格式）未在 README 中展开，本文档只描述仓库中已有的内容，不额外杜撰。
:::

## 核心特性

- **NIO 通信模型**：基于 Java NIO 实现高并发网络通信，框架底层依赖 Netty 项目。
- **轻量级**：无第三方注册中心依赖，配置简单，适合中小型服务快速接入 RPC。
- **双部署模式**：支持单机模式与 Leader-Follower 集群模式，通过配置一键切换。
- **多消息发送方式**：提供同步（`synBaseMsgSend`）与异步（`asynBaseMsgSend`，CallBack 模式）等多种消息发送方式。
- **自主选举**：基于 Raft 选举算法实现节点自举，选举模块基于 dledger 源码改造，不依赖任何外部组件。
- **集群动态扩容**：2.0.3 版本起支持 `"AB + C(A) -> ABC"`、`"AB + C(AB) -> ABC"` 等动态扩容模式。
- **多种配置方式**：既支持 yml 配置文件，也支持通过 JavaBean（`IRpcServerProperty` / `IRpcClientProperty`）方式编程式配置。
- **Maven 中央仓库发布**：发行版本已同步到 Maven 中央仓库，直接引入依赖即可使用。

## 为什么不需要注册中心

传统 RPC 框架通常依赖注册中心完成服务发现与集群管理，而 iRpc 采用不同的思路：

- 服务端节点通过 **Raft 选举算法**自行选出 Leader，完成节点自举；
- 每个节点都持有当前集群下的**所有节点信息**（`ClusterNode` 全量配置），集群拓扑通过配置文件同步，而不是通过注册中心动态发现；
- 客户端通过 `serverNode` 列表直接配置服务端节点地址，默认与第一个节点建立连接。

这种设计的代价是：集群拓扑变化（扩容）需要新节点携带原集群的节点信息且 `groupName` 一致才能参与选举；好处是部署架构中少了一个外部依赖，运维更简单。

:::tip
如果服务规模较大、节点频繁上下线，需要权衡「无注册中心」的简洁性与「注册中心」的动态性；iRpc 的定位更适合节点拓扑相对稳定的中小规模集群。
:::

## 技术基础

iRpc 的诞生参考了以下开源项目（README「感谢」部分）：

| 项目 | 说明 |
|--|--|
| [Netty](https://github.com/netty/netty) | NIO 网络通信框架 |
| [dledger（openmessaging-storage-dledger）](https://github.com/openmessaging/openmessaging-storage-dledger) | 选举模块源码改造来源 |
| [IOTGate](https://gitee.com/willbeahero/IOTGate) | 同作者的另一开源项目 |

## 版本历史

| 版本 | 说明 |
|--|--|
| `1.0.2.Release` | 修复了 1.0.1 及之前版本客户端无法正常启动的异常 |
| `2.0.1` | 支持集群动态扩展，支持配置信息通过 JavaBean 方式配置 |
| `2.0.3` | 完善集群扩展功能，支持 `"AB + C(A) -> ABC"`、`"AB + C(AB) -> ABC"` 等动态扩容模式，测试方法见 `iRpc.serverTest` 包中的测试类 |

## 快速上手概览

iRpc 的使用路径非常简短：

```xml
<dependency>
  <groupId>io.github.brianapple</groupId>
  <artifactId>iRpc</artifactId>
  <version>2.0.1-Release</version>
</dependency>
```

1. **服务端**：通过 `ServerStarter` 启动（默认加载 resources 下 `application.yml`），配置 `iRpcServer` 与 `ClusterNode` 节点信息；
2. **客户端**：通过 `ClientStarter` 启动，配置 `iRpcClient` 下的 `serverNode` 节点列表；
3. **调用**：通过 `MessageSender.synBaseMsgSend`（同步）或 `asynBaseMsgSend`（异步）发送消息。

更详细的配置模版与调用示例见《快速开始》文档。

## 生态与教程

- 於之博客系列教程：https://www.xianglong.work/tag/iRpc
- 於之 CSDN 专栏：https://blog.csdn.net/sinat_28771747/category_10967790.html

## 参与贡献

仓库 README 给出了标准的贡献流程：

1. Fork 本仓库；
2. 新建 `Feat_xxx` 分支；
3. 提交代码；
4. 新建 Pull Request。

:::tip
仓库开源协议为 Apache-2.0，最后活跃时间约为 2021 年。将其用于生产环境前，建议先阅读源码评估其成熟度。
:::
