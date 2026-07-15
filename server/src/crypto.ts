/**
 * RSA 密钥对管理与密码解密
 * ------------------------------------------------------------------
 * 密钥对存储在 settings 表 key='rsa_keys'，value 为 JSON：
 *   { publicKeyPem, privateKeyPem, createdAt }
 *
 * - 服务启动时检查密钥对，不存在则自动生成
 * - 前端通过 GET /api/auth/public-key 获取公钥（PEM 格式）
 * - 后端用私钥解密前端 RSA 加密的密码字段
 * - 管理员可通过 PUT /api/admin/rsa/regenerate 重新生成密钥对
 */
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { settings as settingsTable } from './db/schema.js';

const RSA_KEYS_KEY = 'rsa_keys';

/** 密钥对存储结构 */
export interface RsaKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  createdAt: number;
}

/** RSA 密钥配置：2048 位，OAEP 填充 + SHA-256（与前端 Web Crypto API 兼容） */
const RSA_KEY_SIZE = 2048;
const RSA_PADDING = crypto.constants.RSA_PKCS1_OAEP_PADDING;

/** 生成新的 RSA 密钥对 */
function generateKeyPair(): RsaKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: RSA_KEY_SIZE,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    createdAt: Date.now(),
  };
}

/** 从数据库读取密钥对 */
function readKeyPair(): RsaKeyPair | null {
  const row = db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, RSA_KEYS_KEY))
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as RsaKeyPair;
  } catch {
    return null;
  }
}

/** 写入密钥对（upsert） */
function writeKeyPair(kp: RsaKeyPair): void {
  const json = JSON.stringify(kp);
  const existing = db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, RSA_KEYS_KEY))
    .get();
  if (existing) {
    db.update(settingsTable)
      .set({ value: json })
      .where(eq(settingsTable.key, RSA_KEYS_KEY))
      .run();
  } else {
    db.insert(settingsTable)
      .values({ key: RSA_KEYS_KEY, value: json })
      .run();
  }
}

/** 获取或自动生成密钥对 */
export function ensureKeyPair(): RsaKeyPair {
  let kp = readKeyPair();
  if (!kp) {
    console.log('[Crypto] 数据库中未找到 RSA 密钥对，正在生成...');
    kp = generateKeyPair();
    writeKeyPair(kp);
    console.log('[Crypto] RSA 密钥对已自动生成并保存到数据库');
  } else {
    console.log('[Crypto] 已从数据库加载 RSA 密钥对（创建于:', new Date(kp.createdAt).toISOString(), ')');
  }
  return kp;
}

/** 获取公钥 PEM（供前端加密使用） */
export function getPublicKeyPem(): string {
  return ensureKeyPair().publicKeyPem;
}

/** 获取密钥对公开信息（公钥 PEM + 创建时间，不暴露私钥） */
export function getKeyPairInfo(): { publicKeyPem: string; createdAt: number } {
  const kp = ensureKeyPair();
  return { publicKeyPem: kp.publicKeyPem, createdAt: kp.createdAt };
}

/** 使用私钥解密前端 RSA 加密的数据（如密码） */
export function rsaDecrypt(encryptedBase64: string): string {
  const kp = ensureKeyPair();
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    { key: kp.privateKeyPem, padding: RSA_PADDING, oaepHash: 'sha256' },
    buffer,
  );
  return decrypted.toString('utf8');
}

/** 重新生成密钥对（管理员操作） */
export function regenerateKeyPair(): RsaKeyPair {
  const kp = generateKeyPair();
  writeKeyPair(kp);
  console.log('[Crypto] RSA 密钥对已重新生成');
  return kp;
}

/* ============================== 数据备份加解密 ============================== */

/**
 * 数据备份使用 AES-256-GCM 对称加密（同一个密钥加解密）。
 * - 用户数据备份：密钥由用户 ID 派生（SHA-256，固定盐）
 * - 服务器数据备份：密钥由管理员自定义密码 + 随机盐 PBKDF2 派生（100k 迭代）
 *
 * AES-GCM 是 AEAD 算法，自带完整性校验（tag），密钥/数据被篡改则解密失败。
 */

const AES_ALGO = 'aes-256-gcm';
const AES_KEY_LEN = 32;        // 256 位
const AES_IV_LEN = 12;         // 96 位（GCM 推荐）
const PBKDF2_ITER = 100_000;   // PBKDF2 迭代次数
const PBKDF2_SALT_LEN = 16;    // PBKDF2 盐长度

/** AES-256-GCM 加密结果（全部字段为 base64 字符串，便于 JSON 序列化） */
export interface AesEncryptedPayload {
  /** 加密用的初始化向量 (12 字节, base64) */
  iv: string;
  /** GCM 认证标签 (16 字节, base64) */
  tag: string;
  /** 加密后的密文 (base64) */
  data: string;
}

/**
 * AES-256-GCM 加密
 * @param plain 待加密的明文 Buffer
 * @param key   32 字节密钥
 */
export function aesEncrypt(plain: Buffer, key: Buffer): AesEncryptedPayload {
  if (key.length !== AES_KEY_LEN) {
    throw new Error(`AES 密钥长度必须为 ${AES_KEY_LEN} 字节`);
  }
  const iv = crypto.randomBytes(AES_IV_LEN);
  const cipher = crypto.createCipheriv(AES_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

/**
 * AES-256-GCM 解密
 * @param payload 包含 iv/tag/data 的加密载荷
 * @param key     32 字节密钥（与加密时相同）
 * @throws 解密失败（密钥错误、数据篡改等）抛出 Error
 */
export function aesDecrypt(payload: AesEncryptedPayload, key: Buffer): Buffer {
  if (key.length !== AES_KEY_LEN) {
    throw new Error(`AES 密钥长度必须为 ${AES_KEY_LEN} 字节`);
  }
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv(AES_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * 从用户 ID 派生 AES-256 密钥
 * ------------------------------------------------------------------
 * 设计说明：用户 ID 在前端公开可见（jwt payload、Profile 页 ID 显示），
 * 因此此加密仅作为「防随意查阅」的轻量保护（文件被他人获取时无法直接读取）。
 * 真正的账号级安全仍依赖 JWT 鉴权与登录密码。
 *
 * 使用固定盐 + SHA-256 派生，保证同一用户多次备份/恢复使用相同密钥。
 */
const USER_KEY_SALT = 'mynav:v1:user-backup:key-derivation';
export function deriveUserBackupKey(userId: number): Buffer {
  return crypto
    .pbkdf2Sync(String(userId), USER_KEY_SALT, PBKDF2_ITER, AES_KEY_LEN, 'sha256');
}

/**
 * 生成 PBKDF2 随机盐（用于管理员备份，每次导出生成新盐）
 */
export function generatePbkdf2Salt(): Buffer {
  return crypto.randomBytes(PBKDF2_SALT_LEN);
}

/**
 * 用管理员自定义密码 + 随机盐派生 AES-256 密钥
 * @param password 管理员输入的自定义密码
 * @param salt     generatePbkdf2Salt() 生成的随机盐
 */
export function deriveAdminBackupKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITER, AES_KEY_LEN, 'sha256');
}
