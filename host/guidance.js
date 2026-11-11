/**
 * The co-reader stance.
 *
 * Two audiences, deliberately different:
 *   - the panel's single-turn call gets a compact system prompt per question;
 *   - the conversation agent gets a short section that only says where the
 *     reader is and which tools to call, so the session prompt does not grow a
 *     book-sized appendix.
 */

export const READING_RULES = `【共读面板】
用户在这个工作区里有一个「共读」面板：他可以导入 EPUB / TXT / Markdown / HTML，在面板里读书，划词之后直接问。
- 面板里的对话是单轮的：只带当前章节的一段窗口和最近几条消息，不要假设自己记得更早的讨论。
- 需要原文时用 read_chapter / reading_search 取，不要凭书名或印象复述书里的内容。
- 只讨论用户已经读到的章节，不要提前讲后面的情节。`

export function bookContextLine({ book, progress, selection }) {
  const total = book.chapterCount ? ` / ${book.chapterCount}` : ''
  const position = progress?.chapterIndex ?? 0
  const readTo = progress?.maxChapterIndex ?? position
  const boundary = readTo > position ? `（已经读到第 ${readTo + 1} 章）` : ''
  const line = `读者开了「共读」面板，正在读《${book.title}》，在第 ${position + 1}${total} 章${progress?.chapterTitle ? `「${progress.chapterTitle}」` : ''}${boundary}。`
  const quoted = selection?.quote
    ? `他刚划了第 ${(selection.chapterIndex ?? 0) + 1} 章的一段：「${String(selection.quote).slice(0, 120)}」（用 reading_selection 取完整上下文）。`
    : '可以用 reading_shelf / read_chapter / reading_search 查看这本书。'
  return `${line}${quoted}`
}
