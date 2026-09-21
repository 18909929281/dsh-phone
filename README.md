# dsh-phone

> 让**手机**通过局域网用 DSH Web GUI —— 用二维码代替手打那串 43 位的登录 token。

[English summary ↓](#english)

---

>这句主包自己写的：好用！用了十几天了awa
> 本项目**由 AI 编写** —— **「小菜的 AI」**（跑在 DeepSeek Harness 上的 `deepseek-flash` 模型）。
>
> 需求、判断、验收都来自 **小菜的ds**；代码、文档、测试是 AI 写出来的。
> 写这一条不为别的 —— 就是不想让人以为这是人手敲的。

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

## 一键加入

**把下面这一整行复制进终端，回车。** 就这一步。

```sh
git clone https://github.com/xiaocaiawa/dsh-phone.git && node dsh-phone/install.mjs --install
```

它按顺序做三件事：

| 步骤 | 干什么 |
|---|---|
| `git clone` | 把仓库下载到当前目录下的 `dsh-phone/` |
| `install.mjs --install` | **① 改好 profile 补丁**（那个 `host: 0.0.0.0`，原文件先备份成 `.bak`）<br>**② 把插件注册进 profile**（用绝对路径，不靠你拼）|

跑完它会**把防火墙命令打出来** —— 那一步需要管理员权限，得你自己执行。

然后重启 `dsh web`，打开 `http://127.0.0.1:3080/phone` 扫码就行。

> **不想让它自动注册插件？** 去掉 `--install` 就只改配置：
> `node dsh-phone/install.mjs`
>
> **想先看看它要干什么？** 加 `--dry-run`，只打印不执行。

## AI 一键安装

**把下面那一段整个复制，发给你自己的 AI。** 它会把上面那行命令替你跑完。

```text
帮我装一个 DSH 插件：dsh-phone
仓库：https://github.com/xiaocaiawa/dsh-phone

它的作用：在本机开一个只有本机能访问的 /phone 页面，把 dsh web 的登录网址
（带进程 token 的那串）画成二维码，手机扫码就能从局域网登录。

请按这个顺序做，每步做完把结果告诉我：

1. 看 ~/.dsh/plugins/dsh-phone 在不在。
   在 → git pull；不在 → git clone 上面那个仓库到那个位置。
2. 进到那个目录，跑：node install.mjs --install
   它会改 ~/.dsh/profiles/web/cordis.patch.yml（原文件备份成 .bak），
   并把插件注册进 profile。
3. 把它打印出来的防火墙命令，原文贴给我。
4. 跑：node check-phone.mjs —— 把结果贴给我（应该是 26 项全过）。
5. 告诉我下一步是不是需要重启 dsh web。

注意：这个插件的前提是把 dsh web 绑到 0.0.0.0，那等于把这个能执行命令的
界面暴露到整个局域网，token 是唯一的门槛。
动第 2 步之前，先问我一句：我是不是在可信的家庭网络里。
```

### 为什么要写得这么细

**AI 不是猜谜机。** 路径、命令、预期结果、以及「哪一步必须先问我」，都写清楚，
它一次就能装对。含糊的指令它只能自己发挥 —— 然后你可能得到一堆意料之外的东西。

这也是这个仓库的一个态度：**给 AI 看的说明，和给人看的说明，都该写明白。**

### 手动安装（不用脚本）

```sh
git clone https://github.com/xiaocaiawa/dsh-phone.git
dsh plugin --profile web add link:$PWD/dsh-phone
node dsh-phone/install.mjs      # 或者照下面「前置条件」自己改 YAML
```

### 卸载

```sh
dsh plugin --profile web remove dsh-phone
```

然后把 `~/.dsh/profiles/web/cordis.patch.yml` 里 `dsh-phone` 写入的那一段删掉
（或者把 `host` 改回 `127.0.0.1`），就彻底关掉了。

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

## Install (one line)

```sh
git clone https://github.com/xiaocaiawa/dsh-phone.git && node dsh-phone/install.mjs --install
```

That clones the repo, patches the profile for you (backing the original up as `.bak`), and
registers the plugin. It then prints the firewall command — that one needs admin, so you run it
yourself.

## AI one-click install

There is a copy-paste prompt block in the Chinese section above ("AI 一键安装"). Hand it to your
own DSH and it will run the install for you.

It is written to be unambiguous on purpose — exact paths, exact commands, expected results, and an
explicit **"ask me before step 2"** gate, because step 2 is what widens the exposure to your LAN.
Vague instructions make an agent improvise; precise ones make it do the right thing once.

Requires one profile patch (`~/.dsh/profiles/web/cordis.patch.yml`) and a firewall rule.
The installer does the patch; see the Chinese section above for what it writes and why.

MIT licensed.
