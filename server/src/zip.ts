/**
 * 极简 ZIP 工具（无外部依赖）
 * ------------------------------------------------------------------
 * 使用 Node.js 内置 `zlib.deflateRawSync` / `inflateRawSync` 实现
 * ZIP 格式的打包与解包，仅支持最常见的 deflate 与 stored 压缩方式。
 *
 * 设计目标：为数据备份功能提供 ZIP 文件封装，避免引入 adm-zip 等依赖。
 *
 * ZIP 文件结构：
 *   [本地文件头 + 文件数据] × N
 *   [中央目录条目] × N
 *   [中央目录结束记录]
 */
import zlib from 'node:zlib';

/* ============================== CRC-32 ============================== */

// CRC-32 查找表（IEEE 802.3 多项式 0xEDB88320）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** 计算 Buffer 的 CRC-32 校验值 */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ============================== 常量 ============================== */

const SIG_LOCAL = 0x04034b50;       // 本地文件头签名
const SIG_CENTRAL = 0x02014b50;     // 中央目录条目签名
const SIG_EOCD = 0x06054b50;        // 中央目录结束记录签名
const METHOD_DEFLATE = 8;
const METHOD_STORED = 0;

/* ============================== ZIP 写入 ============================== */

export interface ZipFileEntry {
  name: string;
  data: Buffer;
}

/**
 * 将多个文件打包为 ZIP Buffer
 * - 使用 deflate 压缩（method=8）
 * - 自动计算 CRC-32 与文件大小
 */
export function createZip(files: ZipFileEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    // 压缩数据（deflateRaw：ZIP 使用的原始 deflate 流）
    const compressed = zlib.deflateRawSync(file.data);
    const crc = crc32(file.data);

    // === 本地文件头（30 字节固定 + 文件名） ===
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(SIG_LOCAL, 0);
    localHeader.writeUInt16LE(20, 4);              // 版本所需（2.0）
    localHeader.writeUInt16LE(0, 6);               // 通用位标志
    localHeader.writeUInt16LE(METHOD_DEFLATE, 8);  // 压缩方式
    localHeader.writeUInt16LE(0, 10);              // 修改时间
    localHeader.writeUInt16LE(0x0021, 12);         // 修改日期（1980-01-01 起）
    localHeader.writeUInt32LE(crc, 14);            // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18);  // 压缩后大小
    localHeader.writeUInt32LE(file.data.length, 22);   // 原始大小
    localHeader.writeUInt16LE(nameBuf.length, 26);     // 文件名长度
    localHeader.writeUInt16LE(0, 28);              // 扩展字段长度

    const localHeaderOffset = offset;
    chunks.push(localHeader, nameBuf, compressed);
    offset += localHeader.length + nameBuf.length + compressed.length;

    // === 中央目录条目（46 字节固定 + 文件名） ===
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);                  // 制作版本
    central.writeUInt16LE(20, 6);                  // 所需版本
    central.writeUInt16LE(0, 8);                   // 通用位标志
    central.writeUInt16LE(METHOD_DEFLATE, 10);     // 压缩方式
    central.writeUInt16LE(0, 12);                  // 修改时间
    central.writeUInt16LE(0x0021, 14);             // 修改日期
    central.writeUInt32LE(crc, 16);                // CRC-32
    central.writeUInt32LE(compressed.length, 20);  // 压缩后大小
    central.writeUInt32LE(file.data.length, 24);   // 原始大小
    central.writeUInt16LE(nameBuf.length, 28);     // 文件名长度
    central.writeUInt16LE(0, 30);                  // 扩展字段长度
    central.writeUInt16LE(0, 32);                  // 注释长度
    central.writeUInt16LE(0, 34);                  // 起始磁盘号
    central.writeUInt16LE(0, 36);                  // 内部属性
    central.writeUInt32LE(0, 38);                  // 外部属性
    central.writeUInt32LE(localHeaderOffset, 42);  // 本地头偏移
    centralEntries.push(central, nameBuf);
  }

  const centralDirBuffer = Buffer.concat(centralEntries);
  const centralDirOffset = offset;
  const centralDirSize = centralDirBuffer.length;

  // === 中央目录结束记录（22 字节固定） ===
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4);                        // 磁盘号
  eocd.writeUInt16LE(0, 6);                        // 中央目录所在磁盘
  eocd.writeUInt16LE(files.length, 8);             // 本磁盘记录数
  eocd.writeUInt16LE(files.length, 10);            // 总记录数
  eocd.writeUInt32LE(centralDirSize, 12);          // 中央目录大小
  eocd.writeUInt32LE(centralDirOffset, 16);        // 中央目录偏移
  eocd.writeUInt16LE(0, 20);                       // 注释长度

  return Buffer.concat([...chunks, centralDirBuffer, eocd]);
}

