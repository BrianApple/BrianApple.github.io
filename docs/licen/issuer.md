---
sidebar_position: 6
---

# 厂商签发中心（licen-issuer）

licen-issuer 是面向**客服/运营人员**的 Web 签发 + 管理工具：输入客户机器码 → 一键生成 license.json 下载回传；**已签发授权全部留痕**（台账），可查看/搜索/吊销/重新签发。生产环境部署在**厂商内网**，私钥不出内网。

## 快速启动

```bash
# 构建
go build -o licen-issuer ./cmd/licen-issuer

# 配置（config.yaml：端口、厂商私钥、签发 Token、台账路径）
#   server.port: 8099
#   issuer.private-key-file: ./keys/private.pem
#   issuer.admin-token: <务必修改>
#   issuer.db-path: ./data/licenses.json            # 已签发台账（默认 data/licenses.json）
#   issuer.products-path: ./data/products.json      # 产品库（默认 data/products.json，空库自动预置样例产品）
#   issuer.archive-path: ./data/archive             # 客户维度归档（证书+SDK 副本，默认 data/archive）
#   issuer.customer-products-path: ./data/customer-products.json  # 客户-产品对应关系（默认 data/customer-products.json）

# 启动
./licen-issuer -c config.yaml
```

Web 界面：`http://<厂商机>:8099/`

:::warning 生产安全

私钥由 `licen-tool gen-keypair` 生成且只放在厂商内网；公钥通过 `-ldflags -X main.publicKey=...` 内置进 licen-server 二进制（防公钥替换）。`issuer.admin-token` 务必修改默认值。

:::

## Web 界面五大功能

### ① 签发表单

输入机器码、选择产品/版本/节点数/有效期/功能点，一键生成 License 并下载：

![签发界面](/img/licen/01-issuer-webui.png)

填写客户信息时，**客户名下拉选择已有客户**会自动带出该客户最近签发参数（产品/版本/节点/功能点/机器码），仅需修改差异项：

![填写客户信息](/img/licen/02-issuer-form-filled.png)

签发结果页展示 License 全文（licenseId、产品、机器码、节点数、功能点、有效期、签名），支持直接下载回传客户：

![签发结果](/img/licen/03-issuer-result.png)

### ② 已签发授权台账

所有已签发授权集中留痕，状态一目了然：**有效 / 即将到期 / 已过期 / 已吊销**；可按客户/产品/ID 搜索；每行可执行**下载 / 时序 / 重新签发 / 吊销**。

- **到期提醒**：顶部提醒条 + 统计条（有效/即将到期/已过期/已吊销），台账每行显示剩余天数（绿/橙/红着色），**30 天内到期自动标「即将到期」**
- **授权时序**：点击「时序」查看该授权从最初签发至今的完整续签链（每次签发/续签/吊销留痕，含原因与关联 ID）

### ③ 产品库 & SDK 下载

管理可授权产品（**空库自动预置 HXAPIGate 智能网关 / IOTGate 物联网关样例**）；按 **语言 × 产品** 下载**定制版 SDK**——源码内嵌产品标识，注册/心跳自动携带，zip 附 `sdk-info.json`。

### ④ 客户-产品对应

维护「客户 × 产品」绑定（节点上限/版本/状态）；**签发时自动登记**；被绑定/有授权记录的**产品与客户禁止删除**，防止误删导致台账错乱。

### ⑤ 客户档案（按客户归档）

同一客户使用的产品 SDK 与证书按 `archive/{客户}/{产品}/` 归档：

- 签发证书落盘 `licenses/`
- 定制 SDK 落盘 `sdk/`

可随时下载回传交付，实现客户维度的一站式档案管理。

## 授权时序

每次授权操作都会写入时序链，从最初签发到最新状态完整留痕：

```
LIC-xxxx-001（最初签发，365 天）
   │  续费（+365 天）→ 旧 License 自动吊销，关联新 ID
   ▼
LIC-xxxx-002（重新签发，原因：客户续费）
   │  吊销（原因：客户违约/换机）
   ▼
LIC-xxxx-002（已吊销）
```

重新签发（reissue）以原参数续期，**旧 License 自动吊销并关联新 ID**；吊销（revoke）需记录原因并作废标记。所有操作均可通过 `GET /api/v1/licenses/{id}/timeline` 追溯。

## REST API 清单

所有接口均需请求头 `X-Issuer-Token` 鉴权。

### 签发与台账

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/v1/issue` | POST | 签发（JSON） |
| `/api/v1/issue-text` | POST | 签发（兼容表单） |
| `/api/v1/licenses` | GET | 已签发列表（含派生状态 + 剩余天数 + 状态统计） |
| `/api/v1/licenses/{id}/timeline` | GET | 授权时序（完整续签链） |
| `/api/v1/licenses/{id}/revoke` | POST | 吊销（记原因，作废标记） |
| `/api/v1/licenses/{id}/reissue` | POST | 重新签发（原参数续期，旧 License 自动吊销并关联新 ID） |
| `/api/v1/customers` | GET | 客户汇总（预填签发表单：最近签发参数/有效数/临期数） |

### 产品库 / SDK / 客户绑定 / 归档

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/v1/products` | GET / POST | 产品列表 / 新增产品 |
| `/api/v1/products/{id}` | PUT / DELETE | 修改 / 删除产品 |
| `/api/v1/sdk/{lang}/download?product=X&customer=Y` | GET | 下载定制版 SDK（zip 附 `sdk-info.json`） |
| `/api/v1/customer-products` | GET / POST | 客户-产品对应列表 / 新增绑定 |
| `/api/v1/customer-products/{customer}` | PUT / DELETE | 修改 / 删除客户绑定 |
| `/api/v1/customer-products/{customer}/products[/{product}]` | POST / PUT / DELETE | 绑定内产品维护 |
| `/api/v1/archive` | GET | 归档树 |
| `/api/v1/archive/{customer}/{product}/licenses/{file}` | GET | 下载归档证书 |
| `/api/v1/archive/{customer}/{product}/sdk/{file}` | GET | 下载归档 SDK |

## 台账持久化

`data/licenses.json` 保存全部已签发授权（**原子写盘**），重启不丢；吊销/重签全程留痕，授权一目了然。产品库、客户-产品对应、客户档案分别持久化到 `data/products.json`、`data/customer-products.json`、`data/archive/`。

## REST 签发示例

```bash
curl -X POST http://<厂商机>:8099/api/v1/issue \
  -H "Content-Type: application/json" -H "X-Issuer-Token: <token>" \
  -d '{"machineCode":"<客户机器码>","product":"iotgate","maxNodes":50,"days":365,"customer":"公司二","features":["server-core","api"]}'
```

响应包含生成的 License 全文（含 `sign` 字段），可直接落盘为 license.json 交付客户。

## 产品样例

空产品库首次启动时自动预置两个样例产品：

| 产品标识 | 名称 | 适用场景 |
|---|---|---|
| `hxapigate` | HXAPIGate 智能网关 | API 网关类产品接入示例 |
| `iotgate` | IOTGate 物联网关 | 边缘网关 / 嵌入式设备（配合 C SDK 纯 socket 模式） |

签发时选择产品即绑定 License 的 `product` 字段；客户侧多产品共存时，各产品独立签发、独立激活（见架构文档「多产品共存」）。
