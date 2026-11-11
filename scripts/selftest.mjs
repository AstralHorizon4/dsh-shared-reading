/**
 * Dev self-test for the Host half — runs without DSH.
 *
 *   node scripts/selftest.mjs
 *
 * Builds a tiny EPUB, a TXT, a Markdown and an HTML file in a temp directory,
 * imports each through the real parser, then drives the HTTP handler with mock
 * request/response objects (including one streamed /ask).
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

import { parseBook } from '../host/formats.js'
import { Library } from '../host/library.js'
import { Store } from '../host/store.js'
import { registerRoutes } from '../host/routes.js'
import { registerTools } from '../host/tools.js'

/* ------------------------------------------------------------------ zip --- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function makeZip(files) {
  const local = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.data, 'utf8')
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(packed.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    local.push(header, name, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += header.length + name.length + packed.length
  }
  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, centralBuffer, end])
}

function epubFixture() {
  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      data: '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    {
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0"?><package><metadata><dc:title>海边的卡夫卡</dc:title><dc:creator>村上春树</dc:creator></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    },
    {
      name: 'OEBPS/cover.svg',
      data: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"><rect width="60" height="90" fill="#334"/></svg>',
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: `<html><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">第一章 十五岁生日</a></li><li><a href="ch2.xhtml">第二章 图书馆</a></li></ol></nav></body></html>`,
    },
    {
      name: 'OEBPS/ch1.xhtml',
      data: `<html><body><h1>第一章</h1><p>十五岁生日那天，我离开了家。</p><p>天空很蓝，<em>口袋里只有一张地图</em>。</p></body></html>`,
    },
    {
      name: 'OEBPS/ch2.xhtml',
      data: `<html><body><h1>第二章</h1><p>图书馆在山的另一边。</p><p>大岛说：&ldquo;你可以住在这里。&rdquo;</p></body></html>`,
    },
  ])
}

/* ---------------------------------------------------------- fake context --- */

function mockContext() {
  return {
    logger: { info() {}, warn() {} },
    webServer: { register: () => () => {} },
  }
}

function makeRequest(method, url, body, headers = {}) {
  const stream = Readable.from(body ? [Buffer.from(body)] : [])
  stream.method = method
  stream.url = url
  stream.headers = headers
  return stream
}

function makeResponse() {
  const state = { status: 0, headers: {}, body: '', ended: false }
  return {
    state,
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value
    },
    flushHeaders() {},
    write(chunk) {
      state.body += chunk
    },
    end(chunk) {
      if (chunk) state.body += chunk
      state.ended = true
    },
    set statusCode(value) {
      state.status = value
    },
    get statusCode() {
      return state.status
    },
  }
}

/* ------------------------------------------------------------------ run --- */

