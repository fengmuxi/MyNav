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
  try {
    console.log('[Crypto] 正在获取 RSA 公钥...');
    const { data } = await api.get<{ publicKey: string }>('/auth/public-key');
    if (!data?.publicKey) {
      throw new Error('公钥为空');
    }
    publicKeyCache = data.publicKey;
    console.log('[Crypto] RSA 公钥获取成功，长度:', data.publicKey.length);
    return publicKeyCache;
  } catch (err) {
    console.error('[Crypto] 获取 RSA 公钥失败:', err);
    throw new Error('无法获取加密密钥，请检查网络连接或联系管理员');
  }
}

/** 将 PEM 公钥转为 Web Crypto API 可用的 CryptoKey */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  if (cryptoKeyCache) return cryptoKeyCache;

  try {
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
    console.log('[Crypto] 公钥导入成功');
    return cryptoKeyCache;
  } catch (err) {
    console.error('[Crypto] 公钥导入失败:', err);
    throw new Error('公钥格式无效，请联系管理员');
  }
}

/**
 * 加密明文密码，返回 base64 编码的密文
 * - 后端使用 RSA-OAEP + SHA-256 解密，与此对应
 */
export async function encryptPassword(plainText: string): Promise<string> {
  try {
    const pem = await fetchPublicKey();
    const key = await importPublicKey(pem);
    const data = new TextEncoder().encode(plainText);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      data,
    );

    const bytes = new Uint8Array(encrypted);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    console.log('[Crypto] 密码加密成功');
    return btoa(binary);
  } catch (err) {
    console.error('[Crypto] 密码加密失败:', err);
    throw err;
  }
}

/** 清除公钥缓存（密钥重生成后需调用） */
export function clearPublicKeyCache(): void {
  publicKeyCache = null;
  cryptoKeyCache = null;
}
