import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nanoid } from 'nanoid';
import { db } from '../src/db/client';
import { profiles } from '../src/db/schema';
import { normalizeProfile } from '../src/lib/profile/normalize';
import { SAMPLE_PROFILE_PATH } from './sample-paths';

const usage = `Usage: npx tsx scripts/import-profile.ts <profile.json>
       npx tsx scripts/import-profile.ts --sample`;

const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') {
  console.log(usage);
  process.exit(arg === '--help' || arg === '-h' ? 0 : 1);
}

const filePath = arg === '--sample' ? SAMPLE_PROFILE_PATH : resolve(arg);

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read/parse ${filePath}:`, (err as Error).message);
  process.exit(1);
}

let structured;
try {
  structured = normalizeProfile(raw);
} catch (err) {
  console.error('Profile validation failed:', (err as Error).message);
  process.exit(1);
}

const id = nanoid();
db.insert(profiles).values({ id, rawText: null, structuredJson: JSON.stringify(structured) }).run();

console.log(`Profile inserted: ${id}`);
console.log(`Items: ${structured.experience.length} experience, ${structured.education.length} education, ${structured.projects.length} projects, ${structured.skills.length} skills`);
console.log('Stable item ids:');
for (const [kind, items] of Object.entries({
  experience: structured.experience,
  education: structured.education,
  projects: structured.projects,
  skills: structured.skills,
})) {
  for (const item of items as { itemId?: string; name?: string; title?: string; degree?: string }[]) {
    const label = item.name ?? item.title ?? item.degree ?? '(unnamed)';
    console.log(`  ${item.itemId}  [${kind}] ${label}`);
  }
}
