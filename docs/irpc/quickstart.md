---
sidebar_position: 2
---

# 快速开始

本文介绍 iRpc 的引入方式、服务端与客户端配置，以及 README 中给出的客户端调用示例。

:::warning 文档状态说明
iRpc 的 README 提供了启动类说明、yml 配置模版与**客户端**示例代码，但**未提供完整的服务端示例代码**（如服务接口定义、服务实现类如何注册与暴露）。因此本文的「服务端」部分只能给出配置层面的说明，完整可运行的服务端示例需要读者结合源码（`iRpc.serverTest` 包中的测试类）自行梳理。
:::

## 环境要求

README 未明确标注 JDK / Maven 版本要求，建议使用：

- **JDK 8+**（项目为 2021 年前后活跃的 Java 项目，README 未声明更高版本要求）
- **Maven 3.x**（用于引入依赖与构建）

:::note
以上环境建议基于仓库信息推断，并非 README 明示内容，如遇兼容问题请以实际编译环境为准。
:::

## 引入依赖

iRpc 发行版本已同步到 Maven 中央仓库，根据项目实际情况选择合适版本引入即可：

```xml
<dependency>
  <groupId>io.github.brianapple</groupId>
  <artifactId>iRpc</artifactId>
  <version>2.0.1-Release</version>
</dependency>
```

## 服务端配置

服务端通过 `ServerStarter` 启动，支持三种构造方式：

| 构造方法 | 作用 |
|--|--|
| `ServerStarter()` | 默认加载配置文件名为 `application.yml` 的配置文件，加载位置默认为 resources 目录下 |
| `ServerStarter(String pathName)` | 指定配置 yml 文件名称，格式为 `xxx.yml` |
| `ServerStarter(IRpcServerProperty property)` | 通过 JavaBean 方式配置服务端信息 |

### 服务端 yml 配置详解

| 参数名称 | 含义 |
|--|--|
| `iRpcServer` | iRpc 服务端配置信息 |
| `serverPort` | 服务端监听端口 |
| `heartbeat` | 服务端监测客户端心跳周期（配置表中标注**暂未使用**） |
| `nodeName` | 当前服务节点名称，为 `ClusterNode-node` 值 |
| `ClusterNode` | Leader-Follower 集群模式节点信息，集群模式下多个节点的 `ClusterNode` 信息一样 |
| `node` | 节点名称（建议使用 `n0-nx`，沿用 dledger 的模式） |
| `ip` | iRpcServer 节点 ip 地址（或域名） |
| `port` | iRpcServer 节点服务端口 |

### 服务端 yml 配置模版

```yaml
## iRpc服务端配置信息
iRpcServer:
  serverPort: 10916
  heartbeat: 60 # iRpc服务端检测iRpc客户端连接状态的最大心跳周期。
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

:::tip
**单机模式**下不配置 `ClusterNode` 项即可；**集群模式**下各节点的 `ClusterNode` 信息必须保持一致。
:::

## 客户端配置

客户端通过 `ClientStarter` 启动，同样支持三种构造方式：

| 构造方法 | 作用 |
|--|--|
| `ClientStarter()` | 默认加载配置文件名为 `application.yml` 的配置文件，加载位置默认为 resources 目录下 |
| `ClientStarter(String pathName)` | 指定配置 yml 文件名称，格式为 `xxx.yml` |
| `ClientStarter(IRpcClientProperty property)` | 通过 JavaBean 实例化配置信息启动客户端 |

### 客户端 yml 配置详解

| 参数名称 | 含义 |
|--|--|
| `iRpcClient` | iRpc 客户端配置信息 |
| `retryTimes` | serverNode 节点网络连接失败重试次数，默认为 3 次 |
| `serverModCluster` | `true/false`，服务端是否为 Leader-Follower 模式 |
| `serverNode` | iRpc server 端节点信息 |
| `ip` | iRpcServer 节点 ip 地址（或域名） |
| `port` | iRpcServer 节点服务端口 |

### 客户端 yml 配置模版

```yaml
#iRpc客户端配置信息
iRpcClient:
  retryTimes: 3
  serverModCluster: true
  serverNode:
    - ip: 127.0.0.1 # 指定iRpc客户端连接的iRpc服务端节点信息，默认与第一个节点建立连接。
      port: 10916
    - ip: 127.0.0.1
      port: 10917
    - ip: 127.0.0.1
      port: 10918
```

:::note
客户端默认与 `serverNode` 列表中的**第一个节点**建立连接；`serverModCluster: true` 表示服务端以 Leader-Follower 集群模式运行。
:::

## 客户端调用示例（README 原文提炼）

README 给出的客户端 demo 如下：

```java
public class Test {
	public static void main(String[] args) {
		ServerRpc();
	}
	/**
	 * rpc服务端
	 */
	public static void ServerRpc(){
		ClientStarter clientStarter = new ClientStarter();
		try {
			Thread.sleep(6000);
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
		while(true) {
			/**
			 * 同步消息发送
			 */
			Class<? >[] classType = new Class[]{String.class};
			Object[] argsData = new Object[]{"world"};
			ResponseData ret = MessageSender.synBaseMsgSend(false,
					"iRpc.rpcService.RPCExportServiceImpl",
					"test",
					classType,
					argsData,
					5000);

			System.out.println("客户端同步收到数据："+ret.getData());
			//控制台输出：客户端同步收到数据：hello world
		}
	}
}
```

示例要点：

- 先实例化 `ClientStarter`（默认加载 resources 下的 `application.yml`）启动客户端；
- 通过 `MessageSender.synBaseMsgSend` 发起同步调用：目标服务为 `iRpc.rpcService.RPCExportServiceImpl`，方法名为 `test`，参数类型 `String.class`，参数值 `"world"`，超时 5000ms；
- 控制台输出：`客户端同步收到数据：hello world`。

:::warning
该 demo 中方法名 `ServerRpc` 实际执行的是**客户端**启动与消息发送逻辑（README 原文如此）；且示例依赖服务端已存在 `RPCExportServiceImpl` 服务，但 README 未给出该服务端的实现代码，需要结合源码补齐。
:::

## 下一步

- 了解服务端启动类与集群选举机制：见《架构与核心机制》。
- 阅读 `iRpc.serverTest` 包中的测试类：README 指出集群动态扩容的测试方法位于该包。
