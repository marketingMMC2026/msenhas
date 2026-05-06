const ENCRYPTION_PREFIX = 'enc:v1:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const getEncryptionKeyMaterial = () => {
  return import.meta.env.VITE_SECRET_ENCRYPTION_KEY || '';
};

export const isSecretEncryptionConfigured = () => {
  return getEncryptionKeyMaterial().length >= 16;
};

const bytesToBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (base64) => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const deriveKey = async (salt) => {
  const keyMaterial = getEncryptionKeyMaterial();
  if (!keyMaterial) return null;

  const importedKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyMaterial),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 150000,
      hash: 'SHA-256',
    },
    importedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptSecretText = async (plainText) => {
  if (!plainText) return plainText;
  if (!isSecretEncryptionConfigured()) return plainText;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );

  return ENCRYPTION_PREFIX + [
    bytesToBase64(salt),
    bytesToBase64(iv),
    bytesToBase64(new Uint8Array(encrypted)),
  ].join(':');
};

export const decryptSecretText = async (value) => {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value;

  if (!isSecretEncryptionConfigured()) {
    throw new Error('Chave de criptografia ausente. Configure VITE_SECRET_ENCRYPTION_KEY.');
  }

  const encodedPayload = value.slice(ENCRYPTION_PREFIX.length);
  const [saltBase64, ivBase64, encryptedBase64] = encodedPayload.split(':');

  if (!saltBase64 || !ivBase64 || !encryptedBase64) {
    throw new Error('Formato de segredo criptografado inválido.');
  }

  const key = await deriveKey(base64ToBytes(saltBase64));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(encryptedBase64)
  );

  return decoder.decode(decrypted);
};

export const isEncryptedSecret = (value) => {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
};