/* ============================== ZIP 读取 ============================== */

/**
 * 从 ZIP Buffer 中读取所有文件
 * - 支持 deflate（method=8）与 stored（method=0）
 * - 不支持加密、分卷等高级特性
 * @throws 格式无效时抛出 Error
 */
export function readZip(zipBuf: Buffer): ZipFileEntry[] {
  if (zipBuf.length < 22) {
    throw new Error('ZIP 文件过小，格式无效');
  }

  // 从尾部向前查找 EOCD 签名（容忍尾部可能有注释）
  let eocdOffset = -1;
  const maxComment = Math.min(zipBuf.length - 22, 65535);
  for (let i = 0; i <= maxComment; i++) {
    const pos = zipBuf.length - 22 - i;
    if (zipBuf.readUInt32LE(pos) === SIG_EOCD) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('未找到 ZIP 中央目录结束记录');
  }

  const numEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  const files: ZipFileEntry[] = [];
  let entryOffset = centralDirOffset;

  for (let i = 0; i < numEntries; i++) {
    if (entryOffset + 46 > zipBuf.length) {
      throw new Error('中央目录条目越界');
    }
    if (zipBuf.readUInt32LE(entryOffset) !== SIG_CENTRAL) {
      throw new Error('中央目录条目签名无效');
    }

    const compressionMethod = zipBuf.readUInt16LE(entryOffset + 10);
    const compressedSize = zipBuf.readUInt32LE(entryOffset + 20);
    const nameLength = zipBuf.readUInt16LE(entryOffset + 28);
    const extraLength = zipBuf.readUInt16LE(entryOffset + 30);
    const commentLength = zipBuf.readUInt16LE(entryOffset + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(entryOffset + 42);
    const name = zipBuf.toString(
      'utf8',
      entryOffset + 46,
      entryOffset + 46 + nameLength,
    );

    // 跳到本地文件头读取数据
    if (localHeaderOffset + 30 > zipBuf.length) {
      throw new Error('本地文件头越界');
    }
    if (zipBuf.readUInt32LE(localHeaderOffset) !== SIG_LOCAL) {
      throw new Error('本地文件头签名无效');
    }
    const localNameLength = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;

    if (dataOffset + compressedSize > zipBuf.length) {
      throw new Error('文件数据越界');
    }
    const compressedData = zipBuf.subarray(dataOffset, dataOffset + compressedSize);

    let data: Buffer;
    if (compressionMethod === METHOD_STORED) {
      data = Buffer.from(compressedData);
    } else if (compressionMethod === METHOD_DEFLATE) {
      data = zlib.inflateRawSync(compressedData);
    } else {
      throw new Error(`不支持的压缩方式：${compressionMethod}`);
    }

    files.push({ name, data });
    entryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

/**
 * 便捷方法：从 ZIP 中按文件名读取单个文件
 * @throws 未找到时抛出 Error
 */
export function readZipFile(zipBuf: Buffer, fileName: string): Buffer {
  const files = readZip(zipBuf);
  const found = files.find((f) => f.name === fileName);
  if (!found) {
    throw new Error(`ZIP 中未找到文件：${fileName}`);
  }
  return found.data;
}
