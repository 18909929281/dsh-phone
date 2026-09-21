# dsh-phone

> 让**手机**通过局域网用 DSH Web GUI —— 用二维码代替手打那串 43 位的登录 token。

[English summary ↓](#english)

---

## ⚠️ 先读这个：它会把这个界面暴露到你的局域网

本插件的**前置条件**是把 `dsh web` 绑定到 `0.0.0.0`（详见[下面](#前置条件两步不能省)）。这意味着：

> **同一个网络里，任何设备都能访问这个"能执行命令"的界面。唯一的门槛是那串 token。**

`dsh web` 的命令行刻意禁止 `--host 0.0.0.0`，理由就是这一条。用之前请确认：

- ✅ 只在自己的**家庭网络**里用
- ❌ 不要在公共 Wi-Fi、宿舍、公司网络里开
- ❌ 如果你的局域网里有你不认识的设备，别开
- 🔁 不需要的时候，把 profile 补丁改回 `127.0.0.1` 就关了

这个提醒不是客套。**请认真对待。**

---

## 它解决什么问题

`dsh web` 启动时会打印一个登录网址：

```
http://192.168.1.100:3080/?token=<43 位随机串>
```

那串 token 是**每个进程随机生成**的，手打进手机基本不可能 —— 43 位，还是 base64url 大小写混排。

本插件的做法：在**电脑本机**开一个页面，把这串网址画成二维码。手机相机扫一下，就登录了。

**token 全程不出这台电脑。**

## 安装

```sh
# 从本地目录装
dsh plugin --profile web add link:/path/to/dsh-phone

# 卸载
dsh plugin --profile web remove dsh-phone
```

## 用法

1. 电脑浏览器打开 `http://127.0.0.1:3080/phone`
2. 手机连**同一个路由器**的 Wi-Fi
3. 手机相机扫屏幕上的二维码

登录一次之后会种下 **30 天**的 cookie，之后手机直接打开就能进，不用再扫。

## 路由

| 路由 | 谁能访问 | 作用 |
|---|---|---|
| `GET /phone` | **只有 loopback** | 显示二维码 + 登录网址 |

别的机器访问 `/phone` 一律 **403**。

## 为什么 `/phone` 只允许本机

这个页面的内容**等价于登录凭据**。如果它对局域网开放，那"要 token 才能进"这层保护就自己没了。

手机**不需要**访问它 —— 手机只用相机看电脑屏幕。所以这里做成了单向的：

```
电脑屏幕（有 token） ──相机──► 手机（拿到登录态）
        ▲
        └── 局域网里的其他人 fetch 不到这个页面
```

token 是**进程级**的，每次重启都会换，所以二维码每次请求现算，不写缓存、不落盘。

## 前置条件：两步，不能省

插件本身**不负责**让服务监听局域网 —— 那是部署配置，不是插件职责。

### 第一步：改 profile 补丁

`dsh web` 的宿主配置只接受 `127.0.0.1` 和 `0.0.0.0` 两个字面量。传局域网 IP 会被配置校验直接拒掉：

```
$.host expected "127.0.0.1" | "0.0.0.0" but got "192.168.1.100"
```

而命令行传 `--host 0.0.0.0` 又被 dsh 刻意拒绝。所以写在 profile 自己的 `~/.dsh/profiles/web/cordis.patch.yml` 里（这个文件默认是空的 `[]`）：

```yaml
- id: webserver
  config:
    host: '0.0.0.0'
    port: !!js ctx.webStartup.port ?? 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
```

> 补丁会**替换**目标行的整个 `config`，所以每个键都得重述一遍。

`patchReload: live` 的 profile 会**热重载**这个文件 —— 改完不用重启，服务器会自己重新绑定。

### 第二步：放行防火墙

Windows（需要管理员）：

```powershell
New-NetFirewallRule -DisplayName "DSH Web (LAN)" -Direction Inbound `
  -Protocol TCP -LocalPort 3080 -Action Allow -Profile Any
```

**`-Profile Any` 不能省。** 很多机器的网卡被 Windows 归成「公用网络」，只写 `-Profile Private` 的规则**不会生效**（这个坑我们踩过）。

Linux 用 `ufw` / `firewalld` 对应放行即可。

## 自检

```sh
node check-phone.mjs
```

用假的 `ctx` / `req` / `res` 跑一遍 `/phone` 处理器，验证：

- 路由注册
- loopback 判定（本机放行 / 远程 403）
- 二维码生成
- HTML 输出

**不需要启动服务器**，也不发任何真实请求。

## 实现说明

- **零运行时依赖以外的依赖**：只有 `qrcode` 一个。
- **`qrcode` 是延迟加载的**（`await import()`）。装不上也不会拖垮整个 profile 的启动 —— 页面会降级成"二维码没生成，这是网址"。
- 二维码**每次请求现算**，因为 token 每个进程都不一样。
- `/phone` 的请求**不做认证**，靠的是 loopback 限制 —— 因为如果它需要 cookie，本机第一次打开时反而进不去。

## 已知限制

- token 每个进程都换，所以**重启后电脑上要重新开一次 `/phone` 扫码**。已登录的手机不受影响（cookie 是持久的、绑 authority）。
- 只测过 Windows + Node 22/24。Linux / macOS 理论上一样（都是 node:os + HTTP），但没实测过。
- 只支持 IPv4。

## License

MIT

---

<a id="english"></a>
## English

**dsh-phone** lets you use the DSH Web GUI from your phone over the LAN.

`dsh web` prints a login URL carrying a random 43-character per-process token — impossible to type on a phone. This plugin serves a **loopback-only** page (`/phone`) that renders that URL as a QR code. Scan it with your phone camera and you're in. **The token never leaves the host machine.**

Loopback-only is deliberate: the page content is equivalent to a credential, so serving it to the LAN would defeat the token gate. The phone never fetches it — the camera reads the screen.

⚠️ **Security**: the prerequisite is binding `dsh web` to `0.0.0.0`, which exposes a command-capable interface to your whole network. Use it on a trusted home LAN only. The token is the only gate.

Requires one profile patch (`~/.dsh/profiles/web/cordis.patch.yml`) and a firewall rule — see the Chinese section above for exact contents.

MIT licensed.
