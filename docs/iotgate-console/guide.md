---
sidebar_position: 3
---

# 使用指南

本文档介绍 IOTGateConsole 的日常操作：登录、节点状态监控、网关规约启停与规约策略配置，以及 AI 智能体的使用。

## 登录

访问 `http://127.0.0.1:8686/static/index.html`，首次访问会跳转到登录页。**用户名密码随意填写**（没有存库），登录后进入控制台主界面。

## 集群状态监控（节点管理）

节点管理页实时展示当前 GATE CLUSTER 中所有网关节点，区分两种来源：

- **动态注册**：网关 `-c -r` 主动注册，展示最近心跳、在线时长
- **静态配置**：`application.properties` 中 `gate.nodes` 兜底配置

### 在线状态判定逻辑

节点列表中的"在线/离线"状态由 **NodeMonitorService 定时 TCP 探测**得出（每 10s 一次，探测节点 **10916 RPC 端口**，2s 超时），**动态注册节点与静态配置节点完全一致，无差别对待**：

- 连接成功 → 在线；连接失败/超时 → 离线
- 状态变化时通过 SSE `node-status` 事件实时推送前端更新
- **静态配置节点**虽无心跳上报（"最近心跳/在线时长"列显示 `-`），但其在线状态同样是真实探测结果：静态配置本机 `127.0.0.1` 且网关运行中 → 显示在线；静态配置不存在的 IP → 一直显示离线
- **动态注册节点**在线状态由注册表心跳（30s 超时移除）与 TCP 探测双重保障

:::tip
若静态配置的节点长期显示离线，请检查 `gate.nodes` 中的 IP 是否与网关实际地址一致，以及网关 10916 端口是否可达。
:::

## 网关启停与规约管理

控制台通过 RPC（网关 **10916** 端口）调用网关的规约解析服务启停，以及多规约策略配置。前端界面提供规约管理页，支持在线**开启/关闭/新增/删除**多规约解析服务，变更实时同步到网关。

### 相关接口一览

| 接口 | 说明 |
|------|------|
| `POST /rpc/gateData` | 获取所有网关节点信息（含运行规约） |
| `POST /rpc/addOneStrategy` | 新增规约（表单格式 `data[pid]=xx&data[straName]=xx...`） |
| `POST /rpc/getAllStrategeFromDB` | 获取所有规约名称与编号 |
| `POST /rpc/getAllStrategyAllInfo` | 获取所有规约完整信息 |
| `POST /rpc/updateStrategyNode` | 更新网关节点启用的规约 |
| `POST /rpc/delOneStrategyByPID` | 删除规约（`str=pid`） |

### 新增规约

在规约管理页点击新增，填写规约参数（大小端、起始符、长度域偏移、长度域长度、长度含长度域标志、额外长度、端口等），提交后调用 `POST /rpc/addOneStrategy`，规约实时同步到网关。

```bash
# 接口调用示例（表单格式）
curl -X POST http://127.0.0.1:8686/rpc/addOneStrategy \
  -d "data[pid]=4&data[straName]=new_protocol&data[port]=9816"
```

### 删除规约

在规约管理页选择要删除的规约，确认后调用 `POST /rpc/delOneStrategyByPID`（`str=pid`）：

```bash
curl -X POST http://127.0.0.1:8686/rpc/delOneStrategyByPID -d "str=4"
```

:::warning
删除规约会影响使用该规约的网关节点解析能力，请确认没有终端仍在使用该规约后再操作。
:::

### 网关节点注册接口（动态发现）

网关主动注册链路由以下接口支撑（网关侧 `-c -r` 模式自动调用，一般无需手工操作）：

| 接口 | 说明 |
|------|------|
| `POST /gate/register` | 网关主动注册（注册成功即同步规约） |
| `POST /gate/heartbeat` | 网关心跳上报（默认每 10s 一次；节点不存在时返回 `retSig=404` 触发网关重新注册） |
| `POST /gate/unregister` | 网关反注册（正常关闭时调用） |
| `GET /gate/nodes` | 查看当前注册表中的节点 |

## AI 智能体使用（v2.2）

控制台右下角有 **悬浮智能体机器人**，集对话解析与大模型配置管理于一体。

### 对话解析

将通信协议的**帧结构描述**（协议文档中的字段定义：帧头、各字段字节数、**长度域位置与定义**、字节序、校验帧尾等）粘贴给机器人，AI 自动提取长度域信息，推导出网关拆包/黏包解码参数（大小端 / 起始符 / 长度域偏移 / 长度域长度 / 长度含长度域标志 / 额外长度 / 端口），并支持**一键填充**到新增规约表单。

后端接口：`POST /rpc/ai/parse`

### 大模型配置

点击机器人右上角 ⚙️ 可视化修改模型地址、模型名称、API Key、采样温度、超时时间，**保存立即生效，无需重启**，配置持久化本地（重启后保留）。

后端接口：

- `GET /rpc/ai/config`：获取大模型配置（API Key 脱敏返回）
- `POST /rpc/ai/config`：动态更新大模型配置（即时生效）

### 默认配置

`application.properties` 中的默认配置（运行时可在前端 ⚙️ 设置中覆盖）：

```properties
ai.api-key=${DEEPSEEK_API_KEY:}
ai.base-url=https://api.deepseek.com/v1
ai.model=deepseek-chat
ai.temperature=0.1
ai.timeout-seconds=60
```

:::tip
`ai.api-key` 建议通过环境变量 `DEEPSEEK_API_KEY` 注入，勿硬编码提交；本地模型（Ollama）可留空。
:::

### 常见模型切换示例

| 厂商 | base-url | 模型 | 备注 |
|------|----------|------|------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 默认 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | |
| Ollama 本地 | `http://localhost:11434/v1` | 本地模型名（如 `qwen2.5`） | 无需 Key |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` | |

## SSE 实时推送

前端通过 SSE（`GET /rpc/events`）实时接收网关节点上下线状态、规约变更事件，替代原 ZK 事件监听机制。无需额外配置，打开控制台页面即自动建立连接。

## 使用建议

- 网关节点以 `-c -r` 动态注册为主、`gate.nodes` 静态配置兜底，兼顾自动化与稳定性
- 新增规约后及时在节点管理页确认同步状态；修改规约参数后观察网关日志验证拆包是否正常
- 大模型 API Key 通过环境变量注入，避免明文入库或提交到代码仓库
