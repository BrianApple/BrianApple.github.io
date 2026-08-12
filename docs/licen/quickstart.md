---
sidebar_position: 2
---

# 快速开始

本教程带你走一遍本地全链路：构建 → 生成密钥对 → 签发第一张 License → 部署授权服务 → SDK 校验。

## 环境要求

| 项目 | 要求 |
|---|---|
| Go | ≥ 1.26（构建与运行 licen-server / licen-tool / licen-issuer） |
| 操作系统 | Linux（机器码采集基于 Linux sysfs；Windows 支持 WMI） |
| 运行依赖 | 无（licen-server 为单二进制 + SQLite，零外部依赖） |
| garble | 仅加固构建需要（`scripts/build-release.sh` 缺失时自动安装） |

:::note 部署侧要求

客户 VM 只需要上传 `licen-server` 二进制、`config.yaml`、`keys/public.pem` 三个文件即可运行，**不需要 Go 环境**。

:::

## 构建

在仓库根目录执行：

```bash
# 1. 构建授权服务（客户侧）
go build -o licen-server ./cmd/licen-server

# 2. 构建厂商 CLI 工具
go build -o licen-tool ./cmd/licen-tool

# 3. 构建厂商 Web 签发服务（可选，按需）
go build -o licen-issuer ./cmd/licen-issuer
```

生产发布建议使用加固构建脚本 `scripts/build-release.sh`，产物为静态链接 + 去符号 + garble 混淆：

```bash
./scripts/build-release.sh                # 当前平台（linux/amd64）
./scripts/build-release.sh linux amd64    # 交叉构建指定平台
SKIP_GARBLE=1 ./scripts/build-release.sh  # 仅静态+去符号，跳过混淆（构建更快）
```

## 生成密钥对

```bash
./licen-tool gen-keypair -d ./keys
```

执行后 `./keys` 下生成 RSA-2048 密钥对：

- `private.pem`：**厂商自留，绝不外传**
- `public.pem`：内置到 licen-server（部署到客户 VM 用）

:::warning 密钥安全

生产环境务必：私钥只放在厂商内网；公钥通过 `-ldflags -X main.publicKey=...` 内置进 licen-server 二进制，防止公钥被替换。

:::

## 查看机器码

在**客户 VM** 上执行（本机演示可直接在构建机上执行）：

```bash
./licen-tool machinecode
```

输出为 SHA-256 十六进制机器码。它由硬件指纹锚点（系统UUID→磁盘→MAC→主板→CPU 优先级取非空源）计算而来，加盘/换网卡/调 vCPU/VM 迁移都不会变码。把这个机器码报给厂商用于签发。

## 签发第一张 License

厂商拿到客户机器码后，用 `licen-tool gen-license` 签发：

```bash
./licen-tool gen-license -k keys/private.pem \
    -m <机器码> -p hxapigate -n 10 -f ai-inference,nlp -d 365 -c "公司一" -o license.json
```

| 参数 | 含义 |
|---|---|
| `-k` | 厂商私钥路径（keys/private.pem） |
| `-m` | 客户机器码（`licen-tool machinecode` 的输出） |
| `-p` | 产品标识（如 hxapigate / iotgate） |
| `-e` | 版本/套餐（默认 enterprise） |
| `-n` | 最大并发节点数（默认 1） |
| `-f` | 功能点列表（逗号分隔，如 ai-inference,nlp） |
| `-d` | 有效天数（与 `--expires` 二选一） |
| `--expires` | 到期时间 ISO-8601（如 `2027-08-11T00:00:00`，与 `-d` 二选一） |
| `-c` | 客户名称 |
| `-o` | 输出 License 文件路径（默认 license.json） |

生成的 `license.json` 是 JSON + RSA 签名格式，绑定机器码，可先自行验证：

```bash
./licen-tool verify -k keys/public.pem -l license.json
```

## 启动授权服务

把 `licen-server`、`config.yaml`、`keys/public.pem`、`license.json` 放到客户 VM（本机演示放同一目录），启动：

```bash
./licen-server -c config.yaml
```

日志出现 `License 加载 result=VALID` 即授权生效。

:::note 先部署后激活

生产环境 license.json 可以**后补**：客户先部署 server（此时不需要 license.json），用 `/api/v1/machine-code` 拿到机器码发给厂商，厂商签发后客户**上传激活**即解锁全部功能。详见下文。

:::

## 验证

```bash
# 健康检查
curl http://<host>:8090/api/v1/health

# 授权状态
curl http://<host>:8090/api/v1/license/status
```

`/api/v1/license/status` 返回 `valid: true`、`result: VALID`、产品、客户、节点数、功能点、有效期等授权信息。

## 先部署后激活（生产模式）

核心思想：客户先部署 licen-server（此时**不需要** license.json），只能使用基础功能（健康检查/机器码采集/状态查询/激活）。客户把机器码发给厂商，厂商签发 License 后，客户**上传激活**即解锁全部功能（注册/心跳/管理 API）。

```bash
# 1. 客户 VM 部署 server（无 license）
# 2. 获取机器码
curl http://<host>:8090/api/v1/machine-code

# 3. 厂商签发（二选一）
#    A. CLI:  licen-tool gen-license -k 私钥 -m <机器码> -p iotgate ...
#    B. 签发服务: licen-issuer Web 界面 / REST API

# 4. 客户上传激活
curl -X POST http://<host>:8090/api/v1/activate -d @license.json -H "Content-Type: application/json"
```

返回 `"success": true` 即全部功能启用。未激活时，注册/心跳/管理接口一律返回 HTTP 403 `LICENSE_NOT_ACTIVATED`。

:::warning 安全保证

activate 接口不需要管理 Token，但只有**厂商私钥签名 + 绑定本机机器码**的 License 才能激活成功；伪造机器码 → `MACHINE_MISMATCH`，篡改内容 → `INVALID_SIGNATURE`，且激活失败不影响当前已激活状态。

:::

## 使用 SDK 校验

授权生效后，客户产品通过官方 SDK 接入校验。以 Python 为例：

```python
from licen_sdk import LicenClient

client = LicenClient(
    server_url="http://127.0.0.1:8090",
    app_key="hxapigate",
    app_secret="xxx",
)
client.start()
print(client.is_valid())               # True
print(client.has_feature("ai-inference"))  # True
client.stop()
```

Java / Go / C 的完整接入方式见[多语言 SDK 接入](./sdk.md)。
