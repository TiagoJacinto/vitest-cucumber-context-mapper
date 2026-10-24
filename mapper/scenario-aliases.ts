export class ScenarioAliasCollision extends Error {
  readonly key: string;
  readonly names: readonly [string, string];

  constructor(key: string, names: readonly [string, string]) {
    super(`Ambiguous scenario alias ${JSON.stringify(key)}: ${JSON.stringify(names[0])} and ${JSON.stringify(names[1])}`);
    this.name = 'ScenarioAliasCollision';
    this.key = key;
    this.names = names;
  }
}

/** Maps every exact scenario name and safe camelCase alias to its original name. */
export function scenarioAliases(names: readonly string[]): Readonly<Record<string, string>> {
  const aliases = new Map<string, string>();
  const add = (key: string, name: string) => {
    const previous = aliases.get(key);
    if (previous !== undefined && previous !== name) {
      throw new ScenarioAliasCollision(key, [previous, name]);
    }
    aliases.set(key, name);
  };
  for (const name of names) add(name, name);
  for (const name of names) {
    const words = name.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|[0-9]+/g) ?? [];
    const alias = words.map((word, index) => index === 0
      ? word.toLowerCase()
      : word[0].toUpperCase() + word.slice(1).toLowerCase()).join('');
    if (alias) add(/^[0-9]/.test(alias) ? '_' + alias : alias, name);
  }
  return Object.fromEntries(aliases);
}
