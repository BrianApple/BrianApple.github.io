---
sidebar_position: 2
---

# 快速开始

本文介绍 IOTGateConsole 从 **数据库初始化 → 构建 → 启动 → 接入网关** 的完整流程。

:::info 版本说明
本文按仓库 master（`v3.0.2-RELEASE`）整理，构建产物为 `IOTGateConsole-3.0.2-RELEASE.jar`。
Gitee 上已发布的 Release 为 **v3.0.1**（2026-08-12，AI 智能体版），v3.0.2 尚未打 tag。
:::

## 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| JDK | **JDK 21**（Temurin 21 LTS 及以上） | Spring Boot 3.5 工程，编译与运行均为 21 |
| Maven | 3.6+ | 用于 `mvn package` |
| MySQL | **8.0 及以上** | 建表脚本使用 `utf8mb4_0900_ai_ci` 排序规则，**5.7 及以下导入会报错** |
| 可选 | IOTGate 网关节点 | 用于节点监控与规约远程管理 |

## 2. 初始化数据库

导入建表脚本（脚本位于 `src/main/resources/`）：

```bash
mysql -uroot -p < src/main/resources/dump-iotgatedb-*.sql
```

脚本包含 4 张表的完整建表语句：

| 表 | 用途 |
|---|---|
| `gate_node` | 网关节点登记（IP、指令端口、备注） |
| `ai_config` | 大模型配置（多模型，Key 脱敏存储） |
| `strategy` | 规约（基础规约与高级规约） |
| `ai_chat_message` | 智能体对话记录 |

## 3. 配置数据库连接

连接信息通过**环境变量注入**（避免明文口令入库）：

```bash
export DB_URL="jdbc:mysql://127.0.0.1:3306/iotgatedb?useUnicode=true&characterEncoding=utf-8"
export DB_USERNAME=root
export DB_PASSWORD=你的口令
```

:::warning 务必覆盖默认值
源码内 `application.properties` 的默认值是开发环境示例（默认 URL 指向作者本机地址、默认口令为内置值）。**部署时请显式设置上面三个环境变量**；也可直接编辑 `application.properties` 中的 `spring.datasource.*`，但请勿把真实口令提交到仓库。
:::

## 4. 构建

`pom.xml` 已集成 `frontend-maven-plugin`：**`mvn package` 一次构建 = 前端 + 后端打进同一个 jar**。

```bash
mvn package
```

| 参数 | 说明 |
|---|---|
| `-DskipTests` | 跳过单元测试 |
| `-Dskip.frontend=true` | 跳过前端构建，仅编后端（**要求 `src/main/resources/static/` 已有前端产物**） |

产物为 `target/IOTGateConsole-3.0.2-RELEASE.jar`。

:::tip 国内网络构建前端会卡住？见「常见问题」
`frontend-maven-plugin` 会从 `nodejs.org` 下载 Node（v22.22.2），国内网络通常下载不动，
表现为**构建长时间无输出**（不是编译失败）。绕法：用本机 Node 先构建前端，再跳过插件打包后端。
:::

## 5. 启动并访问

```bash
java -jar target/IOTGateConsole-3.0.2-RELEASE.jar
```

