/**
 * RSA 密码加密工具（前端）
 * ------------------------------------------------------------------
 * 使用浏览器原生 Web Crypto API 进行 RSA-OAEP + SHA-256 加密。
 * 公钥从后端 GET /api/auth/public-key 获取，缓存后复用。
 *
 * 降级机制：
 * - HTTPS / localhost：crypto.subtle 可用，使用 RSA-OAEP 加密（默认）
 * - HTTP 非安全上下文：crypto.subtle 为 undefined，
 *   回退为 base64 编码并添加 "B64:" 前缀，后端识别前缀后直接解码
 *   （HTTP 环境下传输本身已无加密，此降级仅为保持接口兼容）
 *
 * 安全上下文判定（isSecureContext）：
 * - HTTPS 或 localhost 时返回 true → 使用 RSA 加密流程
 * - HTTP 局域网/IP 时返回 false → 应使用 SRP-6a 安全握手流程
 *   （由 authStore / Register 根据 isSecureContext 自动选择）
 *
 * 用法：
 *   import { encryptPassword } from '../api/crypto';
 *   const encrypted = await encryptPassword(plainPassword);
 *   await api.post('/auth/login', { username, password: encrypted });
 */
import api from './axios';

/**
 * 判断当前是否为安全上下文（HTTPS / localhost）
 * - true: crypto.subtle 可用，使用 RSA 加密
 * - false: HTTP 非安全上下文，应使用 SRP-6a 握手（见 srp.ts）
 */
export function isSecureContext(): boolean {
  // window.isSecureContext 是浏览器原生 API（HTTPS/localhost 为 true）
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

let publicKeyCache: string | null = null;
let cryptoKeyCache: CryptoKey | null = null;

/** 检测 Web Crypto API 是否可用（仅安全上下文可用） */
function isSubtleAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

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
 * - 安全上下文：使用 RSA-OAEP + SHA-256 加密，返回纯 base64 密文
 * - 非安全上下文：回退为 base64 编码 + "B64:" 前缀，后端自动识别
 */
export async function encryptPassword(plainText: string): Promise<string> {
  // 降级：crypto.subtle 不可用（HTTP 非安全上下文）
  if (!isSubtleAvailable()) {
    console.warn('[Crypto] Web Crypto API 不可用（HTTP 环境），降级为 base64 编码');
    const encoded = btoa(unescape(encodeURIComponent(plainText)));
    return `B64:${encoded}`;
  }

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
