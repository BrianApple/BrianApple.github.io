---
sidebar_position: 7
---

# 高级规约操作说明

**高级规约**用于处理**长度域无法按常规方式直接读出**的私有协议。基础规约只能描述「偏移 + 字节数 + 是否含长度域自身 + 额外长度」这套固定规则；当协议的长度域另有玄机时，就需要高级规约：由你提交一段**长度域解析实现**，网关在运行时**动态编译**并替换解码器。

## 什么时候必须用高级规约

只要符合以下**任一**情况，就不能用基础规约：

| 判据 | 说明 | 例子 |
|---|---|---|
| **① 长度域低位另有含义** | 长度域的低若干位是协议标识/标志位，真实长度必须**移位或掩码**才能得到 | 376.1：长度 L 的 D0–D1 是协议标识，D2–D15 才是真实长度 → 需 `>> 2` |
| **② 真实长度需多字段拼装** | 长度由多个字节或多个字段**相加/拼接**得到 | 长度被拆到两处、需要相加 |
| **③ 长度域需按位提取** | 长度不是按常规字节整数读出，而要**逐位**取出 | 长度藏在某个字节的高 4 位 |

:::note 这些情况**仍然用基础规约**，不要误用高级规约
- 长度值**包含/不包含**长度域自身 → 用 `长度含长度域` 参数表达
- 帧头有起始符、帧尾有固定校验/结束符 → 用 `报首` / `长度外偏移` 表达
- 长度域占 1/2/4 字节、直接读出就是长度 → 常规 `lengthFieldLength`

没有明确的位运算/拼接依据时，**一律用基础规约**。
:::

## 与基础规约的对比

| 维度 | 基础规约 | 高级规约 |
|---|---|---|
| 适用 | 长度域可常规读出的绝大多数协议 | 长度域含位运算/拼接/按位提取 |
| 配置方式 | 表单填 9 个解码参数 | 表单参数 + **自定义解析实现** |
| 长度域参数 | `lengthFieldLength` = 1/2/4 | `lengthFieldLength` = **0** |
| 网关侧 | 固定解码器 | 运行时**动态编译**你的实现 |
| 维护 | 可新增/启停/删除 | 同左（**同样不支持编辑**，改错只能删了重建） |

## 操作步骤

### 1. 进入高级规约维护

左侧菜单「**高级规约维护**」（路径 `#/strategies/advanced`），列表展示已配置的高级规约，字段包括：规约编号、规约名称、大小端、报首、长度域偏移、长度含长度域、长度外偏移、端口、心跳、解析规则摘要。

![高级规约维护列表](/img/iotgate/advanced-protocol-list-v3.0.2.png)

### 2. 新建高级规约

点「新建高级规约」进入编辑页：

![新建高级规约](/img/iotgate/advanced-protocol-add-v3.0.2.png)

**表单字段说明**：

| 字段 | 对应参数 | 说明 |
|---|---|---|
| 规约编号 | `pId` | 1–127，同时用于网关头 `protocolType` 低 7 位 |
| 规约名称 | `pName` | 建议写明协议名称，便于识别 |
| 大小端 | `isBigEndian` | 1 = 大端，0 = 小端 |
| 报首 | `beginHexVal` | 起始符十六进制；无起始符填 `-1` |
| 长度域偏移 | `lengthFieldOffset` | 长度域起点之前的所有字节数（**取哪一个长度域就按那个算**） |
| 长度含长度域 | `isDataLenthIncludeLenthFieldLenth` | 长度值是否包含长度域自身 |
| 长度外偏移 | `exceptDataLenth` | 长度值未覆盖、但属于整帧的固定字节数（如帧尾、包内重复帧头） |
| 端口 | `port` | 该规约的终端接入端口 |
| 心跳(秒) | `heartbeat` | 心跳周期 |

### 3. 编写长度域解析逻辑

代码编辑器采用「**固定前缀 + 可编辑方法体 + 固定后缀**」结构，你只需写中间的方法体：

