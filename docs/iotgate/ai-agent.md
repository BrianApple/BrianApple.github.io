---
sidebar_position: 6
---

# AI 智能体（v2.2）

IOTGate v2.2 正式升级为 **AI 智能体版本**，内置 LangChain4j AI 智能体，与 IOTGateConsole 智能体控制台配套。控制台内置 🤖 悬浮智能体机器人（右下角，主流客服交互设计），集**对话解析**与**大模型配置管理**于一体。

## 对话解析

粘贴通信协议的**帧结构描述**（协议文档中的字段定义：帧头、各字段字节数、**长度域位置与定义**、字节序、校验帧尾等），AI 自动提取长度域信息，推导出网关拆包/黏包解码参数，并支持**一键填充**到新增规约表单：

![AI 智能体对话解析](/img/iotgate/bot-chat-v2.2.png)

### 推导的解码参数

智能体根据帧结构描述推导出的网关拆包/黏包解码参数包括：

| 参数 | 说明 |
|---|---|
| 大小端 | 长度域与数据的字节序（大端/小端） |
| 起始符 | 帧头标识（如 modbus TCP 的起始字符） |
| 长度域偏移 | 长度域在帧中的起始位置 |
| 长度域长度 | 长度域占用的字节数 |
| 长度含长度域标志 | 长度值是否包含长度域自身字节数 |
| 额外长度 | 长度域之外的附加字节数 |
| 端口 | 该规约的监听端口 |

### 使用流程

1. 在 IOTGateConsole 页面右下角呼出悬浮机器人
2. 将协议文档中的帧结构描述粘贴到对话框
3. AI 返回解析结果：大小端、起始符、长度域偏移、长度域长度、长度含长度域标志、额外长度、端口等
4. 点击**一键填充**，参数自动填入新增规约表单
5. 保存后规约变更实时同步到网关

## 大模型配置

**厂商无关**设计，支持任意 OpenAI 兼容接口（DeepSeek / 通义千问 / 智谱GLM / Ollama / OpenAI 等）。点击机器人右上角 ⚙️ 可视化修改模型地址、模型名称、API Key、采样温度、超时时间，**保存立即生效，无需重启**，配置持久化本地（重启后保留）：

![大模型配置面板](/img/iotgate/bot-settings-v2.2.png)

### 默认配置

默认配置位于 `application.properties`，运行时可在前端 ⚙️ 设置中覆盖：

```properties
ai.api-key=${DEEPSEEK_API_KEY:}    # 建议环境变量注入，勿硬编码提交
ai.base-url=https://api.deepseek.com/v1
ai.model=deepseek-chat
ai.temperature=0.1
ai.timeout-seconds=60
```

### 常见模型切换示例

| 模型 | base-url | model |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` |
| Ollama 本地 | `http://localhost:11434/v1` | 本地模型名（无需 Key） |

## 技术栈

- **LangChain4j 1.18**：AiServices 声明式结构化输出，Java 8 老项目平滑升级至 **JDK 21 + Spring Boot 3.5**
- 前端为 Vue3 + Vite 单页应用，悬浮机器人图标使用 SVG 矢量图（修复无 emoji 字体环境下显示为 × 的问题）

## AI 配置 API

| 接口 | 说明 |
|---|---|
| `POST /rpc/ai/parse` | 解析帧结构描述，返回拆包/黏包解码参数 |
| `GET /rpc/ai/config` | 获取大模型配置（API Key 脱敏返回） |
| `POST /rpc/ai/config` | 动态更新大模型配置（即时生效） |

## 使用前提与注意事项

- **配套版本**：AI 智能体能力由 IOTGateConsole v2.2 智能体控制台提供，请使用 v2.2 及以上版本的控制台与 v2.2 网关配套部署
- **模型可用性**：请确保大模型已正确配置（模型地址、模型名称、API Key），否则 AI 解析功能不可用；Ollama 本地模型无需 Key
- **配置持久化**：大模型配置保存后持久化本地，重启后保留；运行时前端 ⚙️ 设置中的修改会覆盖 `application.properties` 默认值
- **Key 安全**：API Key 建议通过环境变量 `DEEPSEEK_API_KEY` 注入，避免明文口令入库，勿硬编码提交

## v3.x 展望

IOTGate v3.x 开发中：IOTGate 智能物联网通信网关将支持**大模型 MCP 协议**，实现基于大模型交互对话以创建 IOTGate 通信协议代理，AI Agent 持续升级。

:::tip
- API Key 建议通过环境变量 `DEEPSEEK_API_KEY` 注入，避免明文口令入库
- 配置修改保存后立即生效，无需重启控制台服务
- v3.x 规划支持大模型 MCP 协议，实现基于大模型交互对话以创建 IOTGate 通信协议代理
:::
