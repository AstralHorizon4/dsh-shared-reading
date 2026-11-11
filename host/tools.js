/**
 * Model-facing tools for the book on the reader's shelf.
 *
 * The panel's chat window assembles its own context, so these exist for the
 * conversation: they let the agent read the actual text instead of guessing from
 * the title. Every read is bounded and every chapter past the reader's position
 * is refused, so the agent cannot wander ahead of them.
 */

const TEXT = (text) => [{ type: 'text', text: String(text ?? '') }]
const stringOutput = {
  schema: { type: 'string' },
  render: (_args, value) => TEXT(value),
}

function clamp(value, min, max) {
  if (!Number.isInteger(value)) return min
  return Math.min(Math.max(value, min), max)
}

async function pickBook(library, activeBookId, requested) {
  if (typeof requested === 'string' && requested.length > 0) {
    const meta = await library.meta(requested)
    if (!meta) throw new Error(`没有这本书：${requested}`)
    return meta
  }
  if (activeBookId) {
    const meta = await library.meta(activeBookId)
    if (meta) return meta
  }
  const books = await library.list()
  if (books.length === 0) throw new Error('书架上还没有书。请读者先在「共读」面板里导入一本。')
  return books[0]
}

export function registerTools({ ctx, library, state }) {
  const disposers = []

  disposers.push(
    ctx.tools.register({
      name: 'reading_shelf',
      description:
        '列出读者书架上的书、每本读到第几章，以及「共读」面板当前打开的是哪一本。讨论书里的内容之前先调用它确认书和位置。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: stringOutput,
      async execute() {
        const books = await library.list()
        if (books.length === 0) {
          return '书架是空的。请读者在「共读」面板里导入 EPUB / TXT / Markdown / HTML。'
        }
        const lines = books.map((book, index) => {
          const where = book.progress
            ? `读到第 ${book.progress.chapterIndex + 1} / ${book.chapterCount} 章`
            : `共 ${book.chapterCount} 章，还没开始读`
          const current = book.id === state.activeBookId ? ' ← 面板打开的是这本' : ''
          return `${index + 1}. 《${book.title}》${book.author ? ` · ${book.author}` : ''}（${book.format}，${where}）id=${book.id}${current}`
        })
        return lines.join('\n')
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'read_chapter',
      description:
        '按章节读这本书的真实原文，一次返回一段有上限的摘录。要用原文讨论、引用或核对细节时调用。',
      parameters: {
        type: 'object',
        properties: {
          bookId: { type: 'string', description: '书 id，省略则用面板当前打开的书' },
          chapterIndex: {
            type: 'integer',
            description: '章节序号，从 0 开始，省略则用读者当前读到的一章。读者还没读到的章节会被拒绝。',
          },
          offset: { type: 'integer', description: '从该章第几个字开始，默认 0；上一段结果末尾会给出下一页的 offset' },
          limit: { type: 'integer', description: '最多返回多少字，默认 4000，上限 8000' },
        },
        additionalProperties: false,
      },
      output: stringOutput,
      async execute(args) {
        const meta = await pickBook(library, state.activeBookId, args?.bookId)
        const sections = await library.sections(meta.id)
        const progress = await library.progress(meta.id)
        const current = progress?.maxChapterIndex ?? progress?.chapterIndex ?? 0
        const lastIndex = Math.max(0, sections.length - 1)
        if (typeof args?.chapterIndex === 'number' && (args.chapterIndex < 0 || args.chapterIndex > lastIndex)) {
          throw new Error(`第 ${args.chapterIndex + 1} 章不存在（这本书共 ${sections.length} 章，序号从 0 开始）`)
        }
        const chapterIndex = clamp(args?.chapterIndex ?? current, 0, lastIndex)
        if (progress && chapterIndex > current) {
          throw new Error(
            `读者只读到第 ${current + 1} 章，第 ${chapterIndex + 1} 章还没读到，不能提前看。可以讨论前 ${current + 1} 章。`,
          )
        }
        const section = sections[chapterIndex]
        if (!section) throw new Error(`第 ${chapterIndex + 1} 章不存在`)
        const offset = clamp(args?.offset ?? 0, 0, section.text.length)
        const limit = clamp(args?.limit ?? 4000, 200, 8000)
        const slice = section.text.slice(offset, offset + limit)
        const end = offset + slice.length
        const header = `《${meta.title}》第 ${chapterIndex + 1} / ${sections.length} 章${section.title ? `「${section.title}」` : ''}，第 ${offset + 1}–${end} 字（全章 ${section.text.length} 字）`
        const more = end < section.text.length ? `\n\n（还有后续；继续读用 chapterIndex=${chapterIndex}, offset=${end}）` : ''
        return `${header}\n\n${slice}${more}`
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'reading_search',
      description:
        '在读者已经读到的章节里检索原文，返回带章节和 offset 的命中片段。读者提到"前面说过""那个人"这类指代时用它定位。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要用读者自己的说法检索的内容' },
          bookId: { type: 'string', description: '书 id，省略则用面板当前打开的书' },
          limit: { type: 'integer', description: '最多返回几条，默认 3，上限 6' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: stringOutput,
      async execute(args) {
        const meta = await pickBook(library, state.activeBookId, args?.bookId)
        const sections = await library.sections(meta.id)
        const progress = await library.progress(meta.id)
        const lastReadable = progress ? (progress.maxChapterIndex ?? progress.chapterIndex) : sections.length - 1
        const query = String(args?.query ?? '').trim()
        if (!query) throw new Error('查询内容不能为空')
        const limit = clamp(args?.limit ?? 3, 1, 6)

        const terms = query
          .split(/[\s,，。、;；:：!！?？"'“”‘’()（）]+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 1)
        const needles = terms.length > 0 ? terms : [query]

        const hits = []
        for (let index = 0; index <= lastReadable && index < sections.length; index += 1) {
          const section = sections[index]
          let best = -1
          for (const needle of needles) {
            const found = section.text.indexOf(needle)
            if (found >= 0 && (best < 0 || found < best)) best = found
          }
          if (best < 0) continue
          const start = Math.max(0, best - 120)
          const end = Math.min(section.text.length, best + 260)
          hits.push({
            chapterIndex: index,
            title: section.title,
            offset: best,
            excerpt: section.text.slice(start, end).replace(/\s+/g, ' '),
            score: needles.filter((needle) => section.text.includes(needle)).length,
          })
        }
        if (hits.length === 0) {
          return `读者读到的前 ${lastReadable + 1} 章里没有找到「${query}」。不要用书里别处的内容补足。`
        }
        hits.sort((left, right) => right.score - left.score)
        return hits
          .slice(0, limit)
          .map(
            (hit) =>
              `第 ${hit.chapterIndex + 1} 章${hit.title ? `「${hit.title}」` : ''}（offset ${hit.offset}）：…${hit.excerpt}…`,
          )
          .join('\n\n')
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'reading_selection',
      description:
        '返回读者在「共读」面板里最近划过的那段原文和它前后的文字。读者说"这段""这里"却没有引原文时用它。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: stringOutput,
      async execute() {
        const selection = state.lastSelection
        if (!selection?.quote) return '读者还没有划任何段落。'
        const meta = await library.meta(selection.bookId)
        const sections = await library.sections(selection.bookId)
        const section = sections[selection.chapterIndex]
        if (!section) return `读者划了一段：「${selection.quote}」（但这一章已经不在书架上了）`
        const index = section.text.indexOf(selection.quote)
        const start = index >= 0 ? Math.max(0, index - 400) : 0
        const end = index >= 0 ? Math.min(section.text.length, index + selection.quote.length + 600) : 1000
        return [
          `《${meta?.title ?? '这本书'}》第 ${selection.chapterIndex + 1} 章${section.title ? `「${section.title}」` : ''}`,
          `读者划出的原文：${selection.quote}`,
          '上下文：',
          section.text.slice(start, end),
        ].join('\n')
      },
    }),
  )

  return { dispose: () => disposers.forEach((dispose) => dispose?.()) }
}
