import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const snapPath = path.join(ROOT, 'public/data/market_snapshot.json');
const targetPath = path.join(ROOT, 'src/market/features/overview/realServerSnapshot.js');

const raw = fs.readFileSync(snapPath, 'utf8');
const code = `// Real server-fetched EOD market snapshot from Yahoo Finance, MFapi.in, Frankfurter API\nexport const REAL_SERVER_SNAPSHOT = Object.freeze(${raw});\n`;

fs.writeFileSync(targetPath, code, 'utf8');
console.log('Saved realServerSnapshot.js successfully!');