```java
// ─── 固定前缀（不可编辑）─────────────────────
public class CustomParser implements LengthParser {
    public int[] parseLength(ByteBuf byteBuf) {
        int[] datas = new int[2];

// ─── 可编辑的方法体（你要写的部分）────────────
        int lenAreaLength = 2; // 长度域占用的字节数（须声明并赋值）
        int lenVal = byteBuf.getUnsignedShort(byteBuf.readerIndex()); // 长度域的值（须声明并赋值）

        // ===== 在此编写解析逻辑 =====

// ─── 固定后缀（不可编辑）─────────────────────
        datas[0] = lenAreaLength;
        datas[1] = lenVal;
        return datas;
    }
}
```

:::warning 两个必须声明并赋值的变量
- `lenAreaLength` —— **长度域占用的字节数**
- `lenVal` —— **长度域的值**

两者缺一不可（它们会被固定后缀写回 `datas[]`）。
:::

**可用的读取方法**（编辑器内置补全）：

| 片段 | 作用 |
|---|---|
| `len1` | `lenAreaLength = 1; lenVal = byteBuf.readUnsignedByte();` |
| `len2` | `lenAreaLength = 2; lenVal = byteBuf.readUnsignedShort();` |
| `len4` | `lenAreaLength = 4; lenVal = byteBuf.readInt();` |
| 小端变体 | `readUnsignedShortLE()` / `readIntLE()` / `readShortLE()` |

:::warning 编写约束
- **只准使用 `byteBuf` 的只读方法**（`get*` / `read*`），禁止任何写操作（`clear` / `setReaderIndex` / `discardReadBytes` 等）
- **禁止引入任何外部类型或 import**（运行时环境只注入 `ByteBuf`）
- 方法体必须能编译通过——编译失败会以指令失败返回
:::

### 4. 保存并下发

保存后，控制台会通过指令通道（网关 **10917**）下发 `ADD_PROTOCOL_HIGH`，网关**动态编译**该实现并启停对应规约的终端接入服务；随后立即探针刷新，界面无需等待。

:::note 高级规约不支持编辑
网关侧只有 `ADD_PROTOCOL` / `DELETE_PROTOCOL`，**没有 update**。若参数或解析逻辑写错，只能**删除后重建**——新增前请仔细核对。
:::

## 完整示例：Q/GDW 376.1 长度域

376.1 的帧格式（FT1.2）：`68H + 长度L(2B) + 68H + 控制域C + 地址域A + 链路用户数据 + 校验CS + 结束16H`，其中**长度 L 重复出现两次**，且 **L 的低 2 位（D0–D1）是协议标识**，D2–D15 才是真实长度：

```java
int lenAreaLength = 2;
int lenVal = 0;
lenVal = byteBuf.readShortLE() >> 2;   // 右移 2 位，去掉 D0~D1 的协议标识
```

对应参数：

| 参数 | 值 | 理由 |
|---|---|---|
| `lengthFieldOffset` | `3` | 长度域取**第二个** L，其前有 `起始68H(1) + 第一个L(2)` = 3 字节 |
| `lengthFieldLength` | `0` | 高级规约固定填 0 |
| `isBigEndian` | `0` | 低位是协议标识，按小端读取后移位 |
| `beginHexVal` | `68` | 起始符 68H |
| `exceptDataLenth` | `3` | 长度值未覆盖：包内重复的 `68H(1) + CS(1) + 16H(1)` |
| `isDataLenthIncludeLenthFieldLenth` | `0` | L1 不含长度域自身 |

## 网关侧是如何生效的

1. 控制台经 `POST /gate/command` 下发 `ADD_PROTOCOL_HIGH`（携带参数 + 解析实现）
2. 网关用 **javassist 运行时动态编译**生成解析类，替换该规约的解码器
3. 新增/启停/删除与基础规约一致，终端接入端口按 `port` 独立监听

:::warning 两条重要运行约束
1. **指令必须串行**：javassist 的 `ClassPool` 是共享单例，并发的动态编译会互相污染，因此网关侧指令走单线程执行器——批量下发时会有排队，属正常现象。
2. **安全边界**：`/gate/command` 能触发**任意 Java 代码的动态编译**（等价于远程执行 Java 代码），**10917 端口只应暴露在内网**；如需跨网访问，请启用 `commandToken` 鉴权并配合网络隔离。
:::

## 相关文档

- 参数语义与常见配错后果：[iotGate.conf 参数详解](./reference/iotgate-conf.md)
- 帧结构与帧长计算：[真实报文帧结构](./reference/real-message-frame.md)
- 用 AI 自动判断并生成高级规约：[AI 智能体](./ai-agent.md)
