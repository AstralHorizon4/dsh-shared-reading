window.__ModuleLoader__.load({
  id: 'dsh-shared-reading',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React

    const PREFIX = '/__shared-reading'
    const COLUMN_GAP = 56
    const CHAT_WIDTH_KEY = 'shared-reading:chat-width'
    const CHAT_MIN = 300
    const CHAT_MAX = 640
    const CHAT_DEFAULT = 370
    const FONT_KEY = 'shared-reading:font-size'

    const STRINGS = {
      zh: {
        panel: '共读',
        subtitle: '划词就问',
        shelf: '书架',
        allBooks: '全部',
        booksUnit: '本',
        continueReading: '继续读',
        import: '导入书',
        importing: '正在导入…',
        emptyTitle: '书架还是空的',
        emptyBody: '导入一本 EPUB / TXT / Markdown / HTML，然后在右边划词问 agent。书和对话都留在这台机器上。',
        emptyAction: '选一本书',
        formats: '支持 EPUB（文字版）、TXT、Markdown、HTML；PDF / AZW3 会被明确拒绝。',
        chapter: '章',
        prev: '上一章',
        next: '下一章',
        quoteHint: '已选中',
        quoteClear: '取消',
        quoteAsk: '就这段聊',
        chatTitle: '就着这段聊',
        chatEmpty: '在左边划一段文字，或者直接在这里问这一章的问题。',
        chatPlaceholder: '想问什么？Enter 发送，Shift+Enter 换行',
        send: '发送',
        stop: '停止',
        thinking: '…',
        loading: '正在打开书…',
        deleteBook: '删除',
        confirmDelete: '删除这本书和它的全部对话？',
        fontSmaller: '缩小字号',
        fontBigger: '放大字号',
        noBook: '先在左上角导入一本书',
        retry: '重试',
        imported: '已导入',
        duplicate: '这本书已经在书架上了',
        toc: '目录',
        sessionCreated: '已开了一个新的共读会话',
        resizeHint: '拖动调整对话宽度（双击恢复默认，方向键微调）',
        clear: '清空',
        clearTitle: '清空面板里的对话，下一个问题会开一个新的共读会话',
        clearConfirm: '清空这个面板里的对话？侧栏里的会话记录不会被删除。',
        cleared: '对话已清空',
        quoteLead: '我想就这段聊聊。',
        sessionFailed: '没能发到会话，已改用直接回答',
        answerInChat: '回答在主对话里。',
        openChat: '打开对话',
        close: '关闭',
      },
      en: {
        panel: 'Shared reading',
        subtitle: 'Highlight, then ask',
        shelf: 'Shelf',
        allBooks: 'All',
        booksUnit: 'books',
        continueReading: 'Continue reading',
        import: 'Add book',
        importing: 'Importing…',
        emptyTitle: 'Your shelf is empty',
        emptyBody: 'Import an EPUB / TXT / Markdown / HTML file, then highlight a passage and ask the agent about it. Books and conversations stay on this machine.',
        emptyAction: 'Choose a book',
        formats: 'EPUB (text), TXT, Markdown and HTML are supported. PDF and AZW3 are refused with a reason.',
        chapter: 'chapter',
        prev: 'Previous',
        next: 'Next',
        quoteHint: 'Selected',
        quoteClear: 'Clear',
        quoteAsk: 'Ask about this',
        chatTitle: 'About this passage',
        chatEmpty: 'Highlight a passage on the left, or just ask something about this chapter.',
        chatPlaceholder: 'What are you wondering? Enter to send, Shift+Enter for a new line',
        send: 'Send',
        stop: 'Stop',
        thinking: '…',
        loading: 'Opening…',
        deleteBook: 'Delete',
        confirmDelete: 'Delete this book and all of its conversation?',
        fontSmaller: 'Smaller text',
        fontBigger: 'Larger text',
        noBook: 'Import a book first',
        retry: 'Retry',
        imported: 'Imported',
        duplicate: 'Already on your shelf',
        toc: 'Contents',
        sessionCreated: 'Started a new reading session',
        resizeHint: 'Drag to resize the panel (double-click to reset, arrow keys to nudge)',
        clear: 'Clear',
        clearTitle: 'Clear this panel; the next question starts a new reading session',
        clearConfirm: 'Clear this panel conversation? The session itself stays in the sidebar.',
        cleared: 'Conversation cleared',
        quoteLead: "Let's talk about this passage.",

        sessionFailed: 'Could not reach the session; answered directly instead',
        answerInChat: 'The answer is in the main conversation.',
        openChat: 'Open chat',
        close: 'Dismiss',
      },
    }

    function activeLocale(ctx) {
      try {
        return String(ctx.get('locale')?.getLocale?.().active ?? 'zh')
      } catch {
        return 'zh'
      }
    }

    function isChinese(ctx) {
      return activeLocale(ctx).toLowerCase().startsWith('zh')
    }

    function useStrings(ctx) {
      const [locale, setLocale] = useState(() => activeLocale(ctx))
      useEffect(() => {
        let localeService
        try {
          localeService = ctx.get('locale')
        } catch {
          return undefined
        }
        if (!localeService?.subscribe) return undefined
        return localeService.subscribe(() => setLocale(activeLocale(ctx)))
      }, [])
      return String(locale).toLowerCase().startsWith('zh') ? STRINGS.zh : STRINGS.en
    }

    function readChatWidth() {
      try {
        const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY))
        if (Number.isFinite(saved) && saved >= CHAT_MIN && saved <= CHAT_MAX) return saved
      } catch {
        // Fall through to the default.
      }
      return CHAT_DEFAULT
    }

    function readFontSize() {
      try {
        const saved = Number(window.localStorage.getItem(FONT_KEY))
        if (Number.isFinite(saved) && saved >= 14 && saved <= 24) return saved
      } catch {
        // Private mode, storage disabled: fall through to the default.
      }
      return 17
    }

    function IconChevron(props) {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { transform: props?.back ? 'rotate(180deg)' : undefined },
          'aria-hidden': true,
        },
        h('path', { d: 'M9 6l6 6-6 6' }),
      )
    }

    const COVER_PALETTE = [
      ['#2f4858', '#33658a'],
      ['#6d3b2f', '#a8603f'],
      ['#3c4a3a', '#6b7f5e'],
      ['#463a5c', '#7d5ba6'],
      ['#5a3a3a', '#8f5f4f'],
      ['#2b3a4a', '#4f6d7a'],
      ['#5b4a2f', '#96793f'],
    ]

    function coverBackground(title) {
      const text = String(title ?? '')
      let hash = 0
      for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0
      const pair = COVER_PALETTE[hash % COVER_PALETTE.length]
      return `linear-gradient(160deg, ${pair[0]}, ${pair[1]})`
    }

    function coverUrl(bookIdValue) {
      return `${PREFIX}/book/${encodeURIComponent(bookIdValue)}/cover`
    }

    const INLINE_PATTERN =
      /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>()]+)/g

    function pushText(nodes, text, keyBase) {
      const parts = String(text).split('\n')
      parts.forEach((part, index) => {
        if (index > 0) nodes.push(h('br', { key: `${keyBase}-br${index}` }))
        if (part) nodes.push(part)
      })
    }

    function renderInline(text, keyBase) {
      const nodes = []
      // A fresh regex per call: link labels recurse into this function, and a
      // shared lastIndex would restart the outer scan (infinite loop).
      const pattern = new RegExp(INLINE_PATTERN.source, 'g')
      let last = 0
      let index = 0
      let match = pattern.exec(text)
      while (match !== null) {
        if (match.index > last) pushText(nodes, text.slice(last, match.index), `${keyBase}-t${index}`)
        const token = match[0]
        const key = `${keyBase}-i${index}`
        index += 1
        if (token.startsWith('**')) {
          nodes.push(h('strong', { key }, token.slice(2, -2)))
        } else if (token.startsWith('*')) {
          nodes.push(h('em', { key }, token.slice(1, -1)))
        } else if (token.startsWith('`')) {
          nodes.push(h('code', { key }, token.slice(1, -1)))
        } else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
          if (link) {
            nodes.push(
              h(
                'a',
                { key, href: link[2], target: '_blank', rel: 'noreferrer' },
                renderInline(link[1], `${key}-ln`),
              ),
            )
          } else {
            nodes.push(token)
          }
        } else if (/^https?:/.test(token)) {
          nodes.push(
            h('a', { key, href: token, target: '_blank', rel: 'noreferrer' }, token),
          )
        } else {
          nodes.push(token)
        }
        last = match.index + token.length
        match = pattern.exec(text)
      }
      if (last < text.length) pushText(nodes, text.slice(last), `${keyBase}-end`)
      return nodes
    }

    const BLOCK_START = /^(?:#{1,4}\s|```|>|[-*+]\s|\d+[.)]\s)/
    const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/

    /** A deliberately small Markdown subset: enough for chat answers. */
    function renderMarkdown(text) {
      const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0
      let key = 0

      while (index < lines.length) {
        const line = lines[index]
        const trimmed = line.trim()
        if (!trimmed) {
          index += 1
          continue
        }

        if (/^```/.test(trimmed)) {
          const body = []
          index += 1
          while (index < lines.length && !/^```/.test(lines[index].trim())) {
            body.push(lines[index])
            index += 1
          }
          index += 1
          blocks.push(h('pre', { key: `b${key++}` }, h('code', null, body.join('\n'))))
          continue
        }

        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
        if (heading) {
          const level = Math.min(4, heading[1].length) + 2
          blocks.push(h(`h${level}`, { key: `b${key++}` }, renderInline(heading[2], `b${key}`)))
          index += 1
          continue
        }

        if (RULE.test(trimmed)) {
          blocks.push(h('hr', { key: `b${key++}` }))
          index += 1
          continue
        }

        if (trimmed.startsWith('>')) {
          const body = []
          while (index < lines.length && lines[index].trim().startsWith('>')) {
            body.push(lines[index].trim().replace(/^>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: `b${key++}` }, renderInline(body.join('\n'), `b${key}`)))
          continue
        }

        const ordered = /^\d+[.)]\s+/.test(trimmed)
        if (ordered || /^[-*+]\s+/.test(trimmed)) {
          const items = []
          while (index < lines.length) {
            const current = lines[index].trim()
            const match = ordered ? /^\d+[.)]\s+(.*)$/.exec(current) : /^[-*+]\s+(.*)$/.exec(current)
            if (!match) break
            items.push(h('li', { key: `li${index}` }, renderInline(match[1], `li${index}`)))
            index += 1
          }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: `b${key++}` }, items))
          continue
        }

        const paragraph = []
        while (index < lines.length) {
          const current = lines[index]
          const currentTrimmed = current.trim()
          if (!currentTrimmed || BLOCK_START.test(currentTrimmed) || RULE.test(currentTrimmed)) break
          paragraph.push(currentTrimmed)
          index += 1
        }
        if (paragraph.length === 0) {
          index += 1
          continue
        }
        blocks.push(h('p', { key: `b${key++}` }, renderInline(paragraph.join('\n'), `p${key}`)))
      }
      return blocks
    }

    function clipText(text, limit) {
      const value = String(text ?? '')
      return value.length > limit ? `${value.slice(0, limit)}…` : value
    }

    async function requestJson(path, options) {
      const response = await fetch(PREFIX + path, options)
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error ?? `请求失败（${response.status}）`)
      }
      return payload
    }

    /* ------------------------------------------------------------ pieces --- */

    function IconBook(props) {
      const size = props?.size ?? 18
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'block' },
          'aria-hidden': true,
        },
        h('path', { d: 'M4 5.2c0-.7.5-1.2 1.2-1.2H11v15.6H5.2A1.2 1.2 0 0 1 4 18.4z' }),
        h('path', { d: 'M11 4h5.8c.7 0 1.2.5 1.2 1.2v13.2c0 .7-.5 1.2-1.2 1.2H11z' }),
        h('path', { d: 'M7 7.4h1.6M7 10.2h1.6M13.6 7.4h2.6M13.6 10.2h2.6', strokeWidth: 1.5 }),
      )
    }

    function IconArrow(props) {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { transform: props?.back ? 'rotate(180deg)' : undefined },
          'aria-hidden': true,
        },
        h('path', { d: 'M5 12h13M13 6l6 6-6 6' }),
      )
    }

    function IconPlus() {
      return h(
        'svg',
        {
          width: 13,
          height: 13,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M12 5v14M5 12h14' }),
      )
    }

    /* --------------------------------------------------------------- page --- */

    function createPage(ctx) {
      return function SharedReadingPage() {
        const t = useStrings(ctx)
        const [snapshot, setSnapshot] = useState(null)
        const [chapter, setChapter] = useState(null)
        const [messages, setMessages] = useState([])
        const [quote, setQuote] = useState(null)
        const [draft, setDraft] = useState('')
        const [streaming, setStreaming] = useState('')
        const [busy, setBusy] = useState(false)
        const [error, setError] = useState('')
        const [notice, setNotice] = useState('')
        const [fontSize, setFontSize] = useState(readFontSize)
        const [view, setView] = useState('reader')
        const [page, setPage] = useState(0)
        const [pageCount, setPageCount] = useState(1)
        const [pageWidth, setPageWidth] = useState(0)
        const [chatWidth, setChatWidth] = useState(readChatWidth)
        const [resizing, setResizing] = useState(false)

        const fileInput = useRef(null)
        const pageInnerRef = useRef(null)
        const pageTrackRef = useRef(null)
        const pendingPageRef = useRef(null)
        const listRef = useRef(null)
        const abortRef = useRef(null)
        const bookIdRef = useRef(null)
        const turningRef = useRef(false)
        const sessionCancelRef = useRef(null)
        const pageStackRef = useRef(null)
        const bodyRef = useRef(null)

        const book = snapshot?.book ?? null
        const bookId = snapshot?.activeBookId ?? null
        bookIdRef.current = bookId

        useEffect(() => {
          try {
            window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatWidth))
          } catch {
            // Storage is optional; the in-memory width still applies.
          }
        }, [chatWidth])

        useEffect(() => {
          let cancelled = false
          requestJson('/state')
            .then((data) => {
              if (!cancelled) setSnapshot(data)
            })
            .catch((cause) => {
              if (!cancelled) setError(String(cause?.message ?? cause))
            })
          return () => {
            cancelled = true
          }
        }, [])

        // One book is open at a time: load its chapter and its conversation.
        useEffect(() => {
          if (!bookId) {
            setChapter(null)
            setMessages([])
            return undefined
          }
          let cancelled = false
          const index = snapshot?.book?.progress?.chapterIndex ?? 0
          Promise.all([
            requestJson(`/book/${encodeURIComponent(bookId)}/chat`),
            requestJson(`/book/${encodeURIComponent(bookId)}/chapter/${index}`),
          ])
            .then(([chat, opened]) => {
              if (cancelled) return
              setMessages(Array.isArray(chat?.messages) ? chat.messages : [])
              pendingPageRef.current = snapshot?.book?.progress?.pageFraction ?? 'first'
              setChapter(opened?.chapter ?? null)
            })
            .catch((cause) => {
              if (!cancelled) setError(String(cause?.message ?? cause))
            })
          return () => {
            cancelled = true
          }
          // `bookId` is the identity; the snapshot's progress only seeds the first open.
        }, [bookId])

        // Reading progress: chapter + page fraction, written after the turn settles.
        useEffect(() => {
          if (!bookId || !chapter || !pageWidth) return undefined
          const timer = window.setTimeout(() => {
            requestJson('/progress', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                bookId,
                chapterIndex: chapter.index,
                pageFraction: pageCount > 0 ? Math.min(1, (page + 1) / pageCount) : 1,
              }),
            })
              .then((data) => {
                const saved = data?.progress
                if (!saved) return
                // The shelf reads this snapshot, so the percentage has to follow
                // the saved position — including when the reader goes back.
                setSnapshot((current) => {
                  if (!current) return current
                  const updated = (current.books ?? []).map((item) =>
                    item.id === bookId
                      ? { ...item, percent: saved.percent, chapterIndex: saved.chapterIndex, maxChapterIndex: saved.maxChapterIndex }
                      : item,
                  )
                  // The book being read moves to the front of the shelf.
                  const active = updated.find((item) => item.id === bookId)
                  return {
                    ...current,
                    books: active ? [active, ...updated.filter((item) => item.id !== bookId)] : updated,
                  }
                })
              })
              .catch(() => {})
          }, 450)
          return () => window.clearTimeout(timer)
        }, [bookId, chapter?.index, page, pageCount, pageWidth])

        useEffect(() => {
          const list = listRef.current
          if (list) list.scrollTop = list.scrollHeight
        }, [messages, streaming])

        useEffect(() => {
          if (!notice) return undefined
          const timer = window.setTimeout(() => setNotice(''), 6000)
          return () => window.clearTimeout(timer)
        }, [notice])

        function applySnapshot(data) {
          setSnapshot(data)
        }

        function clampChatWidth(value) {
          const body = bodyRef.current
          const available = body ? body.clientWidth - 340 : CHAT_MAX
          const upper = Math.max(CHAT_MIN, Math.min(CHAT_MAX, available))
          return Math.min(upper, Math.max(CHAT_MIN, value))
        }

        function startResize(event) {
          if (event.button !== undefined && event.button !== 0) return
          event.preventDefault()
          const startX = event.clientX
          const startWidth = chatWidth
          setResizing(true)
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
          const onMove = (moveEvent) => {
            setChatWidth(clampChatWidth(startWidth - (moveEvent.clientX - startX)))
          }
          const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            setResizing(false)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }

        function onSplitterKey(event) {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const step = event.key === 'ArrowLeft' ? 24 : -24
          setChatWidth(clampChatWidth(chatWidth + step))
        }

        function openShelf() {
          setView('shelf')
        }

        async function reloadState() {
          const data = await requestJson('/state')
          applySnapshot(data)
          return data
        }

        async function openChapter(index, target = 'first') {
          if (!bookId || turningRef.current) return
          turningRef.current = true
          setError('')
          pendingPageRef.current = target
          try {
            const data = await requestJson(`/book/${encodeURIComponent(bookId)}/chapter/${index}`)
            setChapter(data.chapter)
            setQuote(null)
            await reloadState()
          } catch (cause) {
            setError(String(cause?.message ?? cause))
          } finally {
            turningRef.current = false
          }
        }

        async function chooseBook(id) {
          if (!id) return
          setError('')
          setQuote(null)
          setView('reader')
          if (id === bookId) return
          try {
            const data = await requestJson('/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookId: id }) })
            applySnapshot(data)
          } catch (cause) {
            setError(String(cause?.message ?? cause))
          }
        }

        async function importFile(file) {
          if (!file) return
          setError('')
          setNotice(t.importing)
          try {
            const response = await fetch(`${PREFIX}/import`, {
              method: 'POST',
              headers: { 'x-file-name': encodeURIComponent(file.name) },
              body: file,
            })
            const data = await response.json()
            if (!response.ok || data?.ok === false) throw new Error(data?.error ?? `请求失败（${response.status}）`)
            applySnapshot(data.state)
            setView('reader')
            setNotice(
              data.duplicate
                ? `${t.duplicate} ·《${data.meta.title}》`
                : `${t.imported}《${data.meta.title}》· ${data.meta.chapterCount} ${t.chapter}`,
            )
          } catch (cause) {
            setNotice('')
            setError(String(cause?.message ?? cause))
          } finally {
            if (fileInput.current) fileInput.current.value = ''
          }
        }

        async function removeBook(id) {
          if (!id) return
          if (!window.confirm(t.confirmDelete)) return
          try {
            const data = await requestJson(`/book/${encodeURIComponent(id)}`, { method: 'DELETE' })
            applySnapshot(data)
            setNotice('')
            if (!data.activeBookId) setView('shelf')
          } catch (cause) {
            setError(String(cause?.message ?? cause))
          }
        }

        function captureSelection() {
          const selection = window.getSelection()
          const text = String(selection ?? '').trim()
          if (text.length < 2 || text.length > 2000) return
          const chapterIndex = chapter?.index ?? 0
          setQuote({ text, chapterIndex })
          if (bookId) {
            fetch(`${PREFIX}/selection`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ bookId, chapterIndex, quote: text }),
            }).catch(() => {})
          }
        }

        function changeFont(delta) {
          // Keep the reading position across reflow: remember which fraction of
          // the chapter the current page represents, then re-apply it.
          pendingPageRef.current = pageCount > 1 ? page / (pageCount - 1) : 0
          const next = Math.min(24, Math.max(14, fontSize + delta))
          setFontSize(next)
          try {
            window.localStorage.setItem(FONT_KEY, String(next))
          } catch {
            // Keep the in-memory size even when storage refuses.
          }
        }

        /**
         * The message that lands in the conversation should read like something
         * the reader would type: the question first, the highlighted passage as a
         * blockquote, and a one-line pointer to where it came from. The agent
         * already has the reading context and the reading_* tools, so no
         * instructions are injected here.
         */
        function buildSessionText({ book: current, chapter: currentChapter, total: totalChapters, quote: quoted, question }) {
          const where = `《${current.title}》第 ${currentChapter.index + 1}${totalChapters ? ` / ${totalChapters}` : ''} 章${currentChapter.title ? `「${currentChapter.title}」` : ''}`
          const parts = []
          if (question) parts.push(question)
          else if (quoted) parts.push(t.quoteLead)
          if (quoted) {
            parts.push(
              quoted
                .split('\n')
                .map((line) => (line.trim() ? `> ${line.trimEnd()}` : '>'))
                .join('\n'),
            )
          }
          parts.push(`—— ${where}`)
          return parts.join('\n\n')
        }

        /**
         * Ask the real agent: post the passage + question into the book's own
         * session and mirror the stream back. The panel is root-scoped and has
         * no session of its own, so the dedicated session is created on demand.
         */
        function sessionKey(bookIdValue) {
          return `shared-reading:session:${bookIdValue}`
        }

        function storedSession(bookIdValue) {
          try {
            return window.localStorage.getItem(sessionKey(bookIdValue))
          } catch {
            return null
          }
        }

        function rememberSession(bookIdValue, sessionIdValue) {
          try {
            if (sessionIdValue) window.localStorage.setItem(sessionKey(bookIdValue), sessionIdValue)
            else window.localStorage.removeItem(sessionKey(bookIdValue))
          } catch {
            // Without storage the session is simply created again next time.
          }
        }

        /** One dedicated read-through session per book, created on first use. */
        async function ensureReadingSession(bookIdValue) {
          const existing = storedSession(bookIdValue)
          if (existing) return { id: existing, created: false }
          const data = await requestJson('/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          if (!data?.sessionId) throw new Error('新建会话没有返回 id')
          rememberSession(bookIdValue, data.sessionId)
          return { id: data.sessionId, created: true }
        }

        async function askInSession(sessionId, text, onDelta) {
          const sessions = ctx.get('sessions')
          if (!sessions?.retain) throw new Error('这个页面没有会话服务')
          const reference = sessions.retain(sessionId, {
            source: 'gateway',
            signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined,
          })
          try {
            const binding = await reference.ready
            const session = binding.session
            const source = binding.eventSource
            const seen = new Set()
            let answer = ''
            let baseline = 0
            try {
              const entries = source?.getSnapshot?.()?.entries ?? []
              for (const entry of entries) {
                const seq = entry?.event?.seq
                if (typeof seq === 'number' && seq > baseline) baseline = seq
              }
            } catch {
              baseline = 0
            }
            const collect = () => {
              let changed = false
              try {
                const entries = source?.getSnapshot?.()?.entries ?? []
                const start = Math.max(0, entries.length - 80)
                for (let index = start; index < entries.length; index += 1) {
                  const entry = entries[index]
                  if (entry?.type !== 'transient') continue
                  const event = entry.event
                  if (event?.type !== 'assistant/live-chunk') continue
                  const seq = event.seq
                  if (typeof seq === 'number' && seq <= baseline) continue
                  const chunk = event.data?.chunk
                  if (chunk?.type !== 'text-delta' || typeof chunk.text !== 'string' || !chunk.text) continue
                  const key = `${event.data?.attemptId ?? ''}:${seq ?? index}`
                  if (seen.has(key)) continue
                  seen.add(key)
                  answer += chunk.text
                  changed = true
                }
              } catch {
                // A window closed mid-read keeps whatever already arrived.
              }
              if (changed) onDelta?.(answer)
            }
            const unsubscribe = source?.subscribe?.(collect)
            sessionCancelRef.current = () => {
              try {
                session.cancel?.()
              } catch {
                // Cancelling is best-effort.
              }
            }
            try {
              const accepted = await session.prompt([{ type: 'text', text }], 'queue')
              if (accepted && accepted.ok === false) {
                throw new Error(accepted.error?.message ?? '会话没有接受这条消息')
              }
              const startedAt = Date.now()
              await new Promise((resolve) => {
                let started = false
                const timer = window.setInterval(() => {
                  let running = false
                  try {
                    running = session.getSnapshot?.()?.running === true
                  } catch {
                    running = false
                  }
                  if (running) started = true
                  const waited = Date.now() - startedAt
                  if (started && !running) {
                    window.clearInterval(timer)
                    resolve()
                  } else if (!started && waited > 20000) {
                    window.clearInterval(timer)
                    resolve()
                  } else if (waited > 300000) {
                    window.clearInterval(timer)
                    resolve()
                  }
                }, 400)
              })
              collect()
            } finally {
              sessionCancelRef.current = null
              unsubscribe?.()
            }
            return answer
          } finally {
            reference.release?.()
          }
        }

        async function persistTurn(turn) {
          const post = (body) =>
            requestJson(`/book/${encodeURIComponent(bookId)}/message`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }).catch(() => {})
          await post({ role: 'user', text: turn.question, quote: turn.quote || null, chapterIndex: turn.chapterIndex })
          await post({ role: 'assistant', text: turn.answer, quote: turn.quote || null, chapterIndex: turn.chapterIndex })
        }

        async function clearChat() {
          if (!bookId) return
          if (messages.length > 0 && !window.confirm(t.clearConfirm)) return
          try {
            await requestJson(`/book/${encodeURIComponent(bookId)}/chat`, { method: 'DELETE' })
            setMessages([])
            setQuote(null)
            rememberSession(bookId, null)
            setNotice(t.cleared)
          } catch (cause) {
            setError(String(cause?.message ?? cause))
          }
        }

        async function send() {
          if (!bookId || !chapter || busy) return
          const question = draft.trim()
          const quoted = quote?.text ?? ''
          if (!question && !quoted) return

          const asked = question || t.quoteAsk
          setMessages((previous) => [
            ...previous,
            { role: 'user', text: asked, quote: quoted || null, chapterIndex: chapter.index },
          ])
          setDraft('')
          setQuote(null)
          setError('')
          setBusy(true)
          setStreaming('')

          try {
            const { id, created } = await ensureReadingSession(bookId)
            if (created) setNotice(t.sessionCreated)
            const text = buildSessionText({ book, chapter, total, quote: quoted, question })
            const answer = await askInSession(id, text, (partial) => setStreaming(partial))
            const trimmed = answer.trim()
            const reply = trimmed || t.answerInChat
            setMessages((previous) => [
              ...previous,
              {
                role: 'assistant',
                text: reply,
                chapterIndex: chapter.index,
                sessionId: trimmed ? null : id,
              },
            ])
            void persistTurn({ question: asked, answer: reply, quote: quoted, chapterIndex: chapter.index })
          } catch (cause) {
            // The question never reached a session: give it back to the reader.
            rememberSession(bookId, null)
            setMessages((previous) => previous.slice(0, -1))
            setDraft(question)
            if (quoted) setQuote({ text: quoted, chapterIndex: chapter.index })
            setError(`${t.sessionFailed}：${String(cause?.message ?? cause)}`)
          } finally {
            setBusy(false)
            setStreaming('')
          }
        }

        function stop() {
          abortRef.current?.abort()
          sessionCancelRef.current?.()
        }

        function openChat(sessionId) {
          try {
            ctx.get('layout')?.selectPanel('conversation')
            ctx.get('uiWorkspace')?.openSession(sessionId)
          } catch {
            // Navigation is best-effort.
          }
        }

        function onComposerKey(event) {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
            event.preventDefault()
            void send()
          }
        }

        const total = chapter?.count ?? book?.chapterCount ?? 0
        const progressIndex = chapter?.index ?? 0
        const paragraphs = chapter ? chapter.text.split(/\n+/).filter((line) => line.trim().length > 0) : []
        const chapterChars = book?.toc?.find((entry) => entry.index === progressIndex)?.chars ?? 0
        const charsBefore = (book?.toc ?? [])
          .filter((entry) => entry.index < progressIndex)
          .reduce((totalChars, entry) => totalChars + (entry.chars ?? 0), 0)
        const pageFraction = pageCount > 0 ? (page + 1) / pageCount : 1
        const bookPercent = book?.chars
          ? Math.round(((charsBefore + chapterChars * pageFraction) / book.chars) * 1000) / 10
          : 0

        // The reading surface is paginated, not scrolled: the column width is the
        // viewport width, so every page is exactly one screen and the position is
        // expressible as a fraction of the chapter.
        useEffect(() => {
          if (view !== 'reader') return undefined
          const inner = pageInnerRef.current
          if (!inner) return undefined
          let frame = 0
          const read = () => {
            const width = inner.clientWidth
            if (width > 0) setPageWidth((current) => (current === width ? current : width))
          }
          const observer = new ResizeObserver(() => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(read)
          })
          observer.observe(inner)
          read()
          return () => {
            observer.disconnect()
            window.cancelAnimationFrame(frame)
          }
        }, [view, chapter?.index])

        useEffect(() => {
          if (view !== 'reader' || !pageWidth) return undefined
          const track = pageTrackRef.current
          if (!track) return undefined
          let frame = 0
          const measure = () => {
            const total = track.scrollWidth
            const count = Math.max(1, Math.round((total + COLUMN_GAP) / (pageWidth + COLUMN_GAP)))
            setPageCount(count)
            const pending = pendingPageRef.current
            if (pending !== null) {
              pendingPageRef.current = null
              const target =
                pending === 'last'
                  ? count - 1
                  : pending === 'first'
                    ? 0
                    : Math.round((count - 1) * Math.max(0, Math.min(1, Number(pending) || 0)))
              setPage(Math.max(0, Math.min(target, count - 1)))
            } else {
              setPage((current) => Math.min(current, count - 1))
            }
          }
          const schedule = () => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(measure)
          }
          schedule()
          if (document.fonts?.ready) document.fonts.ready.then(schedule).catch(() => {})
          return () => window.cancelAnimationFrame(frame)
        }, [view, pageWidth, chapter?.index, fontSize])

        function turnPage(delta) {
          if (!chapter) return
          const next = page + delta
          if (next < 0) {
            if (progressIndex > 0) void openChapter(progressIndex - 1, 'last')
            return
          }
          if (next >= pageCount) {
            if (total > 0 && progressIndex < total - 1) void openChapter(progressIndex + 1, 'first')
            return
          }
          // A page is a discrete surface: swap it, then fade the new page in.
          // Sliding a strip made the seam between two pages read as one long
          // canvas being dragged, which looked abrupt.
          setPage(next)
          const stack = pageStackRef.current
          if (stack?.animate) {
            stack.animate(
              [{ opacity: 0.35 }, { opacity: 1 }],
              { duration: 150, easing: 'ease-out' },
            )
          }
        }

        // Arrow keys turn pages; at the edges they carry over to the next chapter.
        // Composer and selects keep their own keys; modifiers stay with the browser.
        useEffect(() => {
          if (view !== 'reader' || !book || !chapter) return undefined
          function onKey(event) {
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const target = event.target
            const tag = target?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable) return
            if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
              event.preventDefault()
              turnPage(-1)
            } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
              event.preventDefault()
              turnPage(1)
            }
          }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [view, page, pageCount, chapter?.index, total, book?.id])

        if (!snapshot && !error) {
          return h(
            'div',
            { className: 'sr-root' },
            h('style', null, CSS),
            h('div', { className: 'sr-loading' }, t.loading),
          )
        }

        const header = h(
          'div',
          { className: 'sr-head' },
          h('span', { className: 'sr-brand' }, h(IconBook, { size: 16 }), h('span', { className: 'sr-title' }, t.panel)),
          h('span', { className: 'sr-spacer' }),
          book && view === 'reader'
            ? h(
                'button',
                { className: 'sr-btn', onClick: () => changeFont(-1), title: t.fontSmaller, 'aria-label': t.fontSmaller },
                'A−',
              )
            : null,
          book && view === 'reader'
            ? h(
                'button',
                { className: 'sr-btn', onClick: () => changeFont(1), title: t.fontBigger, 'aria-label': t.fontBigger },
                'A+',
              )
            : null,
          h(
            'button',
            { className: 'sr-btn sr-btn-accent', onClick: () => fileInput.current?.click() },
            h(IconPlus, null),
            t.import,
          ),
          h('input', {
            ref: fileInput,
            type: 'file',
            accept: '.epub,.txt,.md,.markdown,.html,.htm,.xhtml,application/epub+zip,text/plain,text/markdown,text/html',
            style: { display: 'none' },
            onChange: (event) => void importFile(event.target.files?.[0]),
          }),
        )

        const toast = error
          ? h(
              'div',
              { className: 'sr-toast sr-toast-error', role: 'alert' },
              h('span', null, error),
              h('button', { className: 'sr-toast-close', onClick: () => setError(''), 'aria-label': t.close }, '✕'),
            )
          : notice
            ? h('div', { className: 'sr-toast', role: 'status' }, notice)
            : null

        if (!book) {
          return h(
            'div',
            { className: 'sr-root' },
            h('style', null, CSS),
            header,
            toast,
            h(
              'div',
              { className: 'sr-empty' },
              h(
                'div',
                { className: 'sr-empty-card' },
                h('div', { className: 'sr-empty-icon' }, h(IconBook, { size: 30 })),
                h('div', { className: 'sr-empty-title' }, t.emptyTitle),
                h('p', { className: 'sr-empty-body' }, t.emptyBody),
                h(
                  'button',
                  { className: 'sr-btn sr-btn-primary', onClick: () => fileInput.current?.click() },
                  t.emptyAction,
                ),
                h('p', { className: 'sr-empty-hint' }, t.formats),
              ),
            ),
          )
        }

        const shelf = h(
          'div',
          { className: 'sr-shelf' },
          h(
            'div',
            { className: 'sr-shelf-head' },
            h(
              'div',
              null,
              h('div', { className: 'sr-shelf-title' }, t.allBooks),
              h('div', { className: 'sr-shelf-sub' }, `${snapshot?.books?.length ?? 0} ${t.booksUnit}`),
            ),
            book
              ? h(
                  'button',
                  { className: 'sr-btn sr-btn-primary', onClick: () => setView('reader') },
                  `${t.continueReading}《${clipText(book.title, 14)}》`,
                )
              : null,
          ),
          h(
            'div',
            { className: 'sr-grid' },
            (snapshot?.books ?? []).map((item) =>
              h(
                'div',
                {
                  key: item.id,
                  className: `sr-card${item.id === bookId ? ' is-current' : ''}`,
                  role: 'button',
                  tabIndex: 0,
                  title: item.title,
                  onClick: () => void chooseBook(item.id),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void chooseBook(item.id)
                    }
                  },
                },
                h(
                  'div',
                  { className: 'sr-cover-wrap' },
                  item.cover
                    ? h('img', { className: 'sr-cover-img', src: coverUrl(item.id), alt: item.title, loading: 'lazy' })
                    : h(
                        'div',
                        { className: 'sr-cover-made', style: { background: coverBackground(item.title) } },
                        h('span', { className: 'sr-cover-title' }, item.title),
                        item.author ? h('span', { className: 'sr-cover-author' }, item.author) : null,
                      ),
                  h(
                    'button',
                    {
                      className: 'sr-card-del',
                      title: t.deleteBook,
                      'aria-label': t.deleteBook,
                      onClick: (event) => {
                        event.stopPropagation()
                        void removeBook(item.id)
                      },
                    },
                    '✕',
                  ),
                ),
                h('div', { className: 'sr-card-title' }, item.title),
                h(
                  'div',
                  { className: 'sr-card-meta' },
                  h('span', null, `${item.percent ?? 0}%`),
                  h('span', null, `${item.chapterCount} ${t.chapter}`),
                ),
                h(
                  'div',
                  { className: 'sr-progress' },
                  h('i', { style: { width: `${Math.max(item.percent ?? 0, 1.5)}%` } }),
                ),
              ),
            ),
          ),
        )

        function renderSheet(index) {
          const offset = -index * (pageWidth + COLUMN_GAP)
          return h(
            'div',
            { key: 'sheet', className: 'sr-sheet' },
            h(
              'div',
              {
                className: 'sr-page-track',
                ref: pageTrackRef,
                style: {
                  columnWidth: pageWidth > 0 ? `${pageWidth}px` : undefined,
                  columnGap: `${COLUMN_GAP}px`,
                  transform: `translateX(${offset}px)`,
                },
              },
              h(
                'article',
                {
                  className: 'sr-article',
                  style: { fontSize: `${fontSize}px` },
                  onMouseUp: captureSelection,
                  onTouchEnd: captureSelection,
                },
                h('h1', { className: 'sr-chapter-title' }, chapter?.title ?? ''),
                paragraphs.map((paragraph, paragraphIndex) => h('p', { key: paragraphIndex }, paragraph)),
              ),
            ),
          )
        }

        const reader = h(
          'div',
          { className: 'sr-reader' },
          h(
            'div',
            { className: 'sr-reader-bar' },
            h(
              'div',
              { className: 'sr-reader-bar-in' },
              h(
                'button',
                { className: 'sr-iconbtn', onClick: () => setView('shelf'), title: t.shelf },
                h(IconChevron, { back: true }),
                h('span', null, t.shelf),
              ),
              h(
                'div',
                { className: 'sr-chapter-nav' },
                h(
                  'button',
                  {
                    className: 'sr-iconbtn',
                    disabled: progressIndex <= 0,
                    title: `${t.prev} · ← / PageUp`,
                    onClick: () => turnPage(-1),
                  },
                  h(IconChevron, { back: true }),
                ),
                h(
                  'select',
                  {
                    className: 'sr-chapter-select',
                    value: progressIndex,
                    onChange: (event) => void openChapter(Number(event.target.value)),
                    title: t.toc,
                  },
                  (book.toc ?? []).map((entry) =>
                    h('option', { key: entry.index, value: entry.index }, `${entry.index + 1}. ${entry.title}`),
                  ),
                ),
                h(
                  'button',
                  {
                    className: 'sr-iconbtn',
                    disabled: total > 0 && progressIndex >= total - 1,
                    title: `${t.next} · → / PageDown`,
                    onClick: () => turnPage(1),
                  },
                  h(IconChevron, null),
                ),
              ),
              h(
                'span',
                { className: 'sr-reader-progress', title: `${bookPercent.toFixed(1)}%` },
                `${page + 1} / ${pageCount} · ${bookPercent.toFixed(1)}%`,
              ),
            ),
          ),
          h(
            'div',
            { className: 'sr-page' },
            h(
              'div',
              { className: 'sr-page-inner', ref: pageInnerRef },
              h('div', { className: 'sr-page-stack', ref: pageStackRef }, renderSheet(page)),
            ),
          ),
        )

        const chat = h(
          'aside',
          { className: 'sr-chat', style: { width: `${chatWidth}px` } },
          h(
            'div',
            { className: 'sr-chat-head' },
            h('span', null, t.chatTitle),
            h(
              'div',
              { className: 'sr-chat-actions' },
              snapshot?.route?.model
                ? h(
                    'span',
                    { className: 'sr-model', title: `${snapshot.route.provider} · ${snapshot.route.model}` },
                    snapshot.route.model,
                  )
                : null,
              h('button', { className: 'sr-chip sr-clear', onClick: () => void clearChat(), title: t.clearTitle }, t.clear),
            ),
          ),
          h(
            'div',
            { className: 'sr-msgs', ref: listRef },
            messages.length === 0 && !streaming
              ? h('p', { className: 'sr-chat-empty' }, t.chatEmpty)
              : messages.map((message, index) =>
                  h(
                    'div',
                    { key: index, className: `sr-msg sr-msg-${message.role}` },
                    message.quote
                      ? h('div', { className: 'sr-quote' }, clipText(message.quote, 240))
                      : null,
                    h(
                      'div',
                      { className: message.role === 'assistant' ? 'sr-bubble sr-md' : 'sr-bubble' },
                      message.role === 'assistant' ? renderMarkdown(message.text) : message.text,
                    ),
                    message.sources?.length > 0
                      ? h(
                          'div',
                          { className: 'sr-sources' },
                          message.sources.map((source, index) =>
                            h(
                              'a',
                              {
                                key: index,
                                className: 'sr-source',
                                href: source.url,
                                target: '_blank',
                                rel: 'noreferrer',
                                title: source.url,
                              },
                              source.title || source.url,
                            ),
                          ),
                        )
                      : null,
                    message.sessionId
                      ? h(
                          'button',
                          { className: 'sr-jump', onClick: () => openChat(message.sessionId) },
                          t.openChat,
                        )
                      : null,
                  ),
                ),
            streaming
              ? h(
                  'div',
                  { className: 'sr-msg sr-msg-assistant' },
                  h('div', { className: 'sr-bubble sr-bubble-live sr-md' }, renderMarkdown(streaming)),
                )
              : null,
            busy && !streaming
              ? h('div', { className: 'sr-msg sr-msg-assistant' }, h('div', { className: 'sr-bubble sr-bubble-wait' }, t.thinking))
              : null,
          ),
          h(
            'div',
            { className: 'sr-composer' },
            quote
              ? h(
                  'div',
                  { className: 'sr-quote-bar' },
                  h('div', { className: 'sr-quote-text' }, clipText(quote.text, 160)),
                  h('button', { className: 'sr-btn sr-btn-quiet', onClick: () => setQuote(null) }, t.quoteClear),
                )
              : null,
            h('textarea', {
              className: 'sr-textarea',
              value: draft,
              placeholder: t.chatPlaceholder,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: onComposerKey,
              rows: 3,
            }),
            h(
              'div',
              { className: 'sr-composer-row' },
              busy
                ? h('button', { className: 'sr-btn', onClick: stop }, t.stop)
                : h(
                    'button',
                    {
                      className: 'sr-btn sr-btn-primary',
                      disabled: !draft.trim() && !quote,
                      onClick: () => void send(),
                    },
                    t.send,
                  ),
            ),
          ),
        )

        return h(
          'div',
          { className: 'sr-root' },
          h('style', null, CSS),
          header,
          toast,
          view === 'shelf'
            ? shelf
            : h(
                'div',
                { className: 'sr-body', ref: bodyRef },
                reader,
                h('div', {
                  className: `sr-splitter${resizing ? ' is-dragging' : ''}`,
                  role: 'separator',
                  'aria-orientation': 'vertical',
                  'aria-label': t.resizeHint,
                  tabIndex: 0,
                  title: t.resizeHint,
                  onPointerDown: startResize,
                  onDoubleClick: () => setChatWidth(CHAT_DEFAULT),
                  onKeyDown: onSplitterKey,
                }),
                chat,
              ),
        )
      }
    }

    function createIcon(ctx) {
      return function ShelfIcon(props) {
        const size = props?.size ?? 18
        // The row aligns its cell; an inline-flex box would sit on the text
        // baseline and look a couple of pixels high. A square, middle-aligned
        // box keeps the glyph on the same optical line as the label.
        return h(
          'span',
          {
            className: `sr-icon${props?.active ? ' is-active' : ''}`,
            title: STRINGS[isChinese(ctx) ? 'zh' : 'en'].panel,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              lineHeight: 0,
              verticalAlign: 'middle',
              flex: 'none',
            },
          },
          h(IconBook, { size }),
        )
      }
    }

    const CSS = `
.sr-root { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size: 14px; line-height: 1.6; overflow: hidden; -webkit-font-smoothing: antialiased; }

/* ---- top bar ---------------------------------------------------------- */
.sr-head { flex: none; display: flex; align-items: center; gap: 6px; height: 46px;
  padding: 0 14px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); }
.sr-brand { display: inline-flex; align-items: center; gap: 7px; font-size: 13px;
  font-weight: 600; letter-spacing: .01em; }
.sr-title { font-size: 13px; font-weight: 600; }
.sr-spacer { flex: 1 1 auto; }
.sr-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.sr-head .sr-btn { border-color: transparent; color: var(--dsw-alias-label-secondary);
  padding: 5px 9px; border-radius: 8px; }
.sr-head .sr-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

/* ---- buttons ---------------------------------------------------------- */
.sr-btn { appearance: none; display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-primary); border-radius: 9px; padding: 4px 10px;
  font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.sr-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.sr-btn:disabled { opacity: .4; cursor: default; }
.sr-btn-primary { background: var(--dsw-alias-brand-primary); border-color: transparent;
  color: var(--dsw-alias-bg-base); }
.sr-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.07); }
.sr-btn-accent { border-color: transparent; background: var(--dsw-alias-bg-layer-2); }
.sr-btn-quiet { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.sr-iconbtn { appearance: none; display: inline-flex; align-items: center; justify-content: center;
  gap: 1px; min-width: 28px; height: 28px; padding: 0 6px; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px;
  cursor: pointer; }
.sr-iconbtn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sr-iconbtn:disabled { opacity: .3; cursor: default; }

/* ---- toast ------------------------------------------------------------ */
.sr-toast { position: absolute; z-index: 60; top: 54px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px; max-width: min(560px, 82%);
  padding: 7px 13px; border-radius: 10px; font-size: 12px; line-height: 1.5;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 8px 24px rgba(0,0,0,.18); }
.sr-toast-error { color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary); }
.sr-toast-close { border: 0; background: transparent; color: inherit; font: inherit;
  cursor: pointer; padding: 0 2px; line-height: 1; }

/* ---- shelf ------------------------------------------------------------ */
.sr-shelf { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 28px 32px 52px; }
.sr-shelf-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px;
  max-width: 1080px; margin: 0 auto 24px; }
.sr-shelf-title { font-size: 26px; font-weight: 700; letter-spacing: -.015em; line-height: 1.2; }
.sr-shelf-sub { margin-top: 5px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sr-grid { display: grid; gap: 28px 22px; max-width: 1080px; margin: 0 auto;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
.sr-card { position: relative; display: flex; flex-direction: column; gap: 9px;
  background: transparent; border: 0; padding: 0; text-align: left; cursor: pointer; }
.sr-cover-wrap { position: relative; aspect-ratio: 2 / 3; border-radius: 6px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 1px 2px rgba(0,0,0,.22), 0 7px 18px rgba(0,0,0,.16);
  transition: transform .18s ease, box-shadow .18s ease; }
.sr-card:hover .sr-cover-wrap { transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0,0,0,.24), 0 14px 30px rgba(0,0,0,.24); }
.sr-card:focus-visible { outline: none; }
.sr-card:focus-visible .sr-cover-wrap { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.sr-card.is-current .sr-cover-wrap { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.sr-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sr-cover-made { width: 100%; height: 100%; box-sizing: border-box; display: flex;
  flex-direction: column; justify-content: flex-end; gap: 7px; padding: 15px 13px;
  color: #f6f2ea; }
.sr-cover-title { font-size: 14px; font-weight: 600; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  text-shadow: 0 1px 2px rgba(0,0,0,.28); }
.sr-cover-author { font-size: 10px; opacity: .82; }
.sr-card-title { font-size: 12.5px; font-weight: 500; line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-card-meta { display: flex; justify-content: space-between; gap: 8px;
  font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.sr-progress { height: 2px; border-radius: 1px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.sr-progress > i { display: block; height: 100%; background: var(--dsw-alias-label-secondary); }
.sr-card-del { position: absolute; top: 7px; right: 7px; width: 24px; height: 24px;
  border: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); color: #fff; font: inherit; font-size: 11px; cursor: pointer;
  opacity: 0; transition: opacity .15s ease; backdrop-filter: blur(6px); }
.sr-card:hover .sr-card-del, .sr-card:focus-within .sr-card-del { opacity: 1; }
.sr-card-del:hover { background: rgba(0,0,0,.78); }

/* ---- reader ----------------------------------------------------------- */
.sr-body { flex: 1 1 auto; min-height: 0; display: flex; }
.sr-reader { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.sr-reader-bar { flex: none; display: flex; align-items: center; height: 42px; padding: 0 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); }
.sr-reader-bar-in { display: flex; align-items: center; gap: 4px; width: 100%;
  max-width: 680px; margin: 0 auto; }
.sr-chapter-nav { flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  gap: 2px; min-width: 0; }
.sr-chapter-select { min-width: 0; max-width: 460px; appearance: none; border: 0;
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
  text-align: center; text-overflow: ellipsis; padding: 4px 8px; border-radius: 7px; cursor: pointer; }
.sr-chapter-select:hover { background: var(--dsw-alias-bg-layer-2); }
.sr-reader-progress { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums; padding-right: 4px; }
.sr-page { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 34px 40px 24px; }
.sr-page-inner { height: 100%; max-width: 680px; margin: 0 auto; }
.sr-page-stack { position: relative; height: 100%; }
.sr-sheet { position: absolute; inset: 0; overflow: hidden; background: var(--dsw-alias-bg-base); }
.sr-page-track { height: 100%; column-fill: auto; }
.sr-article { line-height: 1.96; letter-spacing: .012em;
  font-family: "New York", "Iowan Old Style", "Songti SC", "Noto Serif CJK SC",
    "Source Han Serif SC", Georgia, serif; }
.sr-chapter-title { font-size: 1.24em; font-weight: 600; line-height: 1.5; margin: 0 0 1.5em;
  letter-spacing: .01em; }
.sr-article p { margin: 0 0 .92em; text-indent: 2em; }
.sr-article::selection, .sr-article *::selection {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); }

/* ---- chat ------------------------------------------------------------- */
.sr-chat { flex: none; min-width: 300px; max-width: calc(100% - 320px); min-height: 0;
  display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.sr-splitter { flex: 0 0 6px; align-self: stretch; cursor: col-resize; position: relative;
  background: transparent; touch-action: none; }
.sr-splitter::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2.5px; width: 1px;
  background: var(--dsw-alias-border-l1); transition: background .12s ease, width .12s ease; }
.sr-splitter:hover::after, .sr-splitter:focus-visible::after, .sr-splitter.is-dragging::after {
  background: var(--dsw-alias-border-l2); width: 2px; left: 2px; }
.sr-splitter:focus-visible { outline: none; }
.sr-chat-head { flex: none; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; height: 42px; padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12px; font-weight: 600;
  color: var(--dsw-alias-label-secondary); }
.sr-chat-actions { display: flex; align-items: center; gap: 6px; }
.sr-model { font-size: 11px; color: var(--dsw-alias-label-secondary); max-width: 104px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-chip { appearance: none; display: inline-flex; align-items: center; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: var(--dsw-alias-label-secondary); padding: 1px 9px; font: inherit; font-size: 11px;
  line-height: 1.6; cursor: pointer; }
.sr-chip:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.sr-clear { border-color: transparent; }
.sr-clear:hover { background: var(--dsw-alias-bg-layer-2); }
.sr-msgs { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px; }
.sr-chat-empty { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.75; margin: 10px 4px; }
.sr-msg { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; align-items: flex-start; }
.sr-msg-user { align-items: flex-end; }
.sr-bubble { max-width: 100%; padding: 9px 12px; border-radius: 14px; font-size: 13px;
  line-height: 1.72; white-space: pre-wrap; word-break: break-word;
  background: var(--dsw-alias-bg-layer-2); }
.sr-msg-user .sr-bubble { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, var(--dsw-alias-bg-layer-2));
  border-bottom-right-radius: 5px; }
.sr-msg-assistant .sr-bubble { border-bottom-left-radius: 5px; }
.sr-md { white-space: normal; }
.sr-md p { margin: 0 0 .6em; }
.sr-md p:last-child { margin-bottom: 0; }
.sr-md strong { font-weight: 650; }
.sr-md em { font-style: italic; }
.sr-md code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px; padding: 0 4px; }
.sr-md pre { margin: 0 0 .6em; padding: 8px 10px; border-radius: 8px; overflow-x: auto;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l1); }
.sr-md pre code { border: 0; padding: 0; background: transparent; font-size: 12px; }
.sr-md a { color: var(--dsw-alias-brand-primary); text-decoration: underline; text-underline-offset: 2px;
  word-break: break-all; }
.sr-md ul, .sr-md ol { margin: 0 0 .6em; padding-left: 1.25em; }
.sr-md li { margin: .15em 0; }
.sr-md blockquote { margin: 0 0 .6em; padding-left: 9px; border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); }
.sr-md h3, .sr-md h4, .sr-md h5, .sr-md h6 { font-size: 13.5px; font-weight: 650; margin: .2em 0 .45em; }
.sr-md hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: .7em 0; }
.sr-bubble-live::after { content: '▍'; margin-left: 2px; opacity: .6; animation: sr-blink 1s steps(2) infinite; }
.sr-bubble-wait { color: var(--dsw-alias-label-secondary); }
@keyframes sr-blink { 50% { opacity: 0; } }
.sr-quote { font-size: 12px; line-height: 1.65; color: var(--dsw-alias-label-secondary);
  border-left: 2px solid var(--dsw-alias-brand-primary); padding-left: 9px; white-space: pre-wrap;
  max-height: 98px; overflow: hidden; }
.sr-sources { display: flex; flex-direction: column; gap: 2px; max-width: 100%; }
.sr-source { font-size: 11px; color: var(--dsw-alias-label-secondary); text-decoration: underline;
  text-underline-offset: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-source:hover { color: var(--dsw-alias-label-primary); }
.sr-jump { align-self: flex-start; appearance: none; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 7px;
  padding: 1px 9px; font: inherit; font-size: 11px; cursor: pointer; }
.sr-jump:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.sr-composer { flex: none; padding: 10px 12px 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.sr-quote-bar { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;
  padding: 6px 9px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.sr-quote-text { flex: 1 1 auto; font-size: 12px; color: var(--dsw-alias-label-secondary);
  max-height: 72px; overflow: hidden; white-space: pre-wrap; }
.sr-textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 62px; max-height: 180px;
  padding: 9px 11px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); color: inherit; font: inherit; font-size: 13px; line-height: 1.65; }
.sr-textarea:focus { outline: none; border-color: var(--dsw-alias-border-l2); }
.sr-composer-row { display: flex; align-items: center; justify-content: flex-end;
  gap: 8px; margin-top: 8px; }

/* ---- sidebar icon ------------------------------------------------------ */
.sr-icon { display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-secondary); flex: none; }
.sr-icon.is-active { color: var(--dsw-alias-label-primary); }

/* ---- empty / loading --------------------------------------------------- */
.sr-loading { flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--dsw-alias-label-secondary); }
.sr-empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; padding: 32px; }
.sr-empty-card { width: 100%; max-width: 420px; text-align: center; padding: 34px 28px; }
.sr-empty-icon { display: flex; justify-content: center; color: var(--dsw-alias-label-secondary);
  margin-bottom: 14px; }
.sr-empty-title { font-size: 19px; font-weight: 650; margin-bottom: 10px; }
.sr-empty-body { font-size: 13px; color: var(--dsw-alias-label-secondary); margin: 0 0 20px; line-height: 1.75; }
.sr-empty-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); margin: 16px 0 0; line-height: 1.7; }

@media (max-width: 1080px) {
  .sr-splitter { flex-basis: 5px; }
  .sr-page { padding: 26px 22px 18px; }
  .sr-shelf { padding: 22px 20px 44px; }
}
`

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'shared-reading',
              order: 30,
              label: () => STRINGS[isChinese(ctx) ? 'zh' : 'en'].panel,
            },
            createIcon(ctx),
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'shared-reading' }, createPage(ctx)),
        )
      },
    }
  },
})
