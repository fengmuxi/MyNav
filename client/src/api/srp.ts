/**
 * SRP-6a 协议实现（客户端）
 * ------------------------------------------------------------------
 * RFC 5054 2048-bit group + SHA-256
 *
 * 用于 HTTP 非安全上下文下的安全认证。
 * - 密码永不离开客户端
 * - 抗中间人攻击与离线字典攻击
 *
 * 实现要点：
 * - HTTP 下 window.crypto.subtle 不可用，因此内嵌纯 JS SHA-256 实现
 * - 大数运算使用浏览器原生 BigInt + 快速幂模运算
 * - N/g 与后端 server/src/srp.ts 完全一致
 *
 * 暴露的 API：
 * - srpRegister(username, password) → { salt, verifier }  客户端计算 verifier
 * - srpLogin(username, password) → { token, user }        完整握手登录
 */

/** RFC 5054 2048-bit group: 大素数 N（十六进制，与后端一致） */
const N_HEX =
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
  'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8' +
  '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B' +
  'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748' +
  '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6' +
  'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6' +
  '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73';

const N = BigInt('0x' + N_HEX);
const g = 2n;
const N_BYTES = N_HEX.length / 2; // 256

/* ============================== 纯 JS SHA-256 ============================== */
/**
 * SHA-256 纯 JavaScript 实现
 * ------------------------------------------------------------------
 * HTTP 非安全上下文下 crypto.subtle 不可用，需内嵌实现。
 * 输入：Uint8Array，输出：Uint8Array（32 字节）
 * 与 node:crypto 的 sha256 结果完全一致。
 */

// SHA-256 轮常量
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// SHA-256 初始哈希值
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** SHA-256 哈希，输入 Uint8Array，返回 Uint8Array(32) */
function sha256(data: Uint8Array): Uint8Array {
  // 预处理：填充
  const bitLen = data.length * 8;
  const withPadding = data.length + 1 + 8;
  const blocks = Math.ceil(withPadding / 64);
  const totalLen = blocks * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data);
  padded[data.length] = 0x80; // 填充 1 后接 0
  // 末尾 8 字节为长度（大端）
  const lenView = new DataView(padded.buffer);
  lenView.setUint32(totalLen - 4, bitLen >>> 0, false);
  lenView.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);

  const h = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);

  for (let blockStart = 0; blockStart < totalLen; blockStart += 64) {
    const dv = new DataView(padded.buffer, blockStart, 64);
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = ((w[i - 16] + s0 + w[i - 7] + s1) >>> 0);
    }

    let [a, b, c, d, e, f, g, h1] = h;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h1 + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h1 = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + h1) >>> 0;
  }

  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outDv.setUint32(i * 4, h[i], false);
  }
  return out;
}

/* ============================== 大数工具 ============================== */

/** 模幂运算 base^exp mod m（快速幂，BigInt） */
function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  base = ((base % m) + m) % m;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    exp >>= 1n;
    base = (base * base) % m;
  }
  return result;
}

/** BigInt 转 big-endian Uint8Array，左侧补零到指定字节长度 */
function padTo(n: bigint, byteLen: number): Uint8Array {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = hexToBytes(hex);
  if (buf.length >= byteLen) return buf.subarray(buf.length - byteLen);
  const padded = new Uint8Array(byteLen);
  padded.set(buf, byteLen - buf.length);
  return padded;
}

/** 十六进制字符串转 Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) hex = '0' + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/** Uint8Array 转 BigInt（big-endian） */
function bytesToBigInt(buf: Uint8Array): bigint {
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return hex ? BigInt('0x' + hex) : 0n;
}

