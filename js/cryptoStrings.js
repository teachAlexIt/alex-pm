// ===== helpers =====
const te = new TextEncoder();
const td = new TextDecoder();

function toBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function concatU8(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ===== core crypto =====
async function deriveAesKeyFromPassword(password, salt, iterations = 210_000) {
  // Импортируем "сырой" ключ из пароля
  const baseKey = await crypto.subtle.importKey(
    "raw",
    te.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Производим AES-256-GCM ключ
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Надёжное шифрование на клиенте (браузер):
 * AES-256-GCM + PBKDF2(SHA-256)
 *
 * @param {string} key - ключ/пароль (строка)
 * @param {string} text - строка для шифрования
 * @returns {Promise<string>} - зашифрованная строка
 */
export async function encryptString(key, text) {
  if (typeof key !== "string" || typeof text !== "string") {
    throw new TypeError("encryptString(key, text): оба аргумента должны быть строками");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16)); // соль для PBKDF2
  const iv = crypto.getRandomValues(new Uint8Array(12));   // IV для GCM (12 байт — стандарт)
  const aesKey = await deriveAesKeyFromPassword(key, salt);

  const plaintextBytes = te.encode(text);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintextBytes
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Упакуем в один бинарник: [ver(1)][salt(16)][iv(12)][ciphertext(...)]
  const version = new Uint8Array([1]);
  const packed = concatU8(version, salt, iv, ciphertext);

  // Вернём base64 строку
  return toBase64(packed);
}

/**
 * Расшифровка (для проверки/использования)
 * @param {string} key
 * @param {string} encryptedBase64
 * @returns {Promise<string>}
 */
export async function decryptString(key, encryptedBase64) {
  if (typeof key !== "string" || typeof encryptedBase64 !== "string") {
    throw new TypeError("decryptString(key, encrypted): оба аргумента должны быть строками");
  }

  const packed = fromBase64(encryptedBase64);

  const version = packed[0];
  if (version !== 1) throw new Error("Неподдерживаемая версия шифротекста");

  const salt = packed.slice(1, 1 + 16);
  const iv = packed.slice(1 + 16, 1 + 16 + 12);
  const ciphertext = packed.slice(1 + 16 + 12);

  const aesKey = await deriveAesKeyFromPassword(key, salt);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  return td.decode(plainBuffer);
}
