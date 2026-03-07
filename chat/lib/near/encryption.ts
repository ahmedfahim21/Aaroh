/**
 * Client-side encryption utilities for NEAR storage
 * Uses Web Crypto API with AES-GCM for authenticated encryption
 */

// Encryption configuration
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 iterations

// Storage keys
const ENCRYPTION_KEY_STORAGE = 'near_encryption_key';
const KEY_DERIVATION_SALT_STORAGE = 'near_key_salt';

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  ciphertext: string; // Base64
  iv: string; // Base64
  version: number;
}

/**
 * Generate a new encryption key from a password/seed
 */
export async function deriveKey(
  password: string,
  salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  if (typeof window === 'undefined') {
    throw new Error('Encryption only available in browser');
  }

  // Generate salt if not provided
  const keySalt = salt || crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive encryption key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: keySalt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  return { key, salt: keySalt };
}

/**
 * Derive encryption key from NEAR account ID
 * Uses account ID as password with stored salt
 */
export async function deriveKeyFromAccount(
  accountId: string
): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('Encryption only available in browser');
  }

  // Get or create salt
  let salt: Uint8Array;
  const storedSalt = localStorage.getItem(
    `${KEY_DERIVATION_SALT_STORAGE}_${accountId}`
  );

  if (storedSalt) {
    salt = base64ToUint8Array(storedSalt);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    localStorage.setItem(
      `${KEY_DERIVATION_SALT_STORAGE}_${accountId}`,
      uint8ArrayToBase64(salt)
    );
  }

  // Derive key from account ID
  const { key } = await deriveKey(accountId, salt);

  return key;
}

/**
 * Get or create encryption key for an account
 */
export async function getEncryptionKey(accountId: string): Promise<CryptoKey> {
  if (typeof window === 'undefined') {
    throw new Error('Encryption only available in browser');
  }

  // Try to get cached key
  const cachedKey = sessionStorage.getItem(
    `${ENCRYPTION_KEY_STORAGE}_${accountId}`
  );

  if (cachedKey) {
    try {
      const keyData = JSON.parse(cachedKey);
      return await crypto.subtle.importKey(
        'jwk',
        keyData,
        { name: ALGORITHM, length: KEY_LENGTH },
        true,
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.warn('Failed to import cached key:', error);
    }
  }

  // Derive new key
  const key = await deriveKeyFromAccount(accountId);

  // Cache in session storage
  try {
    const exportedKey = await crypto.subtle.exportKey('jwk', key);
    sessionStorage.setItem(
      `${ENCRYPTION_KEY_STORAGE}_${accountId}`,
      JSON.stringify(exportedKey)
    );
  } catch (error) {
    console.warn('Failed to cache key:', error);
  }

  return key;
}

/**
 * Encrypt data using AES-GCM
 */
export async function encrypt(
  data: string,
  accountId: string
): Promise<EncryptedData> {
  if (typeof window === 'undefined') {
    throw new Error('Encryption only available in browser');
  }

  // Get encryption key
  const key = await getEncryptionKey(accountId);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt data
  const encodedData = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
    },
    key,
    encodedData
  );

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    iv: uint8ArrayToBase64(iv),
    version: 1,
  };
}

/**
 * Decrypt data using AES-GCM
 */
export async function decrypt(
  encryptedData: EncryptedData,
  accountId: string
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Decryption only available in browser');
  }

  // Get encryption key
  const key = await getEncryptionKey(accountId);

  // Decrypt data
  const ciphertext = base64ToUint8Array(encryptedData.ciphertext);
  const iv = base64ToUint8Array(encryptedData.iv);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
      },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data. Key may be incorrect.');
  }
}

/**
 * Encrypt object to JSON string
 */
export async function encryptObject(
  obj: any,
  accountId: string
): Promise<EncryptedData> {
  const json = JSON.stringify(obj);
  return await encrypt(json, accountId);
}

/**
 * Decrypt JSON string to object
 */
export async function decryptObject<T = any>(
  encryptedData: EncryptedData,
  accountId: string
): Promise<T> {
  const json = await decrypt(encryptedData, accountId);
  return JSON.parse(json);
}

/**
 * Encrypt a string for storage (returns serialized EncryptedData)
 */
export async function encryptString(
  data: string,
  accountId: string
): Promise<string> {
  const encrypted = await encrypt(data, accountId);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt a stored string (parses serialized EncryptedData)
 */
export async function decryptString(
  encryptedString: string,
  accountId: string
): Promise<string> {
  const encrypted: EncryptedData = JSON.parse(encryptedString);
  return await decrypt(encrypted, accountId);
}

/**
 * Clear encryption keys from storage
 */
export function clearEncryptionKeys(accountId: string): void {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(`${ENCRYPTION_KEY_STORAGE}_${accountId}`);
  // Note: We keep the salt for key regeneration
}

/**
 * Clear all encryption data (including salt)
 */
export function clearAllEncryptionData(accountId: string): void {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(`${ENCRYPTION_KEY_STORAGE}_${accountId}`);
  localStorage.removeItem(`${KEY_DERIVATION_SALT_STORAGE}_${accountId}`);
}

/**
 * Export encryption key for backup
 */
export async function exportKey(accountId: string): Promise<string> {
  const key = await getEncryptionKey(accountId);
  const exported = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

/**
 * Import encryption key from backup
 */
export async function importKey(
  keyData: string,
  accountId: string
): Promise<void> {
  const jwk = JSON.parse(keyData);
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  // Cache in session storage
  sessionStorage.setItem(
    `${ENCRYPTION_KEY_STORAGE}_${accountId}`,
    keyData
  );
}

/**
 * Verify encryption works (test encrypt/decrypt)
 */
export async function verifyEncryption(accountId: string): Promise<boolean> {
  try {
    const testData = 'test_encryption_' + Date.now();
    const encrypted = await encrypt(testData, accountId);
    const decrypted = await decrypt(encrypted, accountId);
    return decrypted === testData;
  } catch (error) {
    console.error('Encryption verification failed:', error);
    return false;
  }
}

// ============= UTILITY FUNCTIONS =============

/**
 * Convert Uint8Array to Base64
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Hash data using SHA-256
 */
export async function hash(data: string): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('Hashing only available in browser');
  }

  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return uint8ArrayToBase64(new Uint8Array(hashBuffer));
}

/**
 * Generate random string (for IDs, nonces, etc.)
 */
export function generateRandomString(length: number = 32): string {
  if (typeof window === 'undefined') {
    throw new Error('Random generation only available in browser');
  }

  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return uint8ArrayToBase64(array);
}
