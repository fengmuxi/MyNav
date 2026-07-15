/**
 * SRP-6a 协议实现（服务端）
 * ------------------------------------------------------------------
 * RFC 5054 2048-bit group + SHA-256
 *
 * 用途：HTTP 非安全上下文下的密码认证。
 * - 密码永不离开客户端（仅传输 verifier 和握手参数）
 * - 抗中间人攻击：攻击者拦截通信无法推算出密码
 * - 抗离线字典攻击：服务器只存储 verifier（非密码等价物）
 *
 * 与 RSA 方案的关系：
 * - HTTPS（安全上下文）：使用 RSA 加密传输密码（现有方案）
 *   后端解密后顺便计算并存储 SRP verifier（自动升级，老用户兼容）
 * - HTTP（非安全上下文）：使用 SRP-6a 握手登录
 *
 * SRP-6a 握手流程：
 *   1. 客户端 → 服务端: { username, A }         → 返回 { salt, B }
 *   2. 客户端 → 服务端: { username, A, B, M1 }  → 验证后返回 { token, M2 }
 *
 * 数学约定（前后端必须完全一致）：
 *   N, g      : RFC 5054 2048-bit 素数与生成元
 *   k         : H(N | pad(g))                 乘数
 *   x         : H(salt | H(username ":" password))  私钥
 *   v         : g^x mod N                      验证器（存储在服务端）
 *   a, b      : 随机私有指数（不传输）
 *   A, B      : 公共临时值
 *   u         : H(pad(A) | pad(B))             混淆因子
 *   S_client  : (B - k·g^x)^(a + u·x) mod N
 *   S_server  : (A · v^u)^b mod N
 *   K         : H(S)                           会话密钥
 *   M1        : H(H(N)⊕H(g) | H(I) | salt | A | B | K)  客户端证明
 *   M2        : H(A | M1 | K)                  服务端证明
 */
import crypto from 'node:crypto';

/** RFC 5054 2048-bit group: 大素数 N（十六进制） */
const N_HEX =
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
  'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8' +
  '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B' +
  'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748' +
  '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6' +
  'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6' +
  '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73';

/** 大素数 N（BigInt） */
export const N = BigInt('0x' + N_HEX);
/** 生成元 g = 2 */
export const g = 2n;
/** N 的字节长度（256 字节 = 2048 位） */
export const N_BYTES = N_HEX.length / 2; // 256

/**
 * 模幂运算 base^exp mod m（快速幂）
 * BigInt 原生无 modPow，需手动实现；2048 位下性能可接受
 */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  base = ((base % m) + m) % m; // 确保非负
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    exp >>= 1n;
    base = (base * base) % m;
  }
  return result;
}

/**
 * SHA-256 哈希，返回 Buffer
 * 前后端数学等价：前端用纯 JS 实现，后端用 node:crypto
 */
function H(...parts: (Buffer | bigint | string)[]): Buffer {
  const hash = crypto.createHash('sha256');
  for (const p of parts) {
    if (Buffer.isBuffer(p)) hash.update(p);
    else if (typeof p === 'bigint') hash.update(padTo(p, N_BYTES));
    else hash.update(p, 'utf8');
  }
  return hash.digest();
}

/** SHA-256 返回 BigInt（用于需要数值运算的场景） */
function HInt(...parts: (Buffer | bigint | string)[]): bigint {
  return bufferToBigInt(H(...parts));
}

/** 将 BigInt 转为 big-endian Buffer，左侧补零到指定字节长度 */
function padTo(n: bigint, byteLen: number): Buffer {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length >= byteLen) return buf.subarray(buf.length - byteLen);
  const padded = Buffer.alloc(byteLen);
  buf.copy(padded, byteLen - buf.length);
  return padded;
}

/** Buffer 转 BigInt（big-endian） */
function bufferToBigInt(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex') || '0');
}

/** 生成密码学安全的随机 BigInt（指定字节长度） */
function randomBigInt(byteLen: number): bigint {
  return bufferToBigInt(crypto.randomBytes(byteLen));
}

/** 乘数 k = H(N | pad(g)) */
const k = HInt(N, g);

/** H(N) 和 H(g)，用于 M1 计算（预计算） */
const hN = H(N);
const hG = H(g);

/* ============================== 注册阶段 ============================== */

/**
 * 服务端计算 SRP verifier（用于 RSA 流程自动升级）
 * - salt: 随机盐（16 字节 hex）
 * - x = H(salt | H(username ":" password))
 * - v = g^x mod N
 *
 * @param username 用户名（原始大小写）
 * @param password 明文密码（仅 HTTPS RSA 解密后可用）
 * @returns { salt, verifier } 均为十六进制字符串
 */
