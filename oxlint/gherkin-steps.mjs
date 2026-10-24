import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generate } from '../mapper/generate.ts';
import { scenarioAliases } from '../mapper/scenario-aliases.ts';

const KEYWORDS = new Map([
  ['given', 'Given'],
  ['when', 'When'],
  ['then', 'Then'],
  ['and', 'And'],
  ['but', 'But'],
]);

function staticProperty(member) {
  if (member?.type !== 'MemberExpression') return undefined;
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') {
    return member.property.value;
  }
  return undefined;
}

function importedName(specifier) {
  return specifier.imported?.name ?? specifier.imported?.value;
}

function loadFeature(fileName, source) {
  try {
    const path = resolve(dirname(fileName), source);
    const contents = readFileSync(path, 'utf8');
    const generated = generate(contents);
    if (generated.diagnostics.length > 0) return undefined;

    return {
      path,
      schema: generated.schema,
      aliases: scenarioAliases(generated.schema.scenarioNames),
    };
  } catch {
    // TypeScript and the feature mapper report unresolved imports and invalid
    // feature files. This rule only checks templates when it can load the file.
    return undefined;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesStepTemplate(quasis, text) {
  let pattern = '^';
  for (let index = 0; index < quasis.length; index++) {
    const part = quasis[index].value.cooked;
    if (part === null) return false;
    pattern += escapeRegExp(part);
    if (index < quasis.length - 1) pattern += '(.+?)';
  }
  return new RegExp(`${pattern}$`).test(text);
}

function stepTag(node, bindings) {
  if (node.type !== 'TaggedTemplateExpression' || node.tag.type !== 'MemberExpression') return undefined;
  const keywordName = staticProperty(node.tag);
  const keyword = KEYWORDS.get(keywordName);
  if (!keyword || node.tag.object.type !== 'Identifier') return undefined;
  const feature = bindings.get(node.tag.object.name);
  return feature ? { keyword, feature } : undefined;
}

function scenarioCallFor(node, bindings) {
  let child = node;
  let parent = child.parent;
  while (parent) {
    if (parent.type === 'CallExpression' && parent.callee.type === 'MemberExpression') {
      const scenarioName = staticProperty(parent.callee);
      const feature = parent.callee.object.type === 'Identifier'
        ? bindings.get(parent.callee.object.name)
        : undefined;
      if (feature && scenarioName && Object.hasOwn(feature.aliases, scenarioName)) {
        let argument = node;
        while (argument.parent && argument.parent !== parent) argument = argument.parent;
        return {
          feature,
          scenarioName: feature.aliases[scenarioName],
          stepIndex: parent.arguments.indexOf(argument),
        };
      }
    }
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

function featureImports(program, fileName) {
  const stepBindings = new Map();
  const scenarioBindings = new Map();

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || typeof statement.source.value !== 'string') continue;
    const source = statement.source.value;
    if (!source.endsWith('.feature')) continue;
    const feature = loadFeature(fileName, source);
    if (!feature) continue;

    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const imported = importedName(specifier);
      if (imported === 'steps') stepBindings.set(specifier.local.name, feature);
      if (imported === 'scenarios') scenarioBindings.set(specifier.local.name, feature);
    }
  }

  return { stepBindings, scenarioBindings };
}

const validStepTemplate = {
  meta: {
    type: 'problem',
    docs: { description: 'Check tagged step text against the imported Gherkin feature' },
    schema: [],
  },
  createOnce(context) {
    let stepBindings = new Map();
    let scenarioBindings = new Map();

    return {
      before() {
        stepBindings = new Map();
        scenarioBindings = new Map();
      },
      Program(program) {
        const bindings = featureImports(program, context.filename);
        stepBindings = bindings.stepBindings;
        scenarioBindings = bindings.scenarioBindings;
      },
      TaggedTemplateExpression(node) {
        const tag = stepTag(node, stepBindings);
        if (!tag) return;

        const scenario = scenarioCallFor(node, scenarioBindings);
        const scenarioSteps = scenario
          ? tag.feature.schema.scenarios[scenario.scenarioName]?.steps ?? []
          : undefined;
        const expectedSteps = scenarioSteps
          ? scenarioSteps.slice(scenario.stepIndex, scenario.stepIndex + 1)
          : Object.values(tag.feature.schema.scenarios).flatMap(item => item.steps);
        const isValid = expectedSteps.some(step =>
          step.keyword === tag.keyword && matchesStepTemplate(node.quasi.quasis, step.text));
        if (isValid) return;

        const expected = expectedSteps[0];
        context.report({
          node: node.quasi,
          message: scenario && expected
            ? `Scenario ${JSON.stringify(scenario.scenarioName)}, step ${scenario.stepIndex + 1} must match ${expected.keyword} ${JSON.stringify(expected.text)}`
            : expected
              ? `Step template does not match the feature step: ${expected.keyword} ${JSON.stringify(expected.text)}`
            : `The feature has no ${tag.keyword} step matching this template`,
        });
      },
    };
  },
};

export default {
  meta: { name: 'gherkin-feature' },
  rules: { 'valid-step-template': validStepTemplate },
};
