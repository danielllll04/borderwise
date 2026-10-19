/** LOCAL maintenance only. Deletes up to 100 expired private images; retains review/posting metadata. */
import { db } from '../src/db.js';
import { ReceiptUploadService } from '../src/receipts/uploads.js';

try { console.log(JSON.stringify(await new ReceiptUploadService(db).cleanup())); }
catch { console.error('Receipt cleanup failed; check local storage access and database availability.'); process.exitCode = 1; }
finally { await db.$disconnect(); }
