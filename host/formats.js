/**
 * Import: turn a file the reader dropped on the panel into plain chapters.
 *
 * Every supported format ends up in exactly one shape — `{ index, title, text }`
 * sections — because the reader, the chat window and the model tools must all
 * agree on what "第 3 章" means. Formats that cannot be flattened honestly
 * (fixed-layout PDF, KF8) are refused with a reason instead of half-supported.
 */

import { inflateRawSync } from 'node:zlib'

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.html', '.htm', '.xhtml'])
const MAX_CHAPTER_CHARS = 9000

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–',
  hellip: '…', middot: '·', laquo: '«', raquo: '»', copy: '©', times: '×',
}

/**
 * @param {Buffer} bytes
 * @param {string} fileName
 * @returns {{ title: string, author: string, format: string, sections: {index:number,title:string,text:string}[], warnings: string[] }}
 */
export function parseBook(bytes, fileName) {
  const name = String(fileName || 'book').split(/[\\/]/).pop() || 'book'
  const lower = name.toLowerCase()
  const extension = extensionOf(lower)
  const warnings = []

  let book
  if (extension === '.epub' || looksLikeZip(bytes)) {
    book = parseEpub(bytes, name)
    book.format = 'epub'
  } else if (TEXT_EXTENSIONS.has(extension)) {
    book = parsePlainFile(bytes, name, extension)
    book.format = extension.slice(1)
  } else if (extension === '.pdf' || extension === '.azw3' || extension === '.kf8') {
    throw new Error(`${extension.toUpperCase()} 暂时不支持：共读面板需要可重排的正文，请先转成 EPUB 或 TXT。`)
  } else {
    // Unknown extension: try text, but say what we assumed.
    book = parsePlainFile(bytes, name, extension)
    book.format = 'text'
    warnings.push(`按纯文本读取（没有识别出 ${extension || '未知'} 扩展名）。`)
  }

  const sections = book.sections
    .map((section, index) => ({
      index,
      title: normalizeTitle(section.title) || `第 ${index + 1} 章`,
      text: section.text.replace(/\u0000/g, '').trim(),
    }))
    .filter((section) => section.text.length > 0)

  if (sections.length === 0) throw new Error('这个文件里没有可读的正文。')
  sections.forEach((section, index) => {
    section.index = index
  })

  return {
    title: normalizeTitle(book.title) || stripExtension(name),
    author: normalizeTitle(book.author) || '',
    format: book.format,
    sections,
    warnings: [...warnings, ...(book.warnings ?? [])],
    cover: book.cover ?? null,
  }
}

