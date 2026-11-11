/**
 * Model access for the reading panel's own single-turn call.
 *
 * The panel talks to the same default route the conversation uses, but through
 * `ctx.llm.stream` directly: the reader's highlight and the chapter window are
 * assembled here and never enter (or pollute) the session log.
 */

/**
 * Read an optional service without declaring it as a hard dependency. A profile
 * without a model still imports, reads, and records — only the chat window says
 * so.
 */
export function optionalService(ctx, name) {
  const readers = [() => ctx.reflect?.get?.(name, false), () => ctx.get?.(name)]
  for (const read of readers) {
    try {
      const service = read()
      if (service) return service
    } catch {
      // Try the next accessor.
    }
  }
  return null
}

/** The route a panel call should use: config override, else the session default. */
export function resolveRoute(ctx, config = {}, preferred = null) {
  const selection = optionalService(ctx, 'agentDefaultModel')?.currentSelection?.()
  const fallback = selection?.provider && selection?.model ? selection : null
  const provider = config.chatProvider || preferred?.provider || fallback?.provider
  const model = config.chatModel || preferred?.model || fallback?.model
  if (!provider || !model) return null
  return { provider, model }
}
