#!/usr/bin/env node
/**
 * dsh-phone 一键安装
 * ==================
 *
 * 干一件事：把 profile 的补丁文件改好（那个 host: 0.0.0.0）。
 * 这一步是纯手改 YAML，最容易劝退人 —— 所以做成脚本。
 *
 *   node install.mjs
 *
 * 不会碰防火强（那需要管理员权限，得你自己执行，脚本会把命令打出来）。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', 'web')
const PATCH_FILE = join(PROFILE_DIR, 'cordis.patch.yml')

const PATCH_BLOCK = `
# ── 由 dsh-phone 的 install.mjs 写入 ──────────────────────────────
# 让 dsh web 监听所有网卡，手机才能从局域网连进来。
# 这等于把这个"能执行命令的界面"暴露到网络上，token 是唯一的门槛 ——
# 只在自己的家庭网络里用。想关掉就把这一段删掉（或者把 host 改回 127.0.0.1）。
- id: webserver
  config:
    host: '0.0.0.0'
    port: !!js ctx.webStartup.port ?? 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
`

const say = (s = '') => console.log(s)
const ok = (s) => console.log(`  ✔ ${s}`)
const warn = (s) => console.log(`  ! ${s}`)
const bad = (s) => console.log(`  ✘ ${s}`)

say('='.repeat(58))
say('dsh-phone 一键安装')
say('='.repeat(58))

// ── 1. profile 在不在 ─────────────────────────────────────────
if (!existsSync(PROFILE_DIR)) {
  bad(`找不到 profile 目录：${PROFILE_DIR}`)
  say()
  say('说明你还没用过 web 这个 profile。先跑一次：')
  say()
  say('    dsh web')
  say()
  say('让它把 profile 目录建出来（起来了就按 Ctrl+C 停掉），再回来跑本脚本。')
  process.exit(1)
}
ok(`profile 目录：${PROFILE_DIR}`)

// ── 2. 补丁文件在不在 ─────────────────────────────────────────
if (!existsSync(PATCH_FILE)) {
  warn('补丁文件不存在，帮你建一个空的')
  writeFileSync(PATCH_FILE, '# 你的 profile 补丁层\n[]\n', 'utf8')
}
const original = readFileSync(PATCH_FILE, 'utf8')
ok(`补丁文件：${PATCH_FILE}`)

// ── 3. 是不是已经配过了 ───────────────────────────────────────
if (/^\s*-\s*id:\s*webserver\s*$/m.test(original)) {
  ok('已经配过 webserver 了，不用重复写')
} else {
  // 备份
  const backup = `${PATCH_FILE}.bak`
  copyFileSync(PATCH_FILE, backup)
  ok(`已备份原文件 → ${backup}`)

  // 把空数组 [] 那行去掉（保留注释），再把我们的块接上去
  const kept = original
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '[]')
    .join('\n')
    .replace(/\s*$/, '')

  writeFileSync(PATCH_FILE, `${kept}\n${PATCH_BLOCK}`, 'utf8')
  ok('已写入 webserver 的 host: 0.0.0.0')
}

// ── 4. 防火墙命令（需要管理员，脚本不代跑）────────────────────
say()
say('─'.repeat(58))
say('还差一步：放行防火墙（需要管理员权限，脚本不代跑）')
say('─'.repeat(58))
say()

const p = platform()
if (p === 'win32') {
  say('开一个「管理员」PowerShell，粘这一条：')
  say()
  say('  New-NetFirewallRule -DisplayName "DSH Web (LAN)" -Direction Inbound `')
  say('    -Protocol TCP -LocalPort 3080 -Action Allow -Profile Any')
  say()
  say('⚠️ -Profile Any 不能省。很多机器的网卡被 Windows 归成「公用网络」，')
  say('   只写 -Profile Private 的规则不会生效。')
} else if (p === 'darwin') {
  say('macOS 的防火墙是按应用放行的：系统设置 → 网络 → 防火墙 → 选项，')
  say('把 node 放进「允许传入连接」的列表里。')
} else {
  say('Linux（二选一）：')
  say()
  say('  sudo ufw allow 3080/tcp')
  say('  sudo firewall-cmd --add-port=3080/tcp --permanent && sudo firewall-cmd --reload')
}

// ── 5. 下一步 ─────────────────────────────────────────────────
say()
say('─'.repeat(58))
say('下一步')
say('─'.repeat(58))
say()
say('  1. 装插件（如果还没装）：')
say()
say(`       dsh plugin --profile web add link:${dirname(process.argv[1] ?? '.')}`)
say()
say('  2. 重启 dsh web，让它重新绑定到 0.0.0.0')
say()
say('  3. 电脑浏览器打开  http://127.0.0.1:3080/phone')
say()
say('  4. 手机连同一个路由器的 Wi-Fi，相机扫屏幕上的二维码')
say()
say('⚠️  提醒：这一步之后，同一网络里的任何设备都能访问这个界面。')
say('    只在家里用。不用了就编辑 cordis.patch.yml 把 host 改回 127.0.0.1。')
say()
say('='.repeat(58))
say('搞定')
say('='.repeat(58))