function extensionOf(lower) {
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

function stripExtension(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function looksLikeZip(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function normalizeTitle(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ------------------------------------------------------------------ text --- */

function decodeText(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
  } catch {
    // Not valid UTF-8.
  }
  for (const encoding of ['gb18030', 'big5', 'shift_jis']) {
    try {
      return stripBom(new TextDecoder(encoding, { fatal: true }).decode(buffer))
    } catch {
      // try the next encoding
    }
  }
  return stripBom(new TextDecoder('utf-8').decode(buffer))
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function htmlToText(html) {
  const stripped = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|svg)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article|pre|dd|dt|figcaption|td|th)>/gi, '\n')
    // Inline tags are removed with the empty string, not a space: typeset
    // EPUBs wrap every glyph in its own <span>, and substituting a space for
    // each one turns "根据" into "根 据" and rewraps the whole paragraph.
    .replace(/<[^>]+>/g, '')
  return decodeEntities(stripped)
    .replace(/[ \t\u00a0\u3000]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const CHAPTER_HEADING = /^(?:第\s*[0-9零〇一二三四五六七八九十百千万两]+\s*[章节回卷部篇]|(?:chapter|part|book)\s+[0-9ivxlcdm]+|[0-9]{1,3}[、.．]\s*\S|序章|楔子|前言|后记|尾声|附录)/i
const MARKDOWN_HEADING = /^#{1,6}\s+\S/

function isHeadingLine(line) {
  if (MARKDOWN_HEADING.test(line)) return true
  if (CHAPTER_HEADING.test(line)) return line.length <= 60
  return false
}

function cleanHeading(line) {
  return normalizeTitle(
    line
      .replace(/^#{1,6}\s+/, '')
      .replace(/[*_`]/g, '')
      .replace(/^\s*[-–—]\s*/, ''),
  )
}

/** Split a flat text into chapters at heading-looking lines. */
function splitByLines(text, fallbackTitle) {
  const chapters = []
  let current = { title: fallbackTitle, lines: [] }
  let sawHeading = false

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && isHeadingLine(trimmed)) {
      const pending = current.lines.join('\n').trim()
      const isTitlePage =
        !sawHeading && pending.length > 0 && pending.length < 120 && pending.split('\n').filter(Boolean).length <= 3
      if (pending.length > 0 && !isTitlePage) chapters.push(current)
      current = { title: cleanHeading(trimmed), lines: [] }
      sawHeading = true
      continue
    }
    current.lines.push(line)
  }
  if (current.lines.join('\n').trim().length > 0) chapters.push(current)
  if (!sawHeading) chapters[0].title = fallbackTitle
  return chapters.map((chapter) => ({ title: chapter.title, text: chapter.lines.join('\n').trim() }))
}

/** Node text is one huge run: split on paragraph boundaries, never mid-line. */
function chunkText(text, title, max = MAX_CHAPTER_CHARS) {
  const paragraphs = text.split(/\n{2,}/)
  const chunks = []
  let buffer = ''
  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (candidate.length > max && buffer) {
      chunks.push(buffer)
      buffer = paragraph
    } else {
      buffer = candidate
    }
  }
  if (buffer.trim()) chunks.push(buffer)
  if (chunks.length <= 1) return [{ title, text }]
  return chunks.map((chunk, index) => ({ title: `${title}（${index + 1}）`, text: chunk }))
}

function parsePlainFile(bytes, name, extension) {
  const raw = decodeText(bytes)
  const title = stripExtension(name)

  if (extension === '.html' || extension === '.htm' || extension === '.xhtml') {
    return parseHtml(raw, title)
  }

  const chapters = splitByLines(raw.replace(/\r\n?/g, '\n'), title)
  const sections = chapters.flatMap((chapter) => chunkText(chapter.text, chapter.title))
  return { title, author: '', sections }
}

function parseHtml(html, title) {
  const parts = String(html).split(/(?=<h[1-3][\s>])/i)
  const candidates = parts
    .map((part) => {
      const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(part)
      const headingText = heading ? htmlToText(heading[1]) : ''
      const text = htmlToText(part)
      return { title: headingText, text }
    })
    .filter((part) => part.text.length > 0)

  if (candidates.length <= 1) {
    const flat = htmlToText(html)
    const chapters = splitByLines(flat, title)
    return { title, author: '', sections: chapters.flatMap((chapter) => chunkText(chapter.text, chapter.title)) }
  }
  const sections = candidates.flatMap((candidate) => chunkText(candidate.text, candidate.title || title))
  return { title, author: '', sections }
}

/* ------------------------------------------------------------------- zip --- */

function readZip(buffer) {
  let eocd = -1
  const start = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 EPUB（找不到 ZIP 结束记录）')

  const count = buffer.readUInt16LE(eocd + 10)
  let pointer = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()

  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) break
    const method = buffer.readUInt16LE(pointer + 10)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    const entryName = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    entries.set(entryName.replace(/^\.\//, ''), { method, compressedSize, localOffset })
    pointer += 46 + nameLength + extraLength + commentLength
  }

  const read = (entryName) => {
    const normalized = String(entryName).replace(/^\.\//, '').replace(/^\//, '')
    const entry = entries.get(normalized)
    if (!entry) return null
    const local = entry.localOffset
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) return null
    const nameLength = buffer.readUInt16LE(local + 26)
    const extraLength = buffer.readUInt16LE(local + 28)
    const dataStart = local + 30 + nameLength + extraLength
    const data = buffer.subarray(dataStart, dataStart + entry.compressedSize)
    try {
      if (entry.method === 0) return Buffer.from(data)
      if (entry.method === 8) return inflateRawSync(data)
    } catch {
      return null
    }
    return null
  }

  return {
    names: () => [...entries.keys()],
    read,
    readAny(path) {
      const candidates = [path, decodeURIComponentSafe(path), encodeURI(path).replace(/%2F/gi, '/')]
      for (const candidate of candidates) {
        const data = read(candidate)
        if (data) return data
      }
      return null
    },
    text(path) {
      const data = this.readAny(path)
      return data ? data.toString('utf8') : null
    },
  }
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function joinPath(baseDir, href) {
  const cleanHref = String(href).split('#')[0]
  if (!baseDir) return cleanHref
  const parts = `${baseDir}/${cleanHref}`.split('/')
  const stack = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function attribute(source, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(source)
  return match ? (match[2] ?? match[3] ?? '') : ''
}

/* ------------------------------------------------------------------ epub --- */

function parseEpub(bytes, name) {
  const zip = readZip(bytes)
  const container = zip.text('META-INF/container.xml')
  if (!container) throw new Error('EPUB 缺少 META-INF/container.xml')
  const rootPath = attribute(/<rootfile\b[^>]*>/i.exec(container)?.[0] ?? '', 'full-path')
  if (!rootPath) throw new Error('EPUB 的 container.xml 没有指向 OPF 文件')

  const opf = zip.text(rootPath)
  if (!opf) throw new Error('EPUB 里找不到 OPF 文件')
  const baseDir = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/')) : ''

  const title = htmlToText(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1] ?? '') || stripExtension(name)
  const author = htmlToText(
    /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opf)?.[1] ?? '',
  )

  const manifest = new Map()
  for (const match of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
    const tag = match[1]
    const id = attribute(tag, 'id')
    const href = attribute(tag, 'href')
    if (!id || !href) continue
    manifest.set(id, {
      href,
      path: joinPath(baseDir, href),
      mediaType: attribute(tag, 'media-type'),
      properties: attribute(tag, 'properties'),
    })
  }

  // Cover art: EPUB3 marks it with `properties="cover-image"`, EPUB2 points at
  // the manifest id from a <meta name="cover"> tag.
  let coverItem = [...manifest.values()].find((item) => /(^|\s)cover-image(\s|$)/i.test(item.properties))
  if (!coverItem) {
    // EPUB2: <meta name="cover" content="id"/> — attributes may come in either order.
    for (const tag of opf.matchAll(/<meta\b[^>]*>/gi)) {
      const name = attribute(tag[0], 'name')
      const content = attribute(tag[0], 'content')
      if (!/^cover$/i.test(name) || !content) continue
      coverItem =
        manifest.get(content) ??
        [...manifest.values()].find(
          (item) => item.href === content || item.href.endsWith(`/${content}`) || item.href.includes(content),
        )
      if (coverItem) break
    }
  }
  if (!coverItem) {
    // A guide page that shows the cover image as its only picture.
    const guide = /<reference\b[^>]*type\s*=\s*"cover"[^>]*href\s*=\s*"([^"]+)"/i.exec(opf)
    const page = guide ? zip.text(joinPath(baseDir, guide[1])) : null
    const image = page ? /<img\b[^>]*src\s*=\s*"([^"]+)"/i.exec(page) : null
    if (image) {
      const file = image[1].split('/').pop()
      coverItem = [...manifest.values()].find((item) => item.href.split('/').pop() === file)
    }
  }
  if (!coverItem) {
    // Last resort: a manifest image whose own name says "cover".
    coverItem = [...manifest.values()].find((item) => /image\//i.test(item.mediaType) && /cover/i.test(item.href))
  }
  const coverBytes = coverItem ? zip.readAny(coverItem.path) : null
  const cover = coverBytes && coverBytes.length > 0
    ? { bytes: coverBytes, mediaType: coverItem.mediaType || 'image/jpeg' }
    : null

  const spine = []
  for (const match of opf.matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
    const idref = attribute(match[1], 'idref')
    const item = manifest.get(idref)
    if (item) spine.push(item)
  }
  if (spine.length === 0) {
    // A broken spine: fall back to every XHTML document in manifest order.
    for (const item of manifest.values()) {
      if (/xhtml|html/i.test(item.mediaType)) spine.push(item)
    }
  }
  if (spine.length === 0) throw new Error('这本 EPUB 没有可读的正文文档')

  const labels = readEpubLabels(zip, manifest)

  const sections = []
  const warnings = []
  for (const item of spine) {
    const xml = zip.text(item.path)
    if (!xml) continue
    const text = htmlToText(xml)
    if (!text) continue
    const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(xml)
    const headingText = heading ? htmlToText(heading[1]) : ''
    const title2 = labels.get(item.href.split('#')[0]) || headingText || `第 ${sections.length + 1} 章`
    for (const chunk of chunkText(text, title2)) sections.push(chunk)
  }

  if (sections.length === 0) warnings.push('这本 EPUB 的正文是图片（漫画/扫描版），没有文字可以讨论。')
  return { title, author, sections, warnings, cover }
}

/** Titles from the EPUB navigation document or the NCX, keyed by href. */
function readEpubLabels(zip, manifest) {
  const labels = new Map()
  const navItems = [...manifest.values()].filter((item) => /(^|\s)nav(\s|$)/i.test(item.properties))
  const ncxItems = [...manifest.values()].filter((item) => /dtbncx/i.test(item.mediaType))

  for (const item of navItems) {
    const xml = zip.text(item.path)
    if (!xml) continue
    for (const match of xml.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = htmlToText(match[2])
      const href = match[1].split('#')[0]
      if (label && href && !labels.has(href)) labels.set(href, label)
    }
  }

  for (const item of ncxItems) {
    const xml = zip.text(item.path)
    if (!xml) continue
    for (const match of xml.matchAll(/<navLabel>\s*<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src\s*=\s*"([^"]+)"/gi)) {
      const label = htmlToText(match[1])
      const href = match[2].split('#')[0]
      if (label && href && !labels.has(href)) labels.set(href, label)
    }
  }

  return labels
}

export { htmlToText, decodeText }
