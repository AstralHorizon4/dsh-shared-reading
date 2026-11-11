/**
 * The panel's HTTP surface.
 *
 * The reader lives in the browser, so it needs one channel to the Host half.
 * A single prefix route dispatches on the remaining path; the panel's questions
 * go through the same `/ask` entry whether they came from a highlight or from
 * the composer, so the model always sees the same assembled context.
 */

import { optionalService, resolveRoute } from './model.js'

const PREFIX = '/__shared-reading'
const MAX_BODY = 64 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('文件太大（上限 64 MB）。'))
        req.destroy()
        return
      }
      parts.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function clamp(value, min, max) {
  if (!Number.isInteger(value)) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * @param {{
 *   ctx: any,
 *   library: import('./library.js').Library,
 *   config: { chatModel?: string, chatProvider?: string, maxTokens?: number },
 *   state: { lastSelection: any },
 *   persistActiveBook: (bookId: string | null) => Promise<void>,
 *   refreshContext?: () => Promise<void>,
 * }} deps
 */
export function registerRoutes(deps) {
  const { ctx, library, config, state, persistActiveBook, refreshContext } = deps

  async function snapshot() {
    const books = await library.list()
    const activeBookId =
      state.activeBookId && books.some((book) => book.id === state.activeBookId)
        ? state.activeBookId
        : (books[0]?.id ?? null)
    if (activeBookId !== state.activeBookId) {
      state.activeBookId = activeBookId
      await persistActiveBook(activeBookId)
      await refreshContext?.()
    }

    const active = books.find((book) => book.id === activeBookId) ?? null
    let book = null
    if (active) {
      const sections = await library.sections(active.id)
      book = {
        id: active.id,
        title: active.title,
        author: active.author,
        format: active.format,
        cover: active.hasCover === true,
        chapterCount: active.chapterCount,
        chars: active.chars,
        warnings: active.warnings ?? [],
        progress: active.progress,
        toc: sections.map((section) => ({ index: section.index, title: section.title, chars: section.text.length })),
      }
    }

    return {
      ok: true,
      route: resolveRoute(ctx, config),
      books: books.map((item) => ({
        id: item.id,
        title: item.title,
        author: item.author,
        format: item.format,
        chapterCount: item.chapterCount,
        chapterIndex: item.progress?.chapterIndex ?? 0,
        percent: item.progress?.percent ?? 0,
        cover: item.hasCover === true,
      })),
      activeBookId,
      book,
      selection: state.lastSelection,
    }
  }

  async function activeBody(raw) {
    const body = raw ? JSON.parse(raw.toString('utf8') || '{}') : {}
    const bookId = String(body?.bookId ?? state.activeBookId ?? '')
    const meta = await library.meta(bookId)
    if (!meta) throw Object.assign(new Error('还没有打开任何书'), { status: 404 })
    return { body, meta }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.slice(PREFIX.length) || '/'
    const method = req.method ?? 'GET'
    const segments = path.split('/').filter(Boolean)

    try {
      if (method === 'GET' && path === '/state') {
        return sendJson(res, 200, await snapshot())
      }

      if (method === 'POST' && path === '/session') {
        // The panel is root-scoped and has no session identity; every book gets
        // its own fresh session, created here rather than through a Remote the
        // Client plugin cannot reach.
        const controller = optionalService(ctx, 'sessionController')
        if (!controller?.create) {
          return sendJson(res, 503, { ok: false, error: '这个部署没有会话控制器' })
        }
        try {
          const created = await controller.create({})
          if (!created?.sessionId) return sendJson(res, 500, { ok: false, error: '新建会话没有返回 id' })
          return sendJson(res, 200, { ok: true, sessionId: created.sessionId })
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      }

      if (method === 'POST' && path === '/active') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const meta = await library.meta(String(body?.bookId ?? ''))
        if (!meta) return sendJson(res, 404, { ok: false, error: '没有这本书' })
        state.activeBookId = meta.id
        await persistActiveBook(meta.id)
        await refreshContext?.()
        return sendJson(res, 200, await snapshot())
      }

      if (method === 'POST' && path === '/import') {
        const rawName = String(req.headers['x-file-name'] ?? 'book.epub')
        let fileName = rawName
        try {
          fileName = decodeURIComponent(rawName)
        } catch {
          // A raw or broken escape still gets a try.
        }
        fileName = fileName.split(/[\\/]/).pop() || 'book.epub'
        const bytes = await readBody(req)
        if (bytes.length === 0) return sendJson(res, 400, { ok: false, error: '上传的文件是空的' })
        let imported
        try {
          imported = await library.importBytes(bytes, fileName)
        } catch (error) {
          // A refused format is the reader's business, not a 500.
          return sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
        const { meta, duplicate } = imported
        state.activeBookId = meta.id
        await persistActiveBook(meta.id)
        await refreshContext?.()
        if (!duplicate) {
          ctx.logger?.info?.(`shared-reading: imported ${meta.title} (${meta.format}, ${meta.chapterCount} sections)`)
        }
        return sendJson(res, 200, { ok: true, bookId: meta.id, meta, duplicate, state: await snapshot() })
      }

      if (method === 'DELETE' && segments[0] === 'book' && segments.length === 2) {
        const bookId = decodeURIComponent(segments[1])
        if (!(await library.meta(bookId))) return sendJson(res, 404, { ok: false, error: '没有这本书' })
        await library.remove(bookId)
        if (state.lastSelection?.bookId === bookId) state.lastSelection = null
        if (state.activeBookId === bookId) {
          state.activeBookId = null
          await persistActiveBook(null)
        }
        await refreshContext?.()
        return sendJson(res, 200, await snapshot())
      }

      if (method === 'GET' && segments[0] === 'book' && segments[2] === 'cover') {
        const bookId = decodeURIComponent(segments[1])
        const cover = await library.cover(bookId)
        if (!cover) return sendJson(res, 404, { ok: false, error: '这本书没有封面' })
        res.statusCode = 200
        res.setHeader('content-type', cover.mediaType)
        res.setHeader('cache-control', 'public, max-age=3600')
        res.end(cover.bytes)
        return
      }

      if (method === 'GET' && segments[0] === 'book' && segments[2] === 'chapter') {
        const bookId = decodeURIComponent(segments[1])
        const sections = await library.sections(bookId)
        if (sections.length === 0) return sendJson(res, 404, { ok: false, error: '没有这本书' })
        const index = clamp(Number.parseInt(segments[3] ?? '0', 10), 0, sections.length - 1)
        const section = sections[index]
        return sendJson(res, 200, {
          ok: true,
          chapter: { index, title: section.title, text: section.text, count: sections.length },
        })
      }

      if (method === 'POST' && segments[0] === 'book' && segments[2] === 'message') {
        const bookId = decodeURIComponent(segments[1])
        if (!(await library.meta(bookId))) return sendJson(res, 404, { ok: false, error: '没有这本书' })
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        const row = await library.appendMessage(bookId, {
          role: body?.role === 'assistant' ? 'assistant' : 'user',
          text: String(body?.text ?? ''),
          quote: typeof body?.quote === 'string' ? body.quote : null,
          chapterIndex: Number.isInteger(body?.chapterIndex) ? body.chapterIndex : null,
        })
        return sendJson(res, 200, { ok: true, message: row })
      }

      if (method === 'DELETE' && segments[0] === 'book' && segments[2] === 'chat') {
        const bookId = decodeURIComponent(segments[1])
        if (!(await library.meta(bookId))) return sendJson(res, 404, { ok: false, error: '没有这本书' })
        await library.clearChat(bookId)
        return sendJson(res, 200, { ok: true })
      }

      if (method === 'GET' && segments[0] === 'book' && segments[2] === 'chat') {
        const bookId = decodeURIComponent(segments[1])
        return sendJson(res, 200, { ok: true, messages: await library.chat(bookId) })
      }

      if (method === 'POST' && path === '/progress') {
        const { body, meta } = await activeBody(await readBody(req))
        const progress = await library.saveProgress(meta.id, {
          chapterIndex: Number(body?.chapterIndex),
          pageFraction: typeof body?.pageFraction === 'number' ? body.pageFraction : undefined,
        })
        await library.touch(meta.id)
        await refreshContext?.()
        return sendJson(res, 200, { ok: true, progress })
      }

      if (method === 'POST' && path === '/selection') {
        const { body, meta } = await activeBody(await readBody(req))
        const sections = await library.sections(meta.id)
        const chapterIndex = clamp(Number(body?.chapterIndex ?? 0), 0, Math.max(0, sections.length - 1))
        const quote = typeof body?.quote === 'string' ? body.quote.trim().slice(0, 2000) : ''
        state.lastSelection = quote
          ? { bookId: meta.id, chapterIndex, quote, at: new Date().toISOString() }
          : null
        if (quote) {
          await library.saveProgress(meta.id, { chapterIndex })
          await refreshContext?.()
        }
        return sendJson(res, 200, { ok: true, selection: state.lastSelection })
      }

      return sendJson(res, 404, { ok: false, error: `未知的接口：${method} ${path}` })
    } catch (error) {
      const status = error?.status ?? 500
      try {
        sendJson(res, status, { ok: false, error: String(error?.message ?? error) })
      } catch {
        // Response already gone.
      }
    }
  }

  const dispose = ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler })
  return { dispose, handler, snapshot }
}

export { PREFIX }
