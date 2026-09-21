/**
 * dsh-phone —— 手机接入 DSH Web GUI（宿主侧插件）
 *
 * 解决的问题
 * ----------
 * `dsh web` 打印的登录网址里带着一串 43 位的进程 token，要在手机上把它敲进去
 * 基本不可能。本插件在**本机**开一个页面，把这串网址画成二维码，
 * 手机相机扫一下就能登录 —— token 全程不出这台电脑。
 *
 * 路由
 * ----
 *   GET /phone   —— 只在 loopback 上可用。别的机器访问一律 403。
 *
 * 为什么只允许 loopback
 * --------------------
 * 这个页面的内容等价于登录凭据。如果它对局域网开放，那"要 token 才能进"这层
 * 保护就自己没了。手机不访问这个页面（它会拿到 403），它只用相机看屏幕。
 *
 * token 是进程级的，每次重启都会换，所以二维码每次请求现算，不缓存。
 */

import { networkInterfaces } from 'node:os'

const name = 'dsh-phone'
const inject = ['webServer', 'connection']

const PAGE_ROUTE = '/phone'
const MAX_ADDRESSES = 8

/** qrcode 延迟加载：拿不到也不能拖垮整个 profile 的启动。 */
let qrModule
async function loadQr() {
  if (qrModule === undefined) {
    const mod = await import('qrcode')
    qrModule = mod.default ?? mod
  }
  return qrModule
}

/** 非 internal 的 IPv4 地址（和 dsh-web-app 里 resolveLanTrust 同一套取法）。 */
function lanAddresses() {
  const out = []
  const tables = Object.values(networkInterfaces())
  for (const list of tables) {
    for (const iface of list || []) {
      if (iface && iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out.slice(0, MAX_ADDRESSES)
}

/** 优先挑典型家用局域网地址；169.254.x 这种自分配地址没人能连上，排最后。 */
function preferredLan() {
  const all = lanAddresses().filter((a) => !/^169\.254\./.test(a))
  const priv =
    all.find((a) => /^192\.168\./.test(a)) ||
    all.find((a) => /^10\./.test(a)) ||
    all.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a))
  return priv || all[0]
}

/** 请求是不是从本机发起的。 */
function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function send(res, status, body, type) {
  const buf = Buffer.from(body, 'utf8')
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': buf.length,
  })
  res.end(buf)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function pageHtml(url, qrDataUrl, ip, port) {
  const safeUrl = escapeHtml(url)
  const qrBlock = qrDataUrl === undefined
    ? '<p class="warn">二维码生成失败了（qrcode 包没装上？）。<br>下面是网址，先照着手打吧。</p>'
    : '<img class="qr" src="' + qrDataUrl + '" alt="登录二维码">'
  return [
    '<!doctype html>',
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>手机扫码进入</title>',
    '<style>',
    ':root{color-scheme:dark}',
    'body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;',
    'justify-content:center;gap:18px;padding:32px 20px;',
    'background:#12141a;color:#e6e8ee;',
    'font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}',
    'h1{font-size:20px;font-weight:600;margin:0}',
    '.qr{width:min(70vw,340px);height:auto;background:#fff;padding:10px;border-radius:10px}',
    '.warn{max-width:520px;text-align:center;line-height:1.7;color:#ffd479}',
    '.url{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all;',
    'max-width:min(90vw,560px);text-align:center;color:#9aa3b2;',
    'background:#1b1e26;border:1px solid #2a2f3a;border-radius:8px;padding:10px 12px}',
    '.hint{max-width:min(90vw,520px);text-align:center;line-height:1.8;font-size:13px;color:#8b93a3}',
    'b{color:#e6e8ee;font-weight:600}',
    '</style></head><body>',
    '<h1>用手机相机扫这个码</h1>',
    qrBlock,
    '<div class="url">' + safeUrl + '</div>',
    '<p class="hint">手机连的 Wi-Fi 要和这台电脑<b>同一个路由器</b>。<br>',
    '扫完会跳转到 DSH 界面；这个页面本身手机打不开（故意的，那串密钥不能出这台电脑）。<br>',
    '当前对内地址：<b>' + escapeHtml(ip) + ':' + escapeHtml(String(port)) + '</b></p>',
    '</body></html>',
  ].join('\n')
}

function apply(ctx) {
  const disposers = []

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: PAGE_ROUTE,
    handler: (req, res) => {
      Promise.resolve().then(async () => {
        if (!isLoopback(req)) {
          send(res, 403, '这个页面只在服务器本机可以打开。手机请用相机扫电脑屏幕上的二维码。')
          return
        }
        const connection = ctx.get('connection')
        const port = ctx.webServer.port
        const ip = preferredLan()
        if (connection === undefined || ip === undefined) {
          send(res, 500, '拿不到 connection 服务或局域网地址：无法生成登录网址。')
          return
        }
        const url = connection.authenticatedUrl('http://' + ip + ':' + String(port) + '/')
        let qrDataUrl
        try {
          const QRCode = await loadQr()
          qrDataUrl = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 640,
          })
        } catch (error) {
          ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        }
        send(res, 200, pageHtml(url, qrDataUrl, ip, port), 'text/html; charset=utf-8')
      }).catch((error) => {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        try {
          if (res.headersSent) { res.destroy(); return }
          send(res, 500, '生成失败：' + String(error && error.message ? error.message : error))
        } catch (ignored) { /* 响应已不可写 */ }
      })
    },
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (ignored) { /* 释放失败不影响其它路由 */ }
    }
  })
}

export { name, inject, apply }
