/**
 * 共读 — Host half.
 *
 * The bundle turns a book into: plain chapters on disk, one progress number per
 * book, a chat log that never leaves this machine, four model tools, and one
 * prefix route for the panel. The Client half renders the shelf; this half owns
 * every bit of state and every model call.
 */

import { bookContextLine, READING_RULES } from './host/guidance.js'
import { Library } from './host/library.js'
import { registerRoutes } from './host/routes.js'
import { Store } from './host/store.js'
import { registerTools } from './host/tools.js'

export const name = 'dsh-shared-reading'

/** `webServer` stays optional: without it the tools still work headless. */
export const inject = ['tools', 'systemPrompt']

/**
 * @param {any} ctx
 * @param {{ dataDir?: string, chatModel?: string, chatProvider?: string, maxTokens?: number }} [config]
 */
export function apply(ctx, config = {}) {
  const store = new Store({ root: config.dataDir })
  const library = new Library(store)
  const state = {
    activeBookId: /** @type {string | null} */ (null),
    lastSelection: /** @type {any} */ (null),
    contextLine: '',
  }

  const statePath = store.path('state.json')
  ctx.logger?.info?.(`shared-reading: data at ${store.root}`)

  async function persistActiveBook(bookId) {
    await store.writeJson(statePath, { activeBookId: bookId, updatedAt: new Date().toISOString() })
  }

  /** Cache the per-turn context line; the prompt section is synchronous. */
  async function refreshContext() {
    const bookId = state.activeBookId
    const meta = bookId ? await library.meta(bookId) : null
    if (!meta) {
      state.contextLine = ''
      return
    }
    const progress = await library.progress(bookId)
    state.contextLine = bookContextLine({ book: meta, progress, selection: state.lastSelection })
  }

  void (async () => {
    await store.ensure()
    const persisted = await store.readJson(statePath, null)
    if (persisted && typeof persisted.activeBookId === 'string') state.activeBookId = persisted.activeBookId
    await refreshContext()
  })().catch((error) => ctx.logger?.warn?.(`shared-reading: init failed: ${error?.message ?? error}`))

  const tools = registerTools({ ctx, library, state })
  ctx.effect(() => () => tools.dispose())

  // The conversation agent gets a short pointer to the shelf, not the book.
  ctx.inject(['systemPrompt'], (prompted) => {
    const service = prompted.get('systemPrompt')
    service.section({
      name: 'shared-reading',
      order: 78,
      text: () => (state.contextLine ? `${READING_RULES}\n\n${state.contextLine}` : ''),
    })
  })

  // The panel's own channel.
  ctx.inject(['webServer'], (webCtx) => {
    const routes = registerRoutes({
      ctx: webCtx,
      library,
      config,
      state,
      persistActiveBook,
      refreshContext,
    })
    webCtx.effect(() => () => routes.dispose())
  })
}
