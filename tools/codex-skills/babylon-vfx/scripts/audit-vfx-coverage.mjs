#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const repo = resolve(import.meta.dirname, '../../../..');
const skillsDir = resolve(repo, 'game-data/skills');
const files = readdirSync(skillsDir)
  .filter((name) => name.endsWith('.yaml'))
  .sort();

const rows = files.map((file) => {
  const value = parse(readFileSync(resolve(skillsDir, file), 'utf8'));
  const effectTypes = Array.isArray(value.effects)
    ? [...new Set(value.effects.map((effect) => effect?.type).filter(Boolean))].join(',')
    : '';
  return {
    id: value.id ?? file.replace(/\.yaml$/, ''),
    name: value.name ?? '',
    delivery: value.delivery ?? 'legacy',
    vfx: value.vfx ?? '',
    mobility: value.mobility ?? '',
    effects: effectTypes,
  };
});

const missing = rows.filter((row) => !row.vfx);
const generic = new Set(['slash', 'projectile', 'burst', 'heal', 'slam', 'whirl', 'mobility']);
const genericRows = rows.filter((row) => generic.has(row.vfx));
const counts = new Map();
for (const row of rows)
  counts.set(row.vfx || '(missing)', (counts.get(row.vfx || '(missing)') ?? 0) + 1);

console.log(`# VFX coverage audit (${rows.length} skills)`);
console.log('');
console.log('| vfx style | skills |');
console.log('|---|---:|');
for (const [style, count] of [...counts].sort(([a], [b]) => a.localeCompare(b)))
  console.log(`| \`${style}\` | ${count} |`);
console.log('');
console.log(`Missing vfx IDs: ${missing.length}`);
console.log(
  `Generic-style skills needing a technique-specific visual audit: ${genericRows.length}`,
);
console.log('');
console.log('| skill | delivery | effects | mobility | vfx |');
console.log('|---|---|---|---|---|');
for (const row of rows)
  console.log(
    `| \`${row.id}\` ${row.name} | ${row.delivery} | ${row.effects || '—'} | ${row.mobility || '—'} | \`${row.vfx || 'MISSING'}\` |`,
  );

if (missing.length) process.exitCode = 1;
