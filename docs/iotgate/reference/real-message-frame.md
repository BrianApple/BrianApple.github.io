---
sidebar_position: 2
---

# 真实报文帧结构

**真实报文**指感知终端与网关通信时传输的应用层报文（下文简称"报文"）。它与[网关头](./gate-header.md)是两回事：

- **真实报文**：终端 ↔ 网关之间，由各规约（应用层协议）定义
- **网关头**：网关 ↔ 前置之间，由 IOTGate 自行定义，封装在真实报文之前

```text
感知终端 ──(真实报文)──> IOTGate 网关 ──(网关头 + 真实报文)──> 前置(master)
```

规约不同则真实报文结构差异明显。**网关并不认识具体业务语义，它只负责按"长度域解码"规则把 TCP 字节流正确切成完整帧**，因此配置的核心就是描述清楚一帧的帧结构。

## 配置文件默认支持的两种帧结构

`iotGate.conf` 默认支持两种真实报文结构（对应规约编号 `1` 与 `2`）：

### 规约编号 1

| 偏移 | 报文属性 | 字节数 | 含义 |
|---|---|---|---|
| `0` | `68` | 1 | 报头（起始符） |
| `1` | `len` | 2 | 长度域：*"传输帧中除起始字符 68 和结束字符 16 之外的帧字节总数，**包含长度域本身字节数**"* |
| `3` | `data` | n | 报文内容 |
| `n+3` | `16` | 1 | 报尾（结束符） |

```text
68 | len(2B) | data(nB) | 16
```

### 规约编号 2

| 偏移 | 报文属性 | 字节数 | 含义 |
|---|---|---|---|
| `0` | `len` | 4 | 长度域值为 `data` 的字节数，**不包含自身字节数** |
| `4` | `data` | n | 报文内容 |

```text
len(4B) | data(nB)
```

:::warning 长度域语义必须严格区分
规约 1 的长度"**包含**长度域本身"，规约 2 的长度"**不包含**自身" —— 这一项对应配置里的 `isDataLenthIncludeLenthFieldLenth` 参数。配错会导致网关按错误的帧长切分，出现**拆包/黏包异常**，甚至整条数据链路不可用。
:::

## 帧长计算规则

网关解码器（`gate/codec/Gate2ClientDecoderMulti.java`）按以下公式切分数据帧：

```text
一帧总长 = lengthFieldOffset          // 帧头（长度域之前的字节数）
         + lengthFieldLength          // 长度域自身字节数
         + lenVal                     // 长度域读出的值
         + exceptDataLenth            // 额外长度（如报尾）

其中：若 isDataLenthIncludeLenthFieldLenth = true
      则 实际数据长度 = lenVal - lengthFieldLength
```

解码器先校验 `readableBytes() >= lengthFieldOffset + lengthFieldLength + exceptDataLenth`，再读取长度域求值，据此判断整帧是否到齐——**这就是 TCP 拆包/黏包的处理位置**。

### 两种默认结构的参数对照

| 参数 | 规约编号 1 | 规约编号 2 |
|---|---|---|
| `beginHexVal`（起始符） | `-1`（不校验起始符） | `-1` |
| `lengthFieldOffset` | `1`（跳过 `68`） | `0`（长度域在最前） |
| `lengthFieldLength` | `2` | `4` |
| `isDataLenthIncludeLenthFieldLenth` | `1`（含自身） | `0`（不含） |
| `exceptDataLenth` | `1`（报尾 `16`） | `0` |

## 内置规约示例

仓库自带 `iotGate.conf` 的 `protocolType` 配置为：

```properties
protocolType=1,0,-1,1,2,1,1,9811,60;2,1,-1,0,4,0,0,9812,300;3,1,-1,4,2,0,0,9813,130;
```

即三条规约（`;` 分隔），每行 9 个参数（`,` 分隔），详见 [iotGate.conf 参数详解](./iotgate-conf.md)：

| 规约编号 | 说明 | 终端接入端口 | 心跳周期 |
|---|---|---|---|
| `1` | modbus TCP | 9811 | 60s |
| `2` | IEC 104 | 9812 | 300s |
| `3` | DLT 645 | 9813 | 130s |

各规约的报文结构示意：

### modbus TCP

![modbus TCP 报文结构](/img/iotgate/modbusTCP.png)

配置行（`iotGate.conf` 实际内容）：

```properties
1,0,-1,1,2,1,1,9811,60
```

### IEC 104

```text
len(4B,大端) | data(nB)
```

配置行：

```properties
2,1,-1,0,4,0,0,9812,300
```

### DLT 645

配置行：

```properties
3,1,-1,4,2,0,0,9813,130
```

:::note 关于示例值
上文"两种默认帧结构"表格中的 `isDataLenthIncludeLenthFieldLenth` / `exceptDataLenth` 说明的是**语义**；实际生效值请以仓库 `iotGate.conf` 为准（即上表三行）。若你自行调整了帧结构定义，对应参数需同步修改。
:::


## 接入新规约的思路

1. **读协议文档的帧结构定义** —— 找出：报头/起始符、长度域位置与字节数、长度域是否含自身、是否有报尾
2. **换算成 9 个配置参数** —— 填入 `iotGate.conf` 或经 IOTGateConsole 远程新增
3. **可选：AI 智能体辅助** —— 直接把帧结构描述粘给控制台的悬浮机器人，由大模型推导参数并一键填充，见 [AI 智能体](../ai-agent.md)

:::tip
若内置的固定长度域规则无法覆盖私有协议（例如长度域含义特殊、需先做位运算，或一帧内含多个子报文），可使用 **高级规约**：提交自定义长度域解析实现，由网关在运行时动态编译执行。
:::
