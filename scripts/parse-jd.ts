import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nanoid } from 'nanoid';
import { db } from '../src/db/client.js';
import { jobDescriptions } from '../src/db/schema.js';
import { parseJd } from '../src/lib/agents/jd-parser.js';
import { SAMPLE_JD_PATH } from './sample-paths.js';

const usage = `Usage: npx tsx scripts/parse-jd.ts <jd.txt>
       npx tsx scripts/parse-jd.ts --sample

Requires OPENAI_API_KEY in the environment (copy .env.example to .env).`;

const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') {
  console.log(usage);
  process.exit(arg === '--help' || arg === '-h' ? 0 : 1);
}

const filePath = arg === '--sample' ? SAMPLE_JD_PATH : resolve(arg);

let rawText: string;
try {
  rawText = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`Failed to read ${filePath}:`, (err as Error).message);
  process.exit(1);
}

console.log('Parsing job description with gpt-4o-mini...');
const { parsed } = await parseJd(rawText);

const id = nanoid();
db.insert(jobDescriptions).values({ id, rawText, parsedJson: JSON.stringify(parsed) }).run();

console.log(`Job description inserted: ${id}`);
console.log(JSON.stringify(parsed, null, 2));
