---
sidebar_position: 3
---

# 使用指南

本文介绍 IOTGateConsole 的核心使用逻辑：节点登记与状态判断、SSE 实时推送、规约启停操作以及 AI 智能体的使用。

## 节点在线状态判断逻辑

节点列表中的"在线/离线"状态由 **NodeMonitorService 定时探针**得出：每 **10s** 对节点发起一次 **HTTP 探针**（`GET /gate/status`，见 `GateHttpClient.probe()`），端口取节点登记的指令端口（**默认 10917**）。

- 探针成功 → 在线，并同时取回网关运行快照（网关编号、启动时间、已加载规约等）
- 探针失败/超时 → 离线，并区分失败原因（连接被拒 / 超时 / 非预期响应）
- 状态变化时通过 SSE `node-status` 事件实时推送前端更新

:::note
探针周期由 `gate.monitor.interval-seconds` 控制（默认 10，单位秒），**它同时决定差量补发的节奏**。

若探针显示"IP 不一致"，通常是网关多网卡导致（网关自报 IP 与登记的 IP 不同），属提示性信息。
:::

## 节点登记

**不存在"动态注册"与"静态配置"两条通道**——节点统一在控制台侧登记，网关侧无需任何配置：

| 项 | 说明 |
|---|---|
| 登记方式 | 控制台「节点管理」页新增节点：填网关 IP + 指令端口（默认 10917） |
| 存储位置 | `gate_node` 表（**无需在 `application.properties` 配置节点列表**） |
| 判活方式 | Console 主动 HTTP 探针（10s），网关**不主动上报** |
| 网关侧要求 | 无需 `-c -r` 等注册参数（该类参数已从网关移除），仅需保证 10917 可达 |

相关接口：`GET /gate/nodes`、`POST /gate/nodes`、`DELETE /gate/nodes/{ip}`。

## 控制指令下发

规约的新增/启停/删除均由 Console **主动下发**到网关的指令服务（默认端口 10917）：

| 指令 | 说明 |
|---|---|
| `SYNC_STRATEGY` | 同步规约配置到网关本地缓存 |
| `ADD_PROTOCOL` | 添加基础规约 |
| `ADD_PROTOCOL_HIGH` | 添加高级规约（自定义长度域解析，网关侧运行时动态编译） |
| `START_PROTOCOL` | 启动指定规约的终端连接服务 |
| `STOP_PROTOCOL` | 停止指定规约的终端连接服务 |
| `DELETE_PROTOCOL` | 删除指定规约（先停止再移除缓存） |

补充机制：

- **差量补发**：以最近一次探针的运行集为基准，只下发必要的启停指令
- **自动补发**：探针发现网关缺少某规约时，自动补发一次 `ADD_PROTOCOL`（解决启动时报"规约不存在"）
- **即时刷新**：指令下发后立即探针一次并推送前端，UI 不必等下一个探针周期

## SSE 实时推送

前端通过 SSE（`GET /rpc/events`）实时接收节点上下线状态、规约变更事件，替代原 ZK 事件监听机制：

- `node-status` 事件：节点在线状态变化实时推送
- 规约变更事件：规约新增/删除/启停实时推送

## 节点管理

展示网关节点列表、在线状态与运行规约，新增/删除节点：

![节点管理页](/img/iotgate-console/node-manage-v3.0.2.png)

## 规约管理

规约管理页支持远程**开启/关闭/新增/删除**网关多规约解析服务，规约参数（大小端、起始符、长度域偏移/长度、是否含长度域、额外长度、端口、心跳）在线维护，变更实时同步到网关：

![规约管理页](/img/iotgate-console/strategy-page-v3.0.2.png)

相关接口：

- `POST /rpc/addOneStrategy` 新增基础规约（表单格式 `data[pid]=xx&data[straName]=xx...`）
- `POST /rpc/addOneStrategyHighControll` 新增**高级规约**（自定义长度域解析实现）
- `POST /rpc/updateStrategyNode` 更新网关节点启用的规约（差量下发启停）
- `POST /rpc/delOneStrategyByPID` 删除规约（`str=pid`）
- `POST /rpc/getAllStrategyAllInfo` 获取所有基础规约完整信息
- `POST /rpc/getAllStrategyAllInfoOnlyHigh` 获取所有高级规约完整信息

