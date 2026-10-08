// คัดลอกหน้าเว็บ UM+ (โฟลเดอร์แม่ของ app/) ไปไว้ใน app/www เพื่อห่อเป็นแอป
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = join(dirname(fileURLToPath(import.meta.url)), '..'), site = join(app, '..'), www = join(app, 'www');
const SKIP = new Set(['app', 'backend', '.git', '.github', 'node_modules', 'README.md', '.nojekyll', 'sw.js']);
rmSync(www, { recursive: true, force: true }); mkdirSync(www);
for (const f of readdirSync(site)) if (!SKIP.has(f) && !f.startsWith('.')) cpSync(join(site, f), join(www, f), { recursive: true });
console.log('copied site →', www);
