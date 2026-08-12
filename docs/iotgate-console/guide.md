---
sidebar_position: 3
---

# 使用指南

本文介绍 IOTGateConsole 的核心使用逻辑：节点状态判断、动态注册与静态配置、SSE 实时推送、规约启停操作以及 AI 智能体的使用。

## 节点在线状态判断逻辑

节点列表中的"在线/离线"状态由 **NodeMonitorService 定时 TCP 探测**得出（每 10s 一次，探测节点 **10916** RPC 端口，2s 超时），**动态注册节点与静态配置节点完全一致，无差别对待**：

- 连接成功 → 在线；连接失败/超时 → 离线
- 状态变化时通过 SSE `node-status` 事件实时推送前端更新

:::note
- **静态配置节点**虽无心跳上报（"最近心跳/在线时长"列显示 `-`），但其在线状态同样是真实探测结果：静态配置本机 `127.0.0.1` 且网关运行中 → 显示在线；静态配置不存在的 IP → 一直显示离线
- **动态注册节点**在线状态由注册表心跳（30s 超时移除）与 TCP 探测双重保障
:::

## 动态注册 vs 静态配置

网关节点发现采用**网关主动注册 + 静态配置兜底**双通道，不再依赖 ZK 注册中心：

| 通道 | 机制 | 说明 |
|---|---|---|
| **动态注册（推荐）** | 网关 `-c -r <consoleIp>` 主动注册 | `POST /gate/register` 注册 → 每 10s 心跳上报（`POST /gate/heartbeat`）→ 30s 未收到心跳自动判离线并移除 → 正常关闭时主动反注册（`POST /gate/unregister`）。注册成功即自动同步规约 |
| **静态兜底** | `application.properties` 中 `gate.nodes` | 配置网关节点 IP 列表（支持 `ip` 或 `ip:port` 格式，默认 RPC 端口 10916），与动态注册并存，**注册的节点优先、静态配置兜底** |

网关启动示例：

```bash
java -jar iotGate.jar -n 1 -c -r 192.168.1.10:8686 -m 192.168.1.20 -f /opt/iotgate/iotGate.conf
```

## SSE 实时推送

前端通过 SSE（`GET /rpc/events`）实时接收网关节点上下线状态、规约变更事件，替代原 ZK 事件监听机制：

- `node-status` 事件：节点在线状态变化实时推送
- 规约变更事件：规约新增/删除/启停实时推送

## 节点管理

实时展示网关节点列表，区分**动态注册**（网关 `-c -r` 主动注册，含最近心跳、在线时长）与**静态配置**（`gate.nodes` 兜底）两种来源，运行规约、节点在线状态、RPC 连通状态一目了然：

![节点管理页](/img/iotgate-console/node-manage-v2.2.png)

## 规约启停操作

规约管理页支持远程**开启/关闭/新增/删除**网关多规约解析服务，规约参数（大小端、长度域偏移/长度、端口等）在线维护，变更实时同步到网关：

![规约管理页](/img/iotgate-console/strategy-page-v2.png)

相关接口：

- `POST /rpc/addOneStrategy` 新增规约（表单格式 `data[pid]=xx&data[straName]=xx...`）
- `POST /rpc/updateStrategyNode` 更新网关节点启用的规约
- `POST /rpc/delOneStrategyByPID` 删除规约（`str=pid`）
- `POST /rpc/getAllStrategyAllInfo` 获取所有规约完整信息

:::tip
规约启停通过网关 RPC 端口 **10916** 下发，请确保控制台与网关网络可达。
:::

## AI 智能体使用

控制台内置 🤖 悬浮智能体机器人（右下角，主流客服交互设计），集**对话解析**与**大模型配置管理**于一体。

### 对话解析

粘贴通信协议的**帧结构描述**（协议文档中的字段定义：帧头、各字段字节数、**长度域位置与定义**、字节序、校验帧尾等），AI 自动提取长度域信息，推导出网关拆包/黏包解码参数（大小端/起始符/长度域偏移/长度域长度/长度含长度域标志/额外长度/端口），并支持**一键填充**到新增规约表单：

![智能体对话解析](/img/iotgate-console/bot-chat-v2.2.png)

### 大模型配置动态设置

**厂商无关**，支持任意 OpenAI 兼容接口（DeepSeek / 通义千问 / 智谱GLM / Ollama / OpenAI 等）。点击机器人右上角 ⚙️ 可视化修改模型地址、模型名称、API Key、采样温度、超时时间，**保存立即生效，无需重启**，配置持久化本地（重启后保留）：

![模型设置面板](/img/iotgate-console/bot-settings-v2.2.png)

默认配置：

```properties
ai.api-key=${DEEPSEEK_API_KEY:}    # 建议环境变量注入，勿硬编码提交
ai.base-url=https://api.deepseek.com/v1
ai.model=deepseek-chat
ai.temperature=0.1
ai.timeout-seconds=60
```

常见模型切换示例：

| 模型 | base-url | model |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` |
| Ollama 本地 | `http://localhost:11434/v1` | 本地模型名（无需 Key） |

后端接口：

- `POST /rpc/ai/parse` 解析帧结构描述
- `GET /rpc/ai/config` 获取大模型配置（API Key 脱敏返回）
- `POST /rpc/ai/config` 动态更新大模型配置（即时生效）

:::warning
API Key 请通过环境变量 `DEEPSEEK_API_KEY` 注入，勿硬编码提交到仓库；配置修改保存后立即生效，无需重启。
:::