:::tip
规约启停通过网关**指令端口 10917** 下发（`GET /gate/status` 探针 / `POST /gate/command` 指令），请确保控制台与网关网络可达。若网关配置了 `commandToken`，控制台需配置同名 `gate.command-token`。
:::

:::warning 规约不支持编辑
IOTGate 网关侧只有 `ADD_PROTOCOL` / `DELETE_PROTOCOL`，**没有 update**。规约建错只能**删除后重建**——因此新增规约时请仔细核对参数（AI 一键创建时，若缺少规约名称或 `pId`，前端会弹框要求补齐）。
:::

## AI 智能体使用

控制台内置 🤖 悬浮智能体机器人（右下角，主流客服交互设计；**图标可拖拽**，拖拽不触发开关），集**对话解析**、**一键创建规约**与**大模型配置管理**于一体。

### 对话解析

粘贴通信协议的**帧结构描述**（协议文档中的字段定义：帧头、各字段字节数、**长度域位置与定义**、字节序、校验帧尾等），AI 流式返回**思考过程**与**结构化参数**：

![智能体对话解析](/img/iotgate-console/bot-chat-v3.0.2.png)

- **基础 / 高级规约自动判断**：默认判基础规约；出现"低位另有含义 / 需拼装 / 需按位提取"才判高级
- **一键创建**：高级规约携带长度域解析代码直接创建；基础规约填入新增表单由你确认
- **缺参追问**：决定性参数缺失时追问；端口、心跳等非决定性参数用默认值并告知
- **可停止**：解析中「发送」变为红色「停止」，点击即中断（后端同时断开与模型的连接，停止生成）
- **思考区**：可折叠、流式时自动展开、正文开始自动收起、自动滚动到底

### 多轮对话

同一会话内可连续补充信息，逐步修正参数。补充信息自动去重且上限 **12 条**，避免累积膨胀或矛盾堆叠。「清空」即切换到新会话。

### 大模型配置动态设置

**厂商无关**，支持任意 OpenAI 兼容接口（DeepSeek / 通义千问 / 智谱 GLM / Ollama / OpenAI 等）。点击机器人右上角 ⚙️ 打开设置面板，**支持配置多个模型**（列表管理，API Key 脱敏回显）；对话面板头部有**模型下拉**，选择记忆在本地，每条请求携带所选模型。**保存立即生效，无需重启**：

![模型设置面板](/img/iotgate-console/bot-settings-v3.0.2.png)

默认配置：

```properties
ai.api-key=${DEEPSEEK_API_KEY:}    # 建议环境变量注入，勿硬编码提交
ai.base-url=https://api.deepseek.com/v1
ai.model=deepseek-chat
ai.temperature=0.1
ai.timeout-seconds=300
```

常见模型切换示例：

| 模型 | base-url | model |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` |
| Ollama 本地 | `http://localhost:11434/v1` | 本地模型名（无需 Key） |

后端接口：

- `POST /rpc/ai/parse` 解析帧结构描述（阻塞版）
- `POST /rpc/ai/parse/stream` **流式**解析（SSE：`thinking` / `phase` / `result` / `error`）
- `GET|POST /rpc/ai/models`、`POST /rpc/ai/models/update`、`POST /rpc/ai/models/delete` 模型管理
- `GET /rpc/ai/config`、`POST /rpc/ai/config` 兼容旧接口
- `GET /rpc/ai/chat/sessions`、`GET /rpc/ai/chat/messages?sessionId=` 对话记录查询

### 对话记录

每轮问答（含思考过程）落库到 `ai_chat_message` 表，可按会话回看；写库失败不影响对话本身。

:::warning
API Key 请通过环境变量 `DEEPSEEK_API_KEY` 注入，勿硬编码提交到仓库；配置修改保存后立即生效，无需重启。

思考过程（`thinking` 事件）需要所选模型**支持 reasoning 输出**才会推送。另外前端 AI 请求超时已放宽，与后端 `ai.timeout-seconds`（默认 300s）保持一致。
:::
