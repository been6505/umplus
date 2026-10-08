// คัดลอกหน้าแอป (app/shell) ไปไว้ใน app/www — แอปเป็นตัวส่งตำแหน่งทีมให้ central.helpme4u.com
import { cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = join(dirname(fileURLToPath(import.meta.url)), '..'), www = join(app, 'www');
rmSync(www, { recursive: true, force: true });
cpSync(join(app, 'shell'), www, { recursive: true });
console.log('copied app/shell →', www);
