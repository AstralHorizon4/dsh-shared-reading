/**
 * Local files for the reading desk.
 *
 * Everything lives under one data root as plain JSON / JSONL: no database, no
 * lock, no migration. Writes are atomic (tmp + rename) because a half-written
 * `sections.json` would make a whole book unreadable.
 */

import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** `<DSH_HOME>/shared-reading`, overridable by config. */
export function resolveRoot(custom) {
  if (typeof custom === 'string' && custom.length > 0) return custom
  const home = process.env.DSH_HOME
  return join(home && home.length > 0 ? home : join(homedir(), '.dsh'), 'shared-reading')
}

export class Store {
  constructor(options = {}) {
    this.root = resolveRoot(options.root)
  }

  path(...parts) {
    return join(this.root, ...parts)
  }

  bookPath(bookId, file) {
    return this.path('books', bookId, file)
  }

  chatPath(bookId) {
    return this.path('chat', `${bookId}.jsonl`)
  }

  progressPath(bookId) {
    return this.path('progress', `${bookId}.json`)
  }

  async ensure() {
    await mkdir(this.path('books'), { recursive: true })
    await mkdir(this.path('chat'), { recursive: true })
    await mkdir(this.path('progress'), { recursive: true })
  }

  async readJson(file, fallback = null) {
    try {
      return JSON.parse(await readFile(file, 'utf8'))
    } catch {
      return fallback
    }
  }

  async writeJson(file, value) {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(tmp, file)
  }

  async appendJsonl(file, value) {
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify(value)}\n`, 'utf8')
  }

  async readJsonl(file) {
    try {
      const text = await readFile(file, 'utf8')
      const rows = []
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          rows.push(JSON.parse(line))
        } catch {
          // A truncated final line after a crash must not hide the rest.
        }
      }
      return rows
    } catch {
      return []
    }
  }

  async bookIds() {
    try {
      const entries = await readdir(this.path('books'), { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch {
      return []
    }
  }
}
