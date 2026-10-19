import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import { DEMO_PROFILE_ID } from '../domain/accounts.js';
import { AppError } from '../domain/errors.js';

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export class ReceiptUploadService {
  private readonly directory: string;
  constructor(private readonly db: PrismaClient, directory?: string) {
    this.directory = resolve(directory?.trim() || process.env.RECEIPT_STORAGE_DIR?.trim() || resolve('.local', 'receipts'));
    if (this.directory.split(/[\\/]/).some(part => /^(?:public|static|dist)$/i.test(part))) throw new Error('Receipt storage must stay outside public, static and generated build directories');
  }

  async requireSession(sessionId: string) {
    const session = await this.db.agentSession.findFirst({ where: { id: sessionId, profileId: DEMO_PROFILE_ID } });
    if (!session) throw new AppError(404, 'AGENT_SESSION_NOT_FOUND', 'Session does not belong to the current profile');
    return session;
  }
  private file(key: string) {
    if (!/^[a-f0-9-]{36}\.png$/.test(key)) throw new Error('Invalid server storage key');
    const target = resolve(this.directory, key);
    if (dirname(target) !== this.directory) throw new Error('Storage path escaped receipt directory');
    return target;
  }
  async upload(sessionId: string, contentType: string, bytes: Buffer) {
    await this.requireSession(sessionId);
    if (!['image/jpeg', 'image/png'].includes(contentType)) throw new AppError(415, 'UNSUPPORTED_RECEIPT_IMAGE', 'Only JPEG and PNG receipt uploads are supported');
    if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES) throw new AppError(413, 'RECEIPT_IMAGE_TOO_LARGE', 'Receipt image must be nonempty and at most 4 MiB');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!(contentType === 'image/png' ? png : jpeg)) throw new AppError(400, 'INVALID_RECEIPT_IMAGE', 'Image signature does not match its JPEG/PNG content type');
    let decoded;
    try {
      const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 4096 * 4096, animated: false });
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096
        || metadata.format !== (png ? 'png' : 'jpeg')) throw new Error('Image dimensions/format unsupported');
      // Re-encoding forces a complete pixel decode and strips embedded metadata/trailing payloads.
      decoded = await image.rotate().png().toBuffer({ resolveWithObject: true });
      if (decoded.info.width > 4096 || decoded.info.height > 4096 || decoded.data.length > MAX_RECEIPT_BYTES) throw new Error('Normalized image too large');
    } catch { throw new AppError(400, 'INVALID_RECEIPT_IMAGE', 'Image must fully decode as a single JPEG/PNG image, at most 4096 pixels per side and 4 MiB after normalization'); }
    if (await this.db.receiptAttachment.count({ where: { sessionId, purgedAt: null, expiresAt: { gt: new Date() } } }) >= 20) throw new AppError(429, 'RECEIPT_UPLOAD_LIMIT', 'This development session already has 20 active uploads; clean up expired uploads or use another session');
    const id = randomUUID();
    const storageKey = `${id}.png`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file(storageKey), decoded.data, { flag: 'wx', mode: 0o600 });
    try {
      const row = await this.db.receiptAttachment.create({ data: {
        id, sessionId, storageKey, sha256: createHash('sha256').update(bytes).digest('hex'), contentType,
        byteSize: decoded.data.length, width: decoded.info.width, height: decoded.info.height,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } });
      return { attachment_id: id, width: row.width, height: row.height, content_type: 'image/png', expires_at: row.expiresAt.toISOString(), storage: 'private-local-development', authentication: 'not-implemented' };
    } catch (error) { await rm(this.file(storageKey), { force: true }); throw error; }
  }
  async read(sessionId: string, attachmentId: string) {
    await this.requireSession(sessionId);
    const row = await this.db.receiptAttachment.findFirst({ where: { id: attachmentId, sessionId } });
    if (!row) throw new AppError(404, 'RECEIPT_ATTACHMENT_NOT_FOUND', 'Attachment does not belong to this session');
    if (row.purgedAt || row.expiresAt <= new Date()) throw new AppError(410, 'RECEIPT_ATTACHMENT_EXPIRED', 'The development image has expired; upload another image');
    return { row, bytes: await readFile(this.file(row.storageKey)) };
  }
  async cleanup() {
    const rows = await this.db.receiptAttachment.findMany({ where: { expiresAt: { lte: new Date() }, purgedAt: null }, take: 100 });
    for (const row of rows) {
      await rm(this.file(row.storageKey), { force: true });
      await this.db.receiptAttachment.update({ where: { id: row.id }, data: { purgedAt: new Date() } });
    }
    let orphansRemoved = 0;
    let names: string[] = [];
    try { names = await readdir(this.directory); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    // Recover server-named orphan files left by a crash before attachment metadata committed.
    for (const key of names.filter(name => /^[a-f0-9-]{36}\.png$/.test(name)).slice(0, 1000)) {
      const file = this.file(key);
      const stat = await lstat(file);
      if (stat.isFile() && stat.mtimeMs < Date.now() - 24 * 60 * 60 * 1000 && !await this.db.receiptAttachment.findUnique({ where: { storageKey: key } })) {
        await rm(file, { force: true }); orphansRemoved++;
      }
    }
    return { purged_images: rows.length, orphan_images_removed: orphansRemoved, metadata_retained: true };
  }
}
