import { resolve, relative, sep } from 'node:path';

const runtimeDependencies = {
  domain: [],
  copy: ['@sleeby/domain'],
  data: ['@sleeby/domain', 'drizzle-orm'],
};

export function importAllowed(filename, specifier, typeOnly = false) {
  const normalized = filename.replaceAll('\\', '/');
  const match = /\/packages\/(domain|copy|data)\/src\//.exec(normalized);
  if (!match) return true;
  const owner = match[1];
  if (specifier.startsWith('.')) {
    const packageDirectory =
      normalized.slice(0, normalized.indexOf(`/packages/${owner}/src/`)) +
      `/packages/${owner}/src`;
    const target = resolve(filename, '..', specifier);
    const path = relative(packageDirectory, target);
    return (
      path !== '..' &&
      !path.startsWith(`..${sep}`) &&
      !path.startsWith('/') &&
      !/^[A-Z]:/i.test(path)
    );
  }
  const allowed = runtimeDependencies[owner].some(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
  return allowed && (owner !== 'copy' || typeOnly);
}

export function manifestViolations(manifest, owner) {
  const allowed = runtimeDependencies[owner];
  if (!allowed) return [];
  const violations = [];
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (!allowed.includes(name))
        violations.push(`${manifest.name}: forbidden ${field} ${name}`);
    }
  }
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    if (name.startsWith('@sleeby/') && name !== '@sleeby/config')
      violations.push(
        `${manifest.name}: forbidden development workspace dependency ${name}`,
      );
    if (/^(react|react-native|next|expo|.*sqlite|dexie)(\/|$|-)/.test(name))
      violations.push(
        `${manifest.name}: platform development dependency ${name}`,
      );
  }
  return violations;
}
