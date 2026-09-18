#!/usr/bin/env node
/**
 * Encrypt a ScrumFlow backup so it can be published on the public GitHub Pages site and
 * unlocked by the team with a passphrase (Shared workspaces page, or #/shared/<id>).
 *
 *   node tools/encrypt-workspace.mjs <backup.json> --id tsat --name "TSAT webMethods" [--description "..."]
 *        --passphrase "..."   (or SCRUMFLOW_PASSPHRASE env var)
 *
 * Writes public/shared/<id>.enc.json and updates public/shared/index.json.
 * Same format as src/data/crypto.ts (PBKDF2-SHA256 600k → AES-256-GCM).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { webcrypto as crypto } from 'node:crypto'

const args = process.argv.slice(2)
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const opt = (n, d) => {
  const i = args.indexOf('--' + n)
  return i >= 0 ? args[i + 1] : d
}
const input = positional[0]
const id = opt('id')
const name = opt('name')
const description = opt('description', '')
const passphrase = opt('passphrase', process.env.SCRUMFLOW_PASSPHRASE)
if (!input || !id || !name || !passphrase) {
  console.error('usage: node tools/encrypt-workspace.mjs <backup.json> --id <id> --name "<name>" [--description "..."] --passphrase "<passphrase>"')
  process.exit(1)
}
if (!/^[a-z0-9-]{2,32}$/.test(id)) {
  console.error('id must be lowercase letters, digits and dashes')
  process.exit(1)
}
if (passphrase.length < 12) {
  console.error('passphrase must be at least 12 characters')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'shared')
fs.mkdirSync(outDir, { recursive: true })

const enc = new TextEncoder()
const toB64 = (bytes) => Buffer.from(bytes).toString('base64')
const iterations = 600_000
const snapshot = JSON.parse(fs.readFileSync(input, 'utf8'))
if (snapshot.version !== 1 || !Array.isArray(snapshot.items)) {
  console.error('input is not a ScrumFlow backup')
  process.exit(1)
}
const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(snapshot))))
const file = { v: 1, id, name, description, updatedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
const outFile = path.join(outDir, `${id}.enc.json`)
fs.writeFileSync(outFile, JSON.stringify(file))

const indexFile = path.join(outDir, 'index.json')
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { workspaces: [] }
const stats = {
  projects: snapshot.projects.length,
  items: snapshot.items.filter((i) => i.type !== 'epic').length,
  members: snapshot.members.length,
  sprints: snapshot.sprints.length,
}
const entry = { id, name, description, file: `${id}.enc.json`, updatedAt: file.updatedAt, stats }
index.workspaces = [...index.workspaces.filter((w) => w.id !== id), entry]
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')
console.log(`Encrypted ${path.basename(input)} → public/shared/${id}.enc.json (${(fs.statSync(outFile).size / 1024).toFixed(0)} kB)`)
console.log(`  ${stats.projects} projects, ${stats.items} items, ${stats.members} members, ${stats.sprints} sprints`)
console.log(`  share link: <site>/#/shared/${id}`)