export function computeVerifier(
  username: string,
  password: string,
): { salt: string; verifier: string } {
  const saltBytes = crypto.randomBytes(16);
  const saltHex = saltBytes.toString('hex');
  const x = computeX(saltHex, username, password);
  const v = modPow(g, x, N);
  return { salt: saltHex, verifier: v.toString(16) };
}

/**
 * 计算私钥 x = H(salt | H(username ":" password))
 * @param saltHex 盐（十六进制字符串）
 */
export function computeX(saltHex: string, username: string, password: string): bigint {
  const inner = H(`${username}:${password}`);
  return HInt(Buffer.from(saltHex, 'hex'), inner);
}

/* ============================== 登录握手（服务端） ============================== */

/**
 * 服务端保存的 SRP 握手临时状态（步骤1与步骤2之间传递）
 * 存储在内存 Map 中，按 username 索引，步骤2完成后清除
 */
interface SrpServerSession {
  username: string;
  userId: number;
  b: bigint;        // 服务端私有指数（不传输）
  B: bigint;        // 服务端公共值（返回给客户端）
  salt: string;     // 用户 salt
  verifier: bigint; // 用户 v
}

/** 活跃握手会话（username → session），5 分钟过期 */
const srpSessions = new Map<string, { session: SrpServerSession; expireAt: number }>();
const SRP_SESSION_TTL = 5 * 60 * 1000;

/** 清理过期会话 */
function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [key, val] of srpSessions) {
    if (val.expireAt < now) srpSessions.delete(key);
  }
}

/**
 * 握手步骤1：服务端生成 B
 * - 接收客户端的 A
 * - 生成私有 b，计算 B = (k·v + g^b) mod N
 * - 缓存会话状态，等待步骤2
 *
 * @returns { salt, B } 返回给客户端；内部缓存 b 等待步骤2验证
 */
export function serverStep1(
  username: string,
  userId: number,
  saltHex: string,
  verifierHex: string,
  _A: bigint,
): { salt: string; B: string } {
  cleanExpiredSessions();
  const v = BigInt('0x' + verifierHex);
  // 生成私有 b（256 位随机数，确保安全）
  const b = randomBigInt(32);
  // B = (k·v + g^b) mod N
  const B = (k * v + modPow(g, b, N)) % N;

  srpSessions.set(username, {
    session: { username, userId, b, B, salt: saltHex, verifier: v },
    expireAt: Date.now() + SRP_SESSION_TTL,
  });

  return { salt: saltHex, B: B.toString(16) };
}

/**
 * 握手步骤2：验证客户端 M1，签发 token
 * - 重新计算 u、S、K、M1_expected
 * - 验证客户端提交的 M1 == M1_expected
 * - 通过后计算 M2 返回给客户端
 *
 * @returns { valid: true, M2 } 或 { valid: false }
 */
export function serverStep2(
  username: string,
  A: bigint,
  _B: bigint,
  clientM1Hex: string,
): { valid: true; M2: string } | { valid: false } {
  const entry = srpSessions.get(username);
  if (!entry) return { valid: false };
  // 无论验证成功与否，会话一次性使用
  srpSessions.delete(username);
  if (entry.expireAt < Date.now()) return { valid: false };

  const { b, salt, verifier: v } = entry.session;

  // A 必须非零（防绕过）
  if (A % N === 0n) return { valid: false };

  // u = H(pad(A) | pad(B))
  const u = HInt(A, entry.session.B);
  // S = (A · v^u)^b mod N
  const S = modPow((A * modPow(v, u, N)) % N, b, N);
  // K = H(S)
  const K = H(S);

  // M1 = H(H(N)⊕H(g) | H(I) | salt | A | B | K)
  const hI = H(username);
  const xorHash = Buffer.alloc(hN.length);
  for (let i = 0; i < hN.length; i++) xorHash[i] = hN[i] ^ hG[i];
  const M1expected = H(xorHash, hI, Buffer.from(salt, 'hex'), A, entry.session.B, K);
  const M1expectedHex = M1expected.toString('hex');

  // 常量时间比较，防时序攻击
  if (M1expectedHex.length !== clientM1Hex.length) return { valid: false };
  let diff = 0;
  for (let i = 0; i < M1expectedHex.length; i++) {
    diff |= M1expectedHex.charCodeAt(i) ^ clientM1Hex.charCodeAt(i);
  }
  if (diff !== 0) return { valid: false };

  // M2 = H(A | M1 | K)
  const M2 = H(A, M1expected, K);
  return { valid: true, M2: M2.toString('hex') };
}

/**
 * 删除指定用户的握手会话（登录失败时调用）
 */
export function clearSrpSession(username: string): void {
  srpSessions.delete(username);
}
