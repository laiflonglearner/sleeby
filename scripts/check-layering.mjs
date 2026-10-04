import { readFileSync } from 'node:fs';
import { manifestViolations } from '../packages/config/layering.mjs';

const violations = ['domain', 'copy', 'data'].flatMap((owner) =>
  manifestViolations(
    JSON.parse(readFileSync(`packages/${owner}/package.json`, 'utf8')),
    owner,
  ),
);
if (violations.length) throw new Error(violations.join('\n'));
console.log('Package dependency layering: PASS');
