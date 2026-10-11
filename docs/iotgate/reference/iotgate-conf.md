---
sidebar_position: 3
---

# iotGate.conf 参数详解

`iotGate.conf` 是网关的规约配置文件，**一条规则 = 一个规约**。网关启动时用 `-f` 参数指定其本地全路径（必选）。

它的本质是：**告诉 Netty 解码器如何在 TCP 字节流中切分出一帧**。所以这 9 个参数全部是"拆包/黏包（长度域解码）"的配置项。

## 文件格式

```properties
protocolType=1,0,-1,1,2,1,1,9811,60;2,1,-1,0,4,0,0,9812,300;3,1,-1,4,2,0,0,9813,130;
```

| 分隔符 | 含义 |
|---|---|
| `;` | 分隔**多条规约**（每个规约一个独立监听端口，互不干扰） |
| `,` | 分隔**一条规约内的 9 个参数**（顺序固定） |

:::tip
也可不经配置文件、直接由 IOTGateConsole 的「规约管理」页在线新增/启停规约，变更实时同步到网关，无需重启。见[部署指南](../deployment.md)。
:::

## 9 个参数

| 序号 | 参数名 | 类型 | 含义 |
|---|---|---|---|
| 1 | `pId` | 整数 | **规约编号**，取值 1–127。同时用于[网关头](./gate-header.md) `protocolType` 的低 7 位 |
| 2 | `isBigEndian` | `0`/`1` | **应用层报文大小端**：`1` = 大端，`0` = 小端。影响长度域的读取方式 |
| 3 | `beginHexVal` | 整数 | **起始符十六进制值**；`-1` 表示不校验起始符。大于 0 时用于定位帧头 |
| 4 | `lengthFieldOffset` | 整数 | **长度域偏移量**：长度域之前的字节数（即帧头长度） |
| 5 | `lengthFieldLength` | 整数 | **长度域字节数**：支持 `1` / `2` / `4`；高级规约填 `0` |
| 6 | `isDataLenthIncludeLenthFieldLenth` | `0`/`1` | **长度域的值是否包含长度域自身**：`1` = 包含，`0` = 不包含 |
| 7 | `exceptDataLenth` | 整数 | **额外数据长度**：长度域未能覆盖的尾部字节数（如报尾 `16`） |
| 8 | `port` | 整数 | **规约监听端口**：终端接入本规约的 TCP 端口 |
| 9 | `heartbeat` | 整数 | **心跳周期（秒）**：单机版按规约个性化配置；集群版默认 300s |

:::warning 参数顺序不可调换
配置文件按**下标取值**解析（`pt[0]` ~ `pt[8]`），顺序错位会导致解码参数整体错乱。
:::

## 参数与解码逻辑的对应关系

解码器 `gate/codec/Gate2ClientDecoderMulti.java` 中，帧长按如下方式计算：

```text
预校验长度 = lengthFieldOffset + lengthFieldLength + exceptDataLenth
实际一帧 = [lengthFieldOffset 字节 帧头]
         + [lengthFieldLength 字节 长度域]
         + [lenVal 字节 数据域]        ← lenVal 由长度域按 isBigEndian 读出
         + [exceptDataLenth 字节 额外]

若 isDataLenthIncludeLenthFieldLenth = 1：
    实际数据长度 = lenVal − lengthFieldLength
```

长度域的读取方式由 `isBigEndian` + `lengthFieldLength` 决定：

| `lengthFieldLength` | 读取方式 |
|---|---|
| `1` | 单字节（无字节序问题） |
| `2` | `isBigEndian=1` → `readShort()`；`0` → `readShortLE()` |
| `4` | `isBigEndian=1` → `readInt()`；`0` → `readIntLE()` |

:::note 与网关头字节序无关
这里的大小端是**终端应用层报文**的字节序；[网关头](./gate-header.md) 内部的多字节字段**恒为小端**，两者互不影响。
:::

## 逐字段解读示例

以实际配置的第一条（modbus TCP）为例：

```properties
1,0,-1,1,2,1,1,9811,60
```

| 参数 | 值 | 解读 |
|---|---|---|
| `pId` | `1` | 规约编号 1 |
| `isBigEndian` | `0` | 应用层报文**小端** |
| `beginHexVal` | `-1` | 不校验起始符 |
| `lengthFieldOffset` | `1` | 长度域前有 **1 字节**（即起始符 `68`） |
| `lengthFieldLength` | `2` | 长度域占 **2 字节**（小端 short） |
| `isDataLenthIncludeLenthFieldLenth` | `1` | 长度域的值**包含**自身 2 字节 |
| `exceptDataLenth` | `1` | 尾部额外 **1 字节**（报尾 `16`） |
| `port` | `9811` | 终端接入端口 9811 |
| `heartbeat` | `60` | 心跳周期 60 秒 |

对应帧结构：

```text
68 | len(2B,小端,含自身) | data | 16
 │        │                    └ exceptDataLenth = 1
 │        └ lengthFieldLength = 2
 └ lengthFieldOffset = 1
```

## 常见配置错误与后果

| 错误 | 后果 |
|---|---|
| `lengthFieldOffset` 偏大/偏小 | 长度域位置错位，读出的帧长完全错误 → 帧被错误切分 |
| `lengthFieldLength` 与实际不符 | 长度值解析错误（如把 2 字节当 4 字节读） → 拆包异常 |
| `isDataLenthIncludeLenthFieldLenth` 配反 | 每帧相差 `lengthFieldLength` 字节 → **黏包或截断** |
| `exceptDataLenth` 漏配报尾 | 报尾被并入下一帧 → 后续帧头错位，全链路紊乱 |
| `isBigEndian` 配反 | 长度值被按错误字节序解释 → 帧长出现巨大偏差 |
| 两条规约 `port` 重复 | 端口冲突，后启动的规约无法监听 |

:::warning
长度域相关参数一旦配错，网关将无法正确拆包，**终端与前置之间的数据链路会直接异常**。接入新规约前请先仔细阅读协议文档中的帧结构定义，或使用控制台的 AI 智能体辅助推导。
:::

## 与"高级规约"的关系

基础规约只能用固定的「偏移 + 字节数 + 是否含自身 + 额外长度」描述长度域。若协议的长度域**另有含义**（例如需要位运算提取、长度域重复出现、一帧含多个子报文），则需使用**高级规约**：

- `lengthFieldLength` 填 `0`，改为提交自定义长度域解析实现
- 由网关在运行时**动态编译**该实现并替换解码器

见[真实报文帧结构 → 接入新规约](./real-message-frame.md#接入新规约的思路)。

## 源码索引

| 内容 | 文件 |
|---|---|
| 9 参数解析与含义注释 | `gate/base/domain/ProtocolConfig.java` |
| 基础规约解码器 | `gate/codec/Gate2ClientDecoderMulti.java` |
| 高级规约解码器 | `gate/codec/other/DynamicGate2ClientDecoderMulti.java` |
| 解码器装配（按规约建 pipeline） | `gate/server/Server4Terminal.java` |
| 仓库默认配置 | `iotGate.conf` |
