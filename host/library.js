/**
 * The shelf: books, per-book progress, and the discussion log.
 *
 * `meta.json` is the only index; `sections.json` holds the flattened chapters.
 * Progress is one number per book (`chapterIndex`), and every other read of the
 * book — the reader's restored position, the model's context, the tools — is
 * derived from that one number.
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { parseBook } from './formats.js'

const MAX_QUOTE = 2000
const COVER_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}
const MAX_QUESTION = 4000

export class Library {
  constructor(store) {
    this.store = store
  }

  metaPath(bookId) {
    return this.store.bookPath(bookId, 'meta.json')
  }

  sectionsPath(bookId) {
    return this.store.bookPath(bookId, 'sections.json')
  }

  async list() {
    const ids = await this.store.bookIds()
    const books = []
    for (const id of ids) {
      const meta = await this.meta(id)
      if (!meta) continue
      const progress = await this.progress(id)
      books.push({
        id: meta.id,
        title: meta.title,
        author: meta.author,
        format: meta.format,
        chapterCount: meta.chapterCount,
        chars: meta.chars,
        hasCover: Boolean(meta.cover?.file),
        createdAt: meta.createdAt,
        updatedAt: progress?.updatedAt ?? meta.updatedAt,
        warnings: meta.warnings ?? [],
        progress,
      })
    }
    // "Recently read" first: a book that has been opened outranks a book that
    // only sits on the shelf, then the most recent activity wins.
    return books.sort((left, right) => {
      if (Boolean(left.progress) !== Boolean(right.progress)) return left.progress ? -1 : 1
      return String(right.updatedAt).localeCompare(String(left.updatedAt))
    })
  }

  async meta(bookId) {
    if (!bookId) return null
    return this.store.readJson(this.metaPath(bookId), null)
  }

  async sections(bookId) {
    if (!bookId) return []
    const sections = await this.store.readJson(this.sectionsPath(bookId), [])
    return Array.isArray(sections) ? sections : []
  }

  /**
   * Import one file.
   *
   * The id is title-based but random-suffixed; the content fingerprint is what
   * decides whether this is the same book. Importing the same file twice opens
   * the copy already on the shelf instead of forking its chat log in two.
   */
  async importBytes(bytes, fileName) {
    const parsed = parseBook(bytes, fileName)
    const fingerprint = fingerprintOf(parsed.sections)
    const duplicate = await this.findByFingerprint(fingerprint, parsed)
    if (duplicate) {
      // Re-importing the same file must not fork the book, but it is the one
      // chance to backfill a cover onto an older import.
      if (parsed.cover?.bytes?.length > 0 && !duplicate.cover?.file) {
        const extension = COVER_EXTENSIONS[parsed.cover.mediaType] ?? 'jpg'
        const file = `cover.${extension}`
        await writeFile(this.store.bookPath(duplicate.id, file), parsed.cover.bytes)
        const upgraded = { ...duplicate, cover: { file, mediaType: parsed.cover.mediaType } }
        await this.store.writeJson(this.metaPath(duplicate.id), upgraded)
        return { meta: upgraded, duplicate: true }
      }
      return { meta: duplicate, duplicate: true }
    }

    const id = await this.uniqueId(parsed.title)
    const now = new Date().toISOString()
    let cover = null
    if (parsed.cover?.bytes?.length > 0) {
      const extension = COVER_EXTENSIONS[parsed.cover.mediaType] ?? 'jpg'
      cover = { file: `cover.${extension}`, mediaType: parsed.cover.mediaType }
    }
    const meta = {
      id,
      title: parsed.title,
      author: parsed.author,
      format: parsed.format,
      chapterCount: parsed.sections.length,
      chars: parsed.sections.reduce((total, section) => total + section.text.length, 0),
      fingerprint,
      ...(cover ? { cover } : {}),
      warnings: parsed.warnings,
      createdAt: now,
      updatedAt: now,
    }
    await this.store.writeJson(this.sectionsPath(id), parsed.sections)
    if (cover) await writeFile(this.store.bookPath(id, cover.file), parsed.cover.bytes)
    await this.store.writeJson(this.metaPath(id), meta)
    return { meta, duplicate: false }
  }

  /**
   * Exact-content match. Books imported before fingerprints existed are
   * fingerprinted lazily, and only when their shape already matches — so a
   * shelf of old imports does not turn one duplicate check into a full rehash.
   */
  async findByFingerprint(fingerprint, parsed) {
    const chars = parsed.sections.reduce((total, section) => total + section.text.length, 0)
    for (const id of await this.store.bookIds()) {
      const meta = await this.meta(id)
      if (!meta) continue
      if (meta.fingerprint === fingerprint) return meta
      if (meta.fingerprint) continue
      if (meta.chapterCount !== parsed.sections.length || meta.chars !== chars) continue
      const sections = await this.sections(id)
      if (fingerprintOf(sections) !== fingerprint) continue
      const upgraded = { ...meta, fingerprint }
      await this.store.writeJson(this.metaPath(id), upgraded)
      return upgraded
    }
    return null
  }

  async uniqueId(title) {
    const base = String(title || 'book')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = `${base || 'book'}-${randomBytes(3).toString('hex')}`
      if (!(await this.meta(id))) return id
    }
    return `book-${Date.now().toString(36)}`
  }

  async remove(bookId) {
    const { rm } = await import('node:fs/promises')
    await rm(this.store.path('books', bookId), { recursive: true, force: true })
    await rm(this.store.progressPath(bookId), { force: true })
    await rm(this.store.chatPath(bookId), { force: true })
  }

  async progress(bookId) {
    if (!bookId) return null
    return this.store.readJson(this.store.progressPath(bookId), null)
  }

  async saveProgress(bookId, input) {
    const sections = await this.sections(bookId)
    if (sections.length === 0) throw new Error('这本书还没有正文')
    const meta = await this.meta(bookId)
    const claimed = Number.isInteger(input?.chapterIndex) ? input.chapterIndex : 0
    const chapterIndex = Math.min(Math.max(0, claimed), sections.length - 1)
    // Two numbers, because they answer two questions: `chapterIndex` is where
    // the reader is looking, `maxChapterIndex` is how far they have read. Going
    // back to re-read a chapter must not shrink what the agent may discuss.
    const previous = await this.progress(bookId)
    const readTo = Math.max(previous?.maxChapterIndex ?? previous?.chapterIndex ?? 0, chapterIndex)
    // The reader turns pages inside a chapter; the percentage is character
    // weighted, so it moves continuously instead of jumping once per chapter.
    const fraction = Number.isFinite(input?.pageFraction)
      ? Math.min(Math.max(input.pageFraction, 0), 1)
      : previous?.chapterIndex === chapterIndex && Number.isFinite(previous?.pageFraction)
        ? previous.pageFraction
        : 1
    const lengths = sections.map((section) => section.text.length)
    const totalChars = lengths.reduce((total, length) => total + length, 0) || 1
    const before = lengths.slice(0, chapterIndex).reduce((total, length) => total + length, 0)
    const percent = Math.round(((before + lengths[chapterIndex] * fraction) / totalChars) * 1000) / 10
    const progress = {
      bookId,
      chapterIndex,
      maxChapterIndex: readTo,
      pageFraction: fraction,
      chapterTitle: sections[chapterIndex]?.title ?? null,
      chapterCount: sections.length,
      percent,
      bookTitle: meta?.title ?? null,
      updatedAt: new Date().toISOString(),
    }
    await this.store.writeJson(this.store.progressPath(bookId), progress)
    return progress
  }

  async chat(bookId) {
    if (!bookId) return []
    const rows = await this.store.readJsonl(this.store.chatPath(bookId))
    return rows.slice(-200)
  }

  async cover(bookId) {
    const meta = await this.meta(bookId)
    if (!meta?.cover?.file) return null
    try {
      return { bytes: await readFile(this.store.bookPath(bookId, meta.cover.file)), mediaType: meta.cover.mediaType }
    } catch {
      return null
    }
  }

  /** Truncate one book's panel transcript without touching the books or progress. */
  async clearChat(bookId) {
    await writeFile(this.store.chatPath(bookId), '', 'utf8')
  }

  async appendMessage(bookId, message) {
    const row = {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: String(message.text ?? '').slice(0, 20000),
      quote: message.quote ? String(message.quote).slice(0, MAX_QUOTE) : null,
      chapterIndex: Number.isInteger(message.chapterIndex) ? message.chapterIndex : null,
      ...(message.web ? { web: true } : {}),
      ...(Array.isArray(message.sources) && message.sources.length > 0
        ? { sources: message.sources.slice(0, 5).map((source) => ({ title: source.title, url: source.url })) }
        : {}),
      at: new Date().toISOString(),
    }
    await this.store.appendJsonl(this.store.chatPath(bookId), row)
    return row
  }

  async touch(bookId) {
    const meta = await this.meta(bookId)
    if (!meta) return
    await this.store.writeJson(this.metaPath(bookId), { ...meta, updatedAt: new Date().toISOString() })
  }
}

export { MAX_QUESTION, MAX_QUOTE, fingerprintOf }

/**
 * Content identity: titles and text, with separators that cannot occur inside
 * a chapter. Two files of the same book in different containers (EPUB vs TXT)
 * still differ, which is honest — their chapters are cut differently.
 */
function fingerprintOf(sections) {
  const hash = createHash('sha256')
  for (const section of sections ?? []) {
    hash.update(String(section?.title ?? ''))
    hash.update('\u0000')
    hash.update(String(section?.text ?? ''))
    hash.update('\u0001')
  }
  return hash.digest('hex')
}
