/**
 * RSA 密码加密工具（前端）
 * ------------------------------------------------------------------
 * 使用浏览器原生 Web Crypto API 进行 RSA-OAEP + SHA-256 加密。
 * 公钥从后端 GET /api/auth/public-key 获取，缓存后复用。
 *
 * 用法：
 *   import { encryptPassword } from '../api/crypto';
 *   const encrypted = await encryptPassword(plainPassword);
 *   await api.post('/auth/login', { username, password: encrypted });
 */
import api from './axios';

let publicKeyCache: string | null = null;
let cryptoKeyCache: CryptoKey | null = null;

/** 从后端获取 RSA 公钥（PEM 格式），带缓存 */
async function fetchPublicKey(): Promise<string> {
  if (publicKeyCache) return publicKeyCache;
  const { data } = await api.get<{ publicKey: string }>('/auth/public-key');
  publicKeyCache = data.publicKey;
  return publicKeyCache;
}

/** 将 PEM 公钥转为 Web Crypto API 可用的 CryptoKey */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  if (cryptoKeyCache) return cryptoKeyCache;

  // 解析 PEM：去头尾标记 + base64 解码为 ArrayBuffer
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const binaryString = atob(base64);
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i);
  }

  cryptoKeyCache = await crypto.subtle.importKey(
    'spki',
    buffer.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  return cryptoKeyCache;
}

/**
 * 加密明文密码，返回 base64 编码的密文
 * - 后端使用 RSA-OAEP + SHA-256 解密，与此对应
 */
export async function encryptPassword(plainText: string): Promise<string> {
  const pem = await fetchPublicKey();
  const key = await importPublicKey(pem);
  const data = new TextEncoder().encode(plainText);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    data,
  );

  // ArrayBuffer → base64
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** 清除公钥缓存（密钥重生成后需调用） */
export function clearPublicKeyCache(): void {
  publicKeyCache = null;
  cryptoKeyCache = null;
}