/** 字符串转 UTF-8 Uint8Array */
function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Uint8Array 转十六进制字符串 */
function bytesToHex(buf: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * SHA-256 多输入哈希（依次拼接各参数），返回 Uint8Array
 * 与后端 H() 数学等价
 */
function H(...parts: (Uint8Array | bigint | string)[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    if (typeof p === 'bigint') chunks.push(padTo(p, N_BYTES));
    else if (typeof p === 'string') chunks.push(strToBytes(p));
    else chunks.push(p);
  }
  // 拼接所有 chunk
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return sha256(merged);
}

/** SHA-256 返回 BigInt */
function HInt(...parts: (Uint8Array | bigint | string)[]): bigint {
  return bytesToBigInt(H(...parts));
}

/** 生成密码学安全随机 BigInt（使用 crypto.getRandomValues，所有环境可用） */
function randomBigInt(byteLen: number): bigint {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return bytesToBigInt(buf);
}

/* ============================== SRP 常量预计算 ============================== */

const k = HInt(N, g);
const hN = H(N);
const hG = H(g);

/* ============================== SRP 客户端 API ============================== */

import api from './axios';

/** SRP 注册结果：客户端计算的 salt 与 verifier */
export interface SrpRegisterPayload {
  salt: string;
  verifier: string;
}

/**
 * 客户端计算 SRP 注册数据（salt + verifier）
 * - salt: 16 字节随机盐（hex）
 * - x = H(salt | H(username ":" password))
 * - v = g^x mod N
 *
 * @returns { salt, verifier } 均为十六进制字符串，提交给后端 /api/auth/srp/register
 */
export function computeSrpVerifier(
  username: string,
  password: string,
): SrpRegisterPayload {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = bytesToHex(saltBytes);
  const x = computeX(saltHex, username, password);
  const v = modPow(g, x, N);
  return { salt: saltHex, verifier: v.toString(16) };
}

/** 计算私钥 x = H(salt | H(username ":" password)) */
function computeX(saltHex: string, username: string, password: string): bigint {
  const inner = H(`${username}:${password}`);
  return HInt(hexToBytes(saltHex), inner);
}

/** SRP 登录响应（与 RSA 登录一致，多了 M2 但前端不强制校验） */
interface SrpLoginResponse {
  token: string;
  user: unknown;
  M2?: string;
}

/**
 * SRP-6a 完整握手登录流程
 * ------------------------------------------------------------------
 * 步骤1：客户端生成 a，计算 A = g^a mod N，发送 { username, A } → 获取 { salt, B }
 * 步骤2：客户端计算 u、x、S、K、M1，发送 { username, A, B, M1 } → 获取 { token, user, M2 }
 *
 * @param username 用户名
 * @param password 明文密码（仅在客户端内存中，不传输）
 * @returns { token, user } 登录成功后的 JWT 与用户信息
 */
export async function srpLogin(
  username: string,
  password: string,
): Promise<{ token: string; user: unknown }> {
  // ===== 步骤1：生成 A，请求 salt 和 B =====
  // a: 客户端私有随机指数（256 位）
  const a = randomBigInt(32);
  const A = modPow(g, a, N);
  const AHex = A.toString(16);

  const { data: initResp } = await api.post<{ salt: string; B: string }>(
    '/auth/srp/login/init',
    { username, A: AHex },
  );
  const { salt, B: BHex } = initResp;
  const B = BigInt('0x' + BHex);

  // B 必须非零（防绕过）
  if (B % N === 0n) {
    throw new Error('服务端返回的 B 无效');
  }

  // ===== 步骤2：计算会话密钥与 M1 =====
  // u = H(pad(A) | pad(B))
  const u = HInt(A, B);
  // x = H(salt | H(username ":" password))
  const x = computeX(salt, username, password);
  // S = (B - k·g^x) ^ (a + u·x) mod N
  const kgx = (k * modPow(g, x, N)) % N;
  let base = (B - kgx) % N;
  if (base < 0n) base += N; // 确保非负
  const exp = a + u * x;
  const S = modPow(base, exp, N);
  // K = H(S)
  const K = H(S);

  // M1 = H(H(N)⊕H(g) | H(I) | salt | A | B | K)
  const xorHash = new Uint8Array(32);
  for (let i = 0; i < 32; i++) xorHash[i] = hN[i] ^ hG[i];
  const hI = H(username);
  const M1 = H(xorHash, hI, hexToBytes(salt), A, B, K);
  const M1Hex = bytesToHex(M1);

  // 发送 M1 验证
  const { data: verifyResp } = await api.post<SrpLoginResponse>(
    '/auth/srp/login/verify',
    { username, A: AHex, B: BHex, M1: M1Hex },
  );

  if (!verifyResp.token || !verifyResp.user) {
    throw new Error('登录响应不完整');
  }

  return { token: verifyResp.token, user: verifyResp.user };
}
