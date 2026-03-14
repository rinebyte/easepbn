// src/services/crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { env } from '../config/env'

// Derive a 32-byte key from the ENCRYPTION_KEY env value using SHA-256
function deriveKey(): Buffer {
  return createHash('sha256').update(env.ENCRYPTION_KEY).digest()
}

export class CryptoService {
  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded)
   */
  static encrypt(text: string): string {
    const key = deriveKey()
    const iv = randomBytes(12) // 96-bit IV recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
  }

  /**
   * Decrypts a string encrypted by CryptoService.encrypt.
   * Expects format: iv:authTag:ciphertext (all hex-encoded)
   */
  static decrypt(encrypted: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')

    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error('Invalid encrypted data format')
    }

    const key = deriveKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const ciphertext = Buffer.from(ciphertextHex, 'hex')

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  }
}
