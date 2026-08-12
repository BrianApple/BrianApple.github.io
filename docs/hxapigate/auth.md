---
sidebar_position: 3
---

# 授权与认证

本文档介绍 HXAPIGate 的授权认证体系：整体时序、JwtRealm 鉴权流程、角色/授权/用户管理，以及面向第三方应用的 JWT License 签发与管理。

## 授权认证整体时序

![授权认证时序图](/img/hxapigate/img.png)

上图展示了 HXAPIGate 授权认证的整体时序：管理平台（HXBootShiro）负责 API 路由与鉴权规则的统一管理，网关（HXAPIGate）在请求入口执行 JWT 校验、会话校验与资源授权。

## JwtRealm 认证流程

网关基于 **Shiro JwtRealm** 完成认证与鉴权，用户登录 JWT 与第三方应用 License 同构（HS512 + 网关同一密钥签名），统一走以下链路：

1. **验签**：使用 `HXAPI_JWT_SECRET`（管理端与网关共用）校验 JWT 签名与有效期
2. **会话校验**：校验 Redis 会话缓存（`JWT-SESSION:appId`）存在且 `tokenId` 匹配
3. **应用状态校验**：读取 `HXAPI:APP:INFO`，应用已删/已停用一律拒绝
4. **资源授权**：按「API 资源 + 请求方式」细粒度匹配，仅授权过的 URI + 方法组合可放行

:::note
JWT 签名密钥已外置为环境变量 `HXAPI_JWT_SECRET` 注入，管理端与网关必须保持一致，生产环境务必设置强随机值。
:::

## 角色管理

角色是授权体系的桥梁：API 接口通过角色授权给用户，第三方应用通过绑定角色决定可访问的 API 范围。初始化脚本内置 4 个角色，角色管理页面负责维护角色信息。

![角色管理](/img/hxapigate/role.png)

## 授权管理（双栏穿梭框）

一级菜单「授权管理」下含两个二级功能，以角色为桥梁分别对 **API 接口** 与 **用户** 进行授权：

- **角色资源授权**：选择角色 → 双栏穿梭框，将 API 接口（按 **URI + 请求方式** 细粒度）授权给该角色
- **用户角色关联**：选择角色 → 双栏穿梭框，将用户关联到该角色（角色即拥有该用户）

![接口授权](/img/hxapigate/auth.png)

## 用户管理

管理平台登录用户（账号/姓名/手机/邮箱/性别/状态），新增用户时可直接分配角色（与角色管理打通，决定其可访问的 API），支持重置密码与软删除（内置 admin 不可删）：

- **新增用户**：账号 + 初始密码 + 基本参数 + 角色多选
- **编辑用户**：基本参数 + 状态（正常/锁定）+ 覆盖式角色分配
- **重置密码**：为新用户/忘记密码用户重新设置密码

## 接口类型管理

接口类型管理（==项目管理）是一类 API 接口的集合，支持**两级结构（父类型 + 子类型）**：

![类型管理](/img/hxapigate/type.png)

## 接口管理

管理 API 接口，对 API 接口的基本信息（路由、负载策略、协议类型等）进行管理：

![接口管理](/img/hxapigate/api.png)

新增接口功能截图（可配置请求路径、请求方式、协议类型、负载策略、熔断参数与后端节点等）：

![新增接口](/img/hxapigate/addApi.png)

:::tip
协议类型支持 `HTTP`、`Dubbo`、`MCP`、`WebSocket`，其中 MCP 与 WebSocket 的配置方式详见[高级特性专题](./features)。
:::

## 应用管理（生成 API 访问 JWT License）

为第三方应用/服务签发访问网关 API 的 **JWT License**（与用户登录 JWT 同构：HS512 + 网关同一密钥签名，`roles` = 应用绑定的角色编码）。应用调用网关 API 时携带请求头 `userId: APP_ID` + `Authorization: <License>` 即可通过网关 JwtRealm 鉴权。

- **新增应用**：自动生成 `app_id`（`app_` 前缀 + 随机串）与密钥，可绑定角色（决定可访问的 API 范围）
- **生成 License**：有效期可选 **0 = 永久（默认）** 或指定天数；生成后**落库持久化**并写入 Redis 会话缓存（`JWT-SESSION:appId`），列表页**脱敏显示**（仅头尾）+ 一键复制完整 License
- **安全提醒**：永久 License 生成时提示「建议每 90 天重新生成轮换一次」（重新生成后旧 License 因 `tokenId` 变更自动失效）
- **网关全链路校验**：验签 → Redis 会话存在 + `tokenId` 匹配 → **应用状态校验**（`HXAPI:APP:INFO`：应用已删/已停用一律拒绝）
- **吊销机制**：停用/删除应用立即删除 Redis 会话与应用缓存，存量 License 即刻失效

```bash
# 第三方应用调用网关 API 示例
curl http://localhost:18081/user/list \
  -H "userId: app_xxxxxxxx" \
  -H "Authorization: eyJhbGciOiJIUzUxMiJ9..."
```

:::warning
JWT License 是第三方应用访问网关 API 的凭证，请通过 HTTPS 传输并定期轮换（建议每 90 天重新生成一次）。
:::
