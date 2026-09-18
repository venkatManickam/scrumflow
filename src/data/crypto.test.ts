import { describe, expect, it } from 'vitest'
import { decryptWorkspace, encryptWorkspace, WrongPassphraseError } from './crypto'

describe('shared workspace encryption', () => {
  const plain = { version: 1, items: [{ id: 'a', title: 'secret item' }], projects: [] }
  it('round-trips with the right passphrase and rejects the wrong one', async () => {
    const file = await encryptWorkspace(plain, 'correct horse battery staple', { id: 't', name: 'Test' }, 20_000)
    expect(file.ct).not.toContain('secret')
    expect(JSON.stringify(file)).not.toContain('secret item')
    expect(await decryptWorkspace(file, 'correct horse battery staple')).toEqual(plain)
    await expect(decryptWorkspace(file, 'wrong')).rejects.toBeInstanceOf(WrongPassphraseError)
  }, 20_000)
})
