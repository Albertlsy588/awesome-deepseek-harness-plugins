import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { upsertGitHubUser } from '@dsh-1024store/core/auth'
import { renderCommunityShell } from '../worker/share-metadata'
import { communityDatabase, sqliteD1 } from './fixtures'

const NOW = Date.parse('2026-08-17T08:00:00Z')
const ORIGIN = 'https://deepseek1024.com'

const SHELL = `<!doctype html>
<html><head>
<!--seo-head-->
<title>fallback</title>
</head><body><div id="root"></div>SENTINEL-DOCUMENT-TAIL</body></html>`

function workerEnv(database: DatabaseSync): Env {
  return { CATALOG_DB: sqliteD1(database), COMMUNITY_ADMIN_LOGINS: '' } as unknown as Env
}

async function seedPost(database: DatabaseSync, body: string): Promise<number> {
  const db = sqliteD1(database)
  const user = await upsertGitHubUser(
    db, { id: 1, login: 'octocat', name: null, avatarUrl: null }, new Date(NOW).toISOString())
  await db.prepare('INSERT INTO community_posts (author_id, body, created_at) VALUES (?, ?, ?)')
    .bind(user.id, body, new Date(NOW).toISOString()).run()
  const row = await db.prepare('SELECT last_insert_rowid() AS id').first<{ id: number }>()
  return Number(row!.id)
}

/** What the site Worker serves for a community URL: the shell plus its metadata. */
async function fetchPage(database: DatabaseSync, path: string): Promise<string> {
  const shell = new Response(SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  const rendered = await renderCommunityShell(shell, new URL(`${ORIGIN}${path}`), workerEnv(database))
  return rendered.text()
}

describe('share metadata', () => {
  it('treats post text as data, not as a replacement pattern', async () => {
    // `$'` in a String.replace *replacement* means "everything after the match".
    // Post bodies end up in that replacement, so a literal substitution is the
    // only thing standing between a visitor and splicing the rest of the
    // document into its own <head>.
    const database = communityDatabase()
    const id = await seedPost(database, "pwned $' and $& and $` and $1")
    const html = await fetchPage(database, `/community/p/${id}`)

    // The invariant: the document tail appears exactly once, in the body, where
    // it belongs. With a string replacement each of the six title/description
    // slots splices a copy of it into the head instead.
    expect(html.split('SENTINEL-DOCUMENT-TAIL')).toHaveLength(2)
    expect(html.split('<div id="root">')).toHaveLength(2)
    // The dollar sequences survive as literal text. (summarise strips
    // backticks along with the rest of the Markdown punctuation.)
    expect(html).toContain("pwned $' and $&amp; and $ and $1")
    database.close()
  })

  it('lets no angle bracket or quote out of a title into the markup', async () => {
    const database = communityDatabase()
    const id = await seedPost(database, '</title><script>alert(1)</script> and a " quote')
    const html = await fetchPage(database, `/community/p/${id}`)

    // Nothing from the body can open a tag or close an attribute. summarise
    // strips `>` and `()` as Markdown punctuation before escapeHtml runs, so
    // the assertion is on the invariant rather than on an exact rendering.
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script')
    expect(html).toContain('&lt;/title')
    expect(html).toContain('&quot; quote')
    // One head, one title pair from us plus the fallback: no early close.
    expect(html.split('</head>')).toHaveLength(2)
    database.close()
  })

  it('puts the real title before the fallback so the first one wins', async () => {
    const database = communityDatabase()
    const id = await seedPost(database, 'a post worth sharing')
    const html = await fetchPage(database, `/community/p/${id}`)

    const generated = html.indexOf('<title>a post worth sharing')
    const fallback = html.indexOf('<title>fallback')
    expect(generated).toBeGreaterThan(-1)
    expect(generated).toBeLessThan(fallback)
    database.close()
  })

  it('does not leak a deleted post through its share card', async () => {
    const database = communityDatabase()
    const id = await seedPost(database, 'regrettable')
    sqliteD1(database) // keep the handle shape consistent
    database.prepare('UPDATE community_posts SET deleted_at = ? WHERE id = ?')
      .run(new Date(NOW).toISOString(), id)

    const html = await fetchPage(database, `/community/p/${id}`)
    expect(html).not.toContain('regrettable')
    database.close()
  })

  it('keeps profiles out of the index', async () => {
    const database = communityDatabase()
    const html = await fetchPage(database, '/community/u/octocat')
    expect(html).toContain('content="noindex,follow"')
    database.close()
  })
})
