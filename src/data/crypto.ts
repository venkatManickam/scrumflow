/**
 * Passphrase encryption for shared workspaces published on a public static host.
 * PBKDF2-SHA256 (600k iterations) → AES-256-GCM. Works in browsers and Node (globalThis.crypto).
 * The same format is produced by tools/encrypt-workspace.mjs.
 */
export interface EncryptedWorkspace {
  v: 1
  id: string
  name: string
  description?: string
  updatedAt: string
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number }
  salt: string
  iv: string
  ct: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptWorkspace(plain: unknown, passphrase: string, meta: { id: string; name: string; description?: string }, iterations = 600_000): Promise<EncryptedWorkspace> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, iterations)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(JSON.stringify(plain))))
  return { v: 1, id: meta.id, name: meta.name, description: meta.description, updatedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations }, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase')
    this.name = 'WrongPassphraseError'
  }
}

export async function decryptWorkspace<T = unknown>(file: EncryptedWorkspace, passphrase: string): Promise<T> {
  if (file.v !== 1) throw new Error('Unsupported shared-workspace version')
  const key = await deriveKey(passphrase, fromB64(file.salt), file.kdf.iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) as BufferSource }, key, fromB64(file.ct) as BufferSource)
    return JSON.parse(dec.decode(plain)) as T
  } catch {
    throw new WrongPassphraseError()
  }
}
