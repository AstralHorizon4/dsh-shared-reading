/**
 * Small pure helpers shared by the routes and the model tools: locate the
 * reader's quote in a chapter, clip text, and describe where they are.
 */

export function clip(text, limit) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 1))}…`
}

/**
 * The paragraph-ish neighbourhood of the reader's quote.
 *
 * A quote that cannot be found is not an error: the reader may have selected
 * text the extractor normalized differently. The chapter head is still a fair
 * context, and `matched: false` tells the caller to say so.
 */
export function windowAround(text, quote, before = 700, after = 900) {
  const source = String(text ?? '')
  const needle = String(quote ?? '').trim()
  const matched = needle.length > 0 ? source.indexOf(needle) : -1
  if (matched < 0) {
    return { text: clip(source, before + after), quote: null, matched: false, offset: 0 }
  }
  const start = Math.max(0, matched - before)
  const end = Math.min(source.length, matched + needle.length + after)
  return { text: source.slice(start, end), quote: needle, matched: true, offset: matched - start }
}

export function describeProgress(progress, book) {
  if (!progress) {
    return `读者还没有在这本书里留下阅读位置（《${book?.title ?? '这本书'}》共 ${book?.chapterCount ?? '?'} 章）。`
  }
  const total = progress.chapterCount ?? book?.chapterCount ?? null
  const where = total ? `第 ${progress.chapterIndex + 1} / ${total} 章` : `第 ${progress.chapterIndex + 1} 章`
  return `读者正在读《${book?.title ?? progress.bookTitle ?? '这本书'}》，读到${where}${progress.chapterTitle ? `「${progress.chapterTitle}」` : ''}。`
}

export function recentTranscript(messages, limit = 6) {
  return (messages ?? [])
    .slice(-limit)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: clip(message.text, 500),
    }))
    .filter((message) => message.text.length > 0)
}