启动后访问 [http://127.0.0.1:8686/static/index.html](http://127.0.0.1:8686/static/index.html)。首次访问会跳转登录页，**用户名密码随意填写**（没有存库）：

![新版登录页](/img/iotgate-console/login-v3.0.2.png)

## 6. 配置大模型（可选）

智能体需要一个大模型端点。两种方式，**任选其一**：

**方式一：环境变量 / 配置文件**（`application.properties`）

```properties
ai.base-url=https://api.deepseek.com/v1     # 任意 OpenAI 兼容端点，需以 /v1 结尾
ai.model=deepseek-chat
ai.temperature=0.1
ai.timeout-seconds=300
ai.api-key=${DEEPSEEK_API_KEY:}             # 建议走环境变量注入
```

**方式二：控制台界面动态配置**（**立即生效，无需重启**）

点开右下角悬浮智能体机器人 → ⚙️ 设置面板 → 新增/编辑模型（地址、模型名、Key、温度、超时），
支持同时保存多个模型并在对话面板下拉切换。配置持久化在 `ai_config` 表，**优先级高于配置文件**。

:::note
未配置 Key 时应用照常启动，智能体接口会返回引导提示，指向机器人设置面板。
:::

## 7. 登记网关节点

进入「**节点管理**」页 → 新增节点：填写网关 IP，端口填网关 `iotGate.conf` 的 `commandPort`（**默认 10917**）。
节点存入 `gate_node` 表，**无需在 `application.properties` 里配置节点列表**。

登记后控制台每 **10 秒**探针判活，并在列表中展示在线状态、在线时长与运行规约。

:::note
网关侧**无需任何 Console 配置**——不需要 `-c -r` 之类的注册参数（该类参数已从网关移除）。
:::

## 8. 可调配置

| 配置项 | 默认 | 说明 |
|---|---|---|
| `server.port` | `8686` | 控制台端口 |
| `gate.monitor.interval-seconds` | `10` | 探针周期（秒），同时决定差量补发节奏 |
| `gate.command-token` | 空（关闭） | 与网关 `iotGate.conf` 的 `commandToken` 对应；开启后下发指令自动带 `X-Gate-Token` 请求头 |
| `ai.timeout-seconds` | `300` | 单次大模型调用超时 |
| `spring.datasource.*` | 见上文 | 数据库连接 |

## 9. 前端二次开发

前端源码位于 `frontend/`（Vue3 + Vite），开发模式已代理 `/rpc`、`/gate` 到 8686：

```bash
cd frontend
npm install
npm run dev
```

生产构建产物输出到 `src/main/resources/static/`（`vite.config.js` 的 `outDir` 指定），`mvn package` 时自动打包进 jar。

## 10. 接口清单

### 节点管理

| 接口 | 说明 |
|---|---|
| `GET /gate/nodes` | 节点列表（含在线状态、运行规约） |
| `POST /gate/nodes` | 新增节点（网关 IP + 指令端口） |
| `DELETE /gate/nodes/{ip}` | 删除节点 |

### 规约管理

| 接口 | 说明 |
|---|---|
| `POST /rpc/addOneStrategy` | 新增基础规约（表单格式 `data[pid]=xx&data[straName]=xx...`） |
| `POST /rpc/addOneStrategyHighControll` | 新增**高级规约**（自定义长度域解析实现） |
| `POST /rpc/getAllStrategeFromDB` | 获取所有规约名称与编号 |
| `POST /rpc/getAllStrategyAllInfo` | 获取所有基础规约完整信息 |
| `POST /rpc/getAllStrategyAllInfoOnlyHigh` | 获取所有高级规约完整信息 |
| `POST /rpc/updateStrategyNode` | 更新网关节点启用的规约（差量下发启停） |
| `POST /rpc/delOneStrategyByPID` | 删除规约（`str=pid`） |

### AI 智能体

| 接口 | 说明 |
|---|---|
| `POST /rpc/ai/parse` | 解析帧结构描述（阻塞版） |
| `POST /rpc/ai/parse/stream` | **流式**解析（SSE：`thinking` / `phase` / `result` / `error`） |
| `GET /rpc/ai/models` | 模型列表 |
| `POST /rpc/ai/models` | 新增模型 |
| `POST /rpc/ai/models/update` | 修改模型 |
| `POST /rpc/ai/models/delete` | 删除模型 |
| `GET /rpc/ai/config` | 获取大模型配置（兼容旧接口，Key 脱敏返回） |
| `POST /rpc/ai/config` | 动态更新大模型配置（兼容旧接口，即时生效） |
| `GET /rpc/ai/chat/sessions` | 会话列表 |
| `GET /rpc/ai/chat/messages?sessionId=` | 某会话的对话记录 |

### 实时推送

| 接口 | 说明 |
|---|---|
| `GET /rpc/events` | SSE 事件流（节点状态 / 规约变更实时推送） |

## 11. 常见问题

### 导入 SQL 报错（排序规则不支持）

```text
ERROR 1273 (HY000): Unknown collation: 'utf8mb4_0900_ai_ci'
```

建表脚本使用 MySQL 8.0 的默认排序规则，**请升级到 MySQL 8.0+**；或把脚本中的
`utf8mb4_0900_ai_ci` 全部替换为 `utf8mb4_general_ci` 后再导入（5.7 环境）。

### `mvn package` 长时间卡住（其实是卡在下载 Node）

`frontend-maven-plugin` 需要从 `nodejs.org` 下载 Node 运行时，国内网络通常不通。
**症状**：`target/frontend-node/` 建出来了但只有十几 KB，进程 CPU 时间很短而墙钟时间很长。

**绕法**（利用本机已有的 Node，不改仓库文件）：

```bash
# ① 用系统 Node 构建前端，产物直出 src/main/resources/static/
cd frontend && npm install && npm run build && cd ..

# ② 跳过插件，只编后端并打包
mvn package -DskipTests -Dskip.frontend=true
```

### 启动报数据库连接失败 / 表不存在

- 确认 `DB_URL` 指向的库就是导入建表脚本的那个库
- 确认 MySQL 8.0+ 且账号有该库权限
- 环境变量未设置时会走源码内置默认值（示例地址），**务必显式设置**

### 节点一直显示离线

- 确认网关已启动且 10917 可被控制台访问：`curl http://<网关IP>:10917/gate/status`
- 确认节点登记的端口 = 网关 `commandPort`（默认 10917）
- 若网关配了 `commandToken`，控制台需同步配置 `gate.command-token`