const root = await mkdtemp(join(tmpdir(), 'shared-reading-test-'))
try {
  // 1. Formats -----------------------------------------------------------------
  const epub = parseBook(epubFixture(), 'kafka.epub')
  assert.equal(epub.title, '海边的卡夫卡')
  assert.equal(epub.author, '村上春树')
  assert.equal(epub.sections.length, 2)
  assert.match(epub.sections[0].title, /第一章/)
  assert.match(epub.sections[0].text, /十五岁生日/)
  assert.match(epub.sections[1].text, /大岛说：“你可以住在这里。”/)
  assert.equal(epub.cover?.mediaType, 'image/svg+xml')
  assert.ok(epub.cover.bytes.length > 0)

  const txt = parseBook(
    Buffer.from('书名\n\n第一章 开始\n\n第一段。\n第二段。\n\n第二章 继续\n\n第三段。', 'utf8'),
    'book.txt',
  )
  assert.equal(txt.sections.length, 2)
  assert.match(txt.sections[0].title, /第一章/)
  assert.match(txt.sections[1].text, /第三段/)

  const markdown = parseBook(Buffer.from('# 甲\n\n一。\n\n## 乙\n\n二。', 'utf8'), 'notes.md')
  assert.equal(markdown.sections.length, 2)
  assert.equal(markdown.sections[1].title, '乙')

  const html = parseBook(
    Buffer.from('<html><body><h1>上</h1><p>第一段。</p><h1>下</h1><p>第二段。</p></body></html>', 'utf8'),
    'page.html',
  )
  assert.equal(html.sections.length, 2)
  assert.match(html.sections[1].text, /第二段/)

  // One <span> per glyph must not become one space per glyph.
  const spans = parseBook(
    Buffer.from(
      '<html><body><p><span>根</span><span>据</span><span>F</span><span>I</span><span>R</span><span>E</span><span>的</span><span>公</span><span>式</span></p></body></html>',
      'utf8',
    ),
    'spans.html',
  )
  assert.equal(spans.sections[0].text, '根据FIRE的公式')
  const twoParagraphs = parseBook(Buffer.from('<html><body><p>一</p><p>二</p></body></html>', 'utf8'), 'p.html')
  assert.equal(twoParagraphs.sections[0].text, '一\n二')

  assert.throws(() => parseBook(Buffer.from('%PDF-1.7'), 'a.pdf'), /PDF/)

  // 2. Library ----------------------------------------------------------------
  const store = new Store({ root })
  await store.ensure()
  const library = new Library(store)
  const first = await library.importBytes(epubFixture(), 'kafka.epub')
  const meta = first.meta
  assert.equal(meta.cover?.file, 'cover.svg')
  assert.ok((await library.cover(meta.id)).bytes.length > 0)
  assert.equal(first.duplicate, false)
  assert.equal(meta.chapterCount, 2)
  assert.ok(meta.fingerprint)
  // The same bytes under another name open the copy already on the shelf.
  const again = await library.importBytes(epubFixture(), 'kafka-copy.epub')
  assert.equal(again.duplicate, true)
  assert.equal(again.meta.id, meta.id)
  assert.equal((await library.list()).length, 1)

  // A book imported before fingerprints existed is matched by shape and upgraded.
  const legacy = { ...meta }
  delete legacy.fingerprint
  await store.writeJson(library.metaPath(meta.id), legacy)
  const upgraded = await library.importBytes(epubFixture(), 'kafka.epub')
  assert.equal(upgraded.duplicate, true)
  assert.equal((await library.meta(meta.id)).fingerprint, meta.fingerprint)

  // An older import without a cover gets one when the same file comes back.
  const legacyMeta = await library.meta(meta.id)
  const withoutCover = { ...legacyMeta }
  delete withoutCover.cover
  await store.writeJson(library.metaPath(meta.id), withoutCover)
  const backfilled = await library.importBytes(epubFixture(), 'kafka.epub')
  assert.equal(backfilled.duplicate, true)
  assert.equal(backfilled.meta.cover?.file, 'cover.svg')
  assert.equal((await library.cover(meta.id)).mediaType, 'image/svg+xml')
  const progress = await library.saveProgress(meta.id, { chapterIndex: 1 })
  assert.equal(progress.chapterIndex, 1)
  assert.equal(progress.percent, 100)
  // Re-reading chapter 1 must not shrink how far the reader has read.
  const rewound = await library.saveProgress(meta.id, { chapterIndex: 0 })
  assert.equal(rewound.chapterIndex, 0)
  assert.equal(rewound.maxChapterIndex, 1)
  // The percentage follows the reading position, not the read boundary.
  assert.ok(rewound.percent > 0 && rewound.percent < 100)
  const midChapter = await library.saveProgress(meta.id, { chapterIndex: 0, pageFraction: 0.5 })
  assert.ok(midChapter.percent < rewound.percent)
  assert.equal(midChapter.maxChapterIndex, 1)
  await library.appendMessage(meta.id, { role: 'user', text: '你好', chapterIndex: 0 })
  assert.equal((await library.chat(meta.id)).length, 1)

  // 3. Routes -----------------------------------------------------------------
  const state = { activeBookId: meta.id, lastSelection: null }

  // 2b. Tools -----------------------------------------------------------------
  const definitions = []
  registerTools({ ctx: { tools: { register: (definition) => { definitions.push(definition); return () => {} } } }, library, state })
  assert.deepEqual(definitions.map((definition) => definition.name).sort(), [
    'read_chapter',
    'reading_search',
    'reading_selection',
    'reading_shelf',
  ])
  const tool = (name) => definitions.find((definition) => definition.name === name)
  assert.match(await tool('reading_shelf').execute({}), /慢慢读|海边的卡夫卡/)
  assert.match(await tool('read_chapter').execute({ chapterIndex: 1, limit: 40 }), /大岛说/)
  assert.match(await tool('reading_search').execute({ query: '图书馆' }), /第 2 章/)
  await assert.rejects(() => tool('read_chapter').execute({ chapterIndex: 2 }), /不存在|还没读到/)
  const ctx = mockContext()
  let routePath = null
  ctx.webServer.register = (route) => {
    routePath = route.path
    return () => {}
  }
  const routes = registerRoutes({
    ctx,
    library,
    config: {},
    state,
    persistActiveBook: async () => {},
    refreshContext: async () => {},
  })
  assert.equal(routePath, '/__shared-reading')

  async function call(method, path, body, headers) {
    const request = makeRequest(method, `/__shared-reading${path}`, body, headers)
    const response = makeResponse()
    await routes.handler(request, response)
    return response.state
  }

  const stateResponse = await call('GET', '/state')
  assert.equal(stateResponse.status, 200)
  const snapshot = JSON.parse(stateResponse.body)
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.book.title, '海边的卡夫卡')
  assert.equal(snapshot.book.toc.length, 2)

  const coverResponse = await call('GET', `/book/${meta.id}/cover`)
  assert.equal(coverResponse.status, 200)
  assert.match(coverResponse.headers['content-type'], /svg/)
  assert.ok(coverResponse.body.length > 0)

  const chapterResponse = await call('GET', `/book/${meta.id}/chapter/0`)
  const chapterPayload = JSON.parse(chapterResponse.body)
  assert.match(chapterPayload.chapter.text, /十五岁生日/)

  const progressResponse = await call(
    'POST',
    '/progress',
    JSON.stringify({ bookId: meta.id, chapterIndex: 0 }),
    { 'content-type': 'application/json' },
  )
  assert.equal(JSON.parse(progressResponse.body).progress.chapterIndex, 0)

  const selectionResponse = await call(
    'POST',
    '/selection',
    JSON.stringify({ bookId: meta.id, chapterIndex: 0, quote: '口袋里只有一张地图' }),
    { 'content-type': 'application/json' },
  )
  assert.equal(JSON.parse(selectionResponse.body).selection.quote, '口袋里只有一张地图')

  // Importing the same file through the route returns the same book.
  const duplicateImport = await call('POST', '/import', epubFixture(), {
    'x-file-name': encodeURIComponent('kafka-again.epub'),
  })
  const duplicatePayload = JSON.parse(duplicateImport.body)
  assert.equal(duplicatePayload.duplicate, true)
  assert.equal(duplicatePayload.bookId, meta.id)
  assert.equal(duplicatePayload.state.books.length, 1)

  // A fresh reading session is created through the Host controller.
  const sessionCtx = {
    ...mockContext(),
    get: (name) => (name === 'sessionController' ? { create: async () => ({ sessionId: 'session-test-1' }) } : undefined),
  }
  let sessionRoute = null
  sessionCtx.webServer.register = (route) => {
    sessionRoute = route
    return () => {}
  }
  const sessionRoutes = registerRoutes({
    ctx: sessionCtx,
    library,
    config: {},
    state,
    persistActiveBook: async () => {},
    refreshContext: async () => {},
  })
  const sessionRequest = makeRequest('POST', '/__shared-reading/session', '{}', { 'content-type': 'application/json' })
  const sessionResponse = makeResponse()
  await sessionRoutes.handler(sessionRequest, sessionResponse)
  assert.equal(sessionResponse.state.status, 200)
  assert.equal(JSON.parse(sessionResponse.state.body).sessionId, 'session-test-1')
  assert.equal(sessionRoute.path, '/__shared-reading')

  // The panel transcript: append a turn, read it back, clear it.
  const userRow = await call(
    'POST',
    `/book/${meta.id}/message`,
    JSON.stringify({ role: 'user', text: '这句话为什么重要？', quote: '口袋里只有一张地图', chapterIndex: 0 }),
    { 'content-type': 'application/json' },
  )
  assert.equal(JSON.parse(userRow.body).ok, true)
  const aiRow = await call(
    'POST',
    `/book/${meta.id}/message`,
    JSON.stringify({ role: 'assistant', text: '你停在这里，是因为这句话让你想起了什么？', chapterIndex: 0 }),
    { 'content-type': 'application/json' },
  )
  assert.equal(JSON.parse(aiRow.body).ok, true)
  const chat = await library.chat(meta.id)
  assert.equal(chat.length, 3)
  assert.equal(chat.at(-1).role, 'assistant')
  assert.match(chat.at(-1).text, /你停在这里/)

  const cleared = await call('DELETE', `/book/${meta.id}/chat`)
  assert.equal(JSON.parse(cleared.body).ok, true)
  assert.equal((await library.chat(meta.id)).length, 0)

  // 4. Deleting a book clears the selection it owned ---------------------------
  assert.equal(state.lastSelection?.bookId, meta.id)
  const removed = await call('DELETE', `/book/${meta.id}`)
  const removedPayload = JSON.parse(removed.body)
  assert.equal(removedPayload.ok, true)
  assert.equal(removedPayload.books.length, 0)
  assert.equal(state.lastSelection, null)

  console.log('shared-reading self-test: all checks passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
