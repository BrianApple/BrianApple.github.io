---
sidebar_position: 3
---

# API 资源授权

HXAPIGate 的核心能力是对 API 资源进行**细粒度授权**：授权维度不再是「路径」一级，而是「路径 + 请求方式」两级。本文介绍其基于 Shiro 的授权机制、资源配置方式与调用鉴权流程。

## 授权模型：API 资源 + 请求方式

HXAPIGate 通过组合 BootShiro（HXBootShiro 管理平台）实现了「api 资源 + 请求方式」的授权模式，这也是它与多数授权平台最本质的区别。

例如后端存在以下四个接口：

| 接口路径 | 请求方式 |
|--|--|
| `/user/list` | GET |
| `/user/list` | POST |
| `/user/list` | DELETE |
| `/user/list` | PUT |

传统授权模式下，这四个接口会因路径一致被当作**一个接口**授权给第三方；而 HXAPIGate 可以分别对每个资源进行授权。当仅仅授权 `/user/list` + `GET` 给第三方平台时，被授权方无法访问同一资源的 POST、DELETE、PUT 请求。

:::tip
对 API 资源的授权粒度越细，越能降低第三方应用越权访问的风险，这在开放平台、生态对接场景中尤为重要。
:::

## 基于 Shiro 的鉴权机制

网关的鉴权基于 Apache Shiro 实现，核心是自定义 Realm：`hx.apigate.authorization.shiro.JwtRealm`。

### Realm 配置

网关通过 `shiroPermission.ini` 注册自定义 Realm：

```ini
#自定义Realm的配置文件
[main]
#自定义realm的全类名
CustomRealm=hx.apigate.authorization.shiro.JwtRealm
#将CustomRealm设置到securityManager中   与spring中的注入类似
securityManager.realms=$CustomRealm
```

### JWT 认证流程

`JwtRealm` 继承自 `AuthorizingRealm`，只支持 `JwtToken` 类型的认证令牌。其认证（`doGetAuthenticationInfo`）流程如下：

1. **会话校验**：根据 `userId` 从 Redis 读取服务端缓存的 JWT（key 前缀见 `Constance.JWT_SESSION_PREFIX_KEY`），缓存不存在则抛出 `expiredJwt` 认证异常。
2. **验签与解析**：分别解析服务端缓存的 JWT 与客户端提交的 JWT（`JsonWebTokenUtil.parseJwt`，使用 `JsonWebTokenUtil.SECRET_KEY`）；签名错误、格式错误等抛出 `errJwt`，过期抛出「令牌过期，请重新登录！」。
3. **签发者校验**：JWT 的签发者（issuer）必须为 `UIOTCP_BOOTSHIRO_PRO`，否则视为无效令牌。
4. **单点登录校验**：比对服务端缓存 JWT 与客户端 JWT 的 `tokenId`，不一致则抛出「您的账户已在其它地方登录，您已被强制离线！」。
5. **应用 License 校验**：若 JWT 的 `appId` 以 `app_` 前缀开头（第三方应用 License），还需校验 Redis 中 `HXAPI:APP:INFO` 的应用状态：不存在或已删除抛出「应用不存在或已被删除，license 无效！」，状态非 `1` 抛出「应用已停用，license 已被吊销！」。

### 授权信息

认证通过后，`doGetAuthorizationInfo` 会从 `JwtAccount` 中解析出角色（roles）与权限（perms）集合，构造 `SimpleAuthorizationInfo` 返回：

```java
Set<String> roles = JsonWebTokenUtil.split(((JwtAccount) jwtData).getRoles());
Set<String> permissions = JsonWebTokenUtil.split(((JwtAccount) jwtData).getPerms());
SimpleAuthorizationInfo info = new SimpleAuthorizationInfo();
info.setRoles(roles);
info.setStringPermissions(permissions);
```

:::note
JWT 中携带的角色 / 权限集合由管理端在签发时写入，网关侧只负责解析与比对，不直接查询数据库——这也是网关能保持高性能、无状态扩展的原因。
:::

## 资源配置

API 资源的授权配置全部在管理平台（HXBootShiro，端口 18080）完成，主要包括以下环节：

### 1. 接口类型管理

接口类型管理 == 项目管理，是一类 API 接口的集合，支持**两级结构**（父类型 + 子类型）。先建立类型树，再在类型下挂接具体接口。

### 2. 接口管理

管理 API 接口，对 API 接口的基本信息进行管理，包括：

- 路由路径（`matchUrl`）与请求方式；
- 负载策略（轮询 / 加权等）；
- 协议类型（HTTP / Dubbo / MCP / WebSocket）；
- 是否需要鉴权（`needAuth`）、熔断参数（失败阈值 / 成功阈值 / 超时毫秒）等。

### 3. 角色管理

维护角色列表。角色是授权链路的桥梁：**资源授权给角色，用户挂到角色**，通过角色间接获得 API 访问权。

### 4. 授权管理

一级菜单「授权管理」下含两个二级功能：

- **角色资源授权**：选择角色 → 双栏穿梭框，将 API 接口（按 URI + 请求方式细粒度）授权给该角色；
- **用户角色关联**：选择角色 → 双栏穿梭框，将用户关联到该角色（角色即拥有该用户）。

### 5. 用户管理

管理平台登录用户（账号 / 姓名 / 手机 / 邮箱 / 性别 / 状态）。新增用户时可直接分配角色（与角色管理打通，决定其可访问的 API），支持重置密码与软删除（内置 admin 不可删）。

## 第三方应用接入（JWT License）

为第三方应用 / 服务签发访问网关 API 的 **JWT License**，是「应用管理」模块的核心功能：

- **新增应用**：自动生成 `app_id`（`app_` 前缀 + 随机串）与密钥，可绑定角色（决定可访问的 API 范围）。
- **生成 License**：有效期可选 `0 = 永久`（默认）或指定天数；生成后落库持久化并写入 Redis 会话缓存（`JWT-SESSION:appId`），列表页脱敏显示（仅头尾）+ 一键复制完整 License。
- **安全轮换**：生成永久 License 时平台会提示「建议每 90 天重新生成轮换一次」；重新生成后旧 License 因 `tokenId` 变更自动失效。
- **吊销机制**：停用 / 删除应用会立即删除 Redis 会话与应用缓存，存量 License 即刻失效。

License 与用户登录 JWT 同构：HS512 + 网关同一密钥签名，`roles` = 应用绑定的角色编码。

## 调用鉴权流程

第三方应用调用网关 API 的完整流程：

```text
应用客户端
   │  请求头：userId: APP_ID
   │          Authorization: <JWT License>
   ▼
HXAPIGate 网关（:18081）
   │  1. 路由匹配（按路径 + 请求方式）
   │  2. JwtRealm 认证：Redis 会话存在性 → 验签 → 签发者 → tokenId → 应用状态
   │  3. 授权比对：JWT 携带的角色 / 权限 vs 路由所需权限
   │  4. 通过后进入转发链：限流 → 熔断 → 负载均衡
   ▼
后端微服务（HTTP / Dubbo / MCP / WebSocket）
```

即应用调用网关 API 时携带请求头 `userId: APP_ID` + `Authorization: <License>`，即可通过网关 `JwtRealm` 鉴权。

:::warning
- 管理端与网关必须使用**同一个** `HXAPI_JWT_SECRET`，否则网关无法验证管理端签发的 License。
- 生产环境务必为 `HXAPI_JWT_SECRET` 设置强随机值，切勿使用默认兜底值。
:::
