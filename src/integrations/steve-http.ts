import { AppError } from '../domain/errors.js';

/** Trusted server configuration only. Never expose raw upstream bodies or connection errors. */
export class SteveHttpClient {
  constructor(private readonly baseUrl: string | undefined, private readonly timeout: string,
    private readonly prefix: 'COMPARE' | 'RECEIPT' | 'ALERT', private readonly maxTimeout = 10000) {}

  async request(path: string, body?: unknown, contentType = 'application/json'): Promise<unknown> {
    let base: string;
    let timeout: number;
    try {
      const url = new URL(this.baseUrl ?? '');
      if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)
        || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error();
      timeout = Number(this.timeout);
      if (!Number.isInteger(timeout) || timeout < 250 || timeout > this.maxTimeout) throw new Error();
      base = url.toString().replace(/\/$/, '');
    } catch {
      throw new AppError(503, `${this.prefix}_CONFIGURATION_REQUIRED`, `Configure a trusted Steve server URL (HTTPS or local HTTP) and a timeout of 250–${this.maxTimeout} ms. No fallback was used.`);
    }
    // Only GET retries once. OCR and pure allocation POSTs also remain one-attempt operations.
    for (let attempt = 0; attempt < (body === undefined ? 2 : 1); attempt++) {
      try {
        const response = await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
          headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': contentType }) },
          ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (body === undefined && response.status >= 500 && attempt === 0) continue;
          throw new AppError(response.status >= 500 || response.status === 429 ? 503 : 502, `${this.prefix}_UNAVAILABLE`, 'Steve service rejected or could not complete this request. Review remains recoverable; no Node financial action occurred.');
        }
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
          await response.body?.cancel();
          throw new AppError(502, `${this.prefix}_INVALID_RESPONSE`, 'Steve service returned an invalid content type.');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new AppError(502, `${this.prefix}_INVALID_RESPONSE`, 'Steve service returned an empty response.');
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65536) {
            await reader.cancel();
            throw new AppError(502, `${this.prefix}_INVALID_RESPONSE`, 'Steve response exceeded 64 KiB. No result was trusted.');
          }
          chunks.push(value);
        }
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
        catch { throw new AppError(502, `${this.prefix}_INVALID_RESPONSE`, 'Steve service returned invalid JSON.'); }
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (body === undefined && attempt === 0) continue;
        const timedOut = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
        throw new AppError(503, `${this.prefix}_${timedOut ? 'TIMEOUT' : 'UNAVAILABLE'}`, 'Steve service is unavailable or timed out. Retry after recovery; no fixture fallback or Node financial action occurred.');
      }
    }
    throw new AppError(503, `${this.prefix}_UNAVAILABLE`, 'Steve service is unavailable.');
  }
}
