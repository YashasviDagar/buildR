import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nanoid } from 'nanoid';
import { db } from '../src/db/client';
import { profiles } from '../src/db/schema';
import { normalizeProfile } from '../src/lib/profile/normalize';
import { parseProfileFromText } from '../src/lib/agents/profile-parser';
import { SAMPLE_PROFILE_PATH } from './sample-paths';

const usage = `Usage: npx tsx scripts/import-profile.ts <profile.json>
       npx tsx scripts/import-profile.ts --sample
       npx tsx scripts/import-profile.ts --raw <resume.txt>   (LLM structuring, needs OPENAI_API_KEY)`;

const args = process.argv.slice(2);
const rawMode = args[0] === '--raw';
const arg = rawMode ? args[1] : args[0];
if (!arg || args[0] === '--help' || args[0] === '-h') {
  console.log(usage);
  process.exit(args[0] === '--help' || args[0] === '-h' ? 0 : 1);
}

const filePath = arg === '--sample' ? SAMPLE_PROFILE_PATH : resolve(arg);

let fileText: string;
try {
  fileText = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`Failed to read ${filePath}:`, (err as Error).message);
  process.exit(1);
}

let structured;
let rawText: string | null = null;

if (rawMode) {
  console.log('Structuring freeform resume text with gpt-4o-mini...');
  try {
    ({ profile: structured } = await parseProfileFromText(fileText));
  } catch (err) {
    console.error('Profile extraction failed:', (err as Error).message);
    process.exit(1);
  }
  rawText = fileText;
} else {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    console.error(`Failed to parse ${filePath} as JSON:`, (err as Error).message);
    process.exit(1);
  }
  try {
    structured = normalizeProfile(raw);
  } catch (err) {
    console.error('Profile validation failed:', (err as Error).message);
    process.exit(1);
  }
}

const id = nanoid();
db.insert(profiles).values({ id, rawText, structuredJson: JSON.stringify(structured) }).run();

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
