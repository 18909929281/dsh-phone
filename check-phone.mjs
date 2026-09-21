/**
 * dsh-phone 自检 / 冒烟测试
 * =========================
 *
 * 用假的 ctx / req / res 跑一遍 /phone 处理器 —— 不启动服务器，也不发任何真实请求。
 *
 *   node check-phone.mjs
 *
 * 全部通过退出码 0，有失败退出码 1（可以直接挂 CI）。
 */

import { apply, name, inject } from './lib/index.js'

let failed = 0
let passed = 0

function check(label, ok, extra = '') {
  if (ok) {
    passed += 1
    console.log(`  ✔ ${label}`)
  } else {
    failed += 1
    console.log(`  ✘ ${label}${extra ? '  → ' + extra : ''}`)
  }
}

// ── 假的宿主环境 ────────────────────────────────────────────────
const routes = []
const warnings = []

const ctx = {
  webServer: {
    port: 3080,
    register(route) {
      routes.push(route)
      return () => {
        const i = routes.indexOf(route)
        if (i !== -1) routes.splice(i, 1)
      }
    },
  },
  get(key) {
    if (key === 'connection') {
      return { authenticatedUrl: (base) => base + '?token=TESTTOKEN123' }
    }
    return undefined
  },
  logger: { warn: (e) => warnings.push(String(e)) },
  effect(fn) {
    fn()
  },
}

// ── 假的 req / res ──────────────────────────────────────────────
function fakeRes() {
  return {
    status: 0,
    headers: {},
    chunks: [],
    headersSent: false,
    destroyed: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers || {}
      this.headersSent = true
    },
    end(body) {
      if (body !== undefined) this.chunks.push(Buffer.from(body))
    },
    destroy() {
      this.destroyed = true
    },
  }
}

/** 调一次处理器，等它把响应头写出来（而不是死等固定毫秒数）。 */
async function call(remoteAddress, timeoutMs = 5000) {
  const route = routes.find((r) => r.path === '/phone')
  const res = fakeRes()
  route.handler({ socket: { remoteAddress } }, res)
  const deadline = Date.now() + timeoutMs
  while (!res.headersSent && !res.destroyed && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10))
  }
  // 再给它一点时间把 body 写完
  await new Promise((r) => setTimeout(r, 50))
  return res
}

const text = (res) => Buffer.concat(res.chunks).toString('utf8')

// ── 跑 ──────────────────────────────────────────────────────────
console.log('注册')
apply(ctx)
check('插件名是 dsh-phone', name === 'dsh-phone', `实际 ${JSON.stringify(name)}`)
check('注入了 webServer 和 connection',
  inject.includes('webServer') && inject.includes('connection'),
  JSON.stringify(inject))
check('只注册了一条 exact 路由', routes.length === 1 && routes[0].kind === 'exact',
  routes.map((r) => `${r.kind} ${r.path}`).join(', '))
check('路由路径是 /phone', routes[0]?.path === '/phone', String(routes[0]?.path))

if (failed > 0) {
  console.log('\n路由没注册对，后面的测试没法跑。')
  process.exit(1)
}

console.log('\nloopback（本机）应当放行')
for (const addr of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
  const res = await call(addr)
  const body = text(res)
  check(`${addr} → 200`, res.status === 200, `实际 ${res.status}`)
  check(`${addr} → Content-Type 是 html`,
    String(res.headers['Content-Type']).includes('text/html'))
  check(`${addr} → 页面里带二维码`, body.includes('data:image/png;base64,'))
  check(`${addr} → 页面里带着登录网址`, body.includes('token=TESTTOKEN123'))
  check(`${addr} → 有 no-store（不许缓存凭据）`,
    res.headers['Cache-Control'] === 'no-store')
}

console.log('\n局域网（非本机）应当拒绝')
for (const addr of ['192.168.1.50', '10.0.0.7', '203.0.113.9']) {
  const res = await call(addr)
  check(`${addr} → 403`, res.status === 403, `实际 ${res.status}`)
  check(`${addr} → 响应里没有 token`, !text(res).includes('TESTTOKEN'))
}

console.log('\n二维码确实生成了（qrcode 装上了）')
check('没有 qrcode 相关的告警', warnings.length === 0, warnings.join(' | '))

// ── 汇总 ────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
console.log('='.repeat(50))
process.exit(failed === 0 ? 0 : 1)
