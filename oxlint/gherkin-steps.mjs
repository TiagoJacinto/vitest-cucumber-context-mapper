import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generate } from '../dist/mapper/generate.js';

const KEYWORDS = new Map([
  ['given', 'given'],
  ['when', 'when'],
  ['then', 'then'],
  ['and', 'and'],
  ['but', 'but'],
  ['step', 'step'],
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

// Resolve the actual import variable, rather than matching an identifier's spelling.
function importedFeature(identifier, bindings, context) {
  if (identifier?.type !== 'Identifier') return undefined;
  const binding = bindings.get(identifier.name);
  if (!binding) return undefined;
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable.defs.some(def => def.node === binding.specifier)
      ? binding.feature
      : undefined;
  }
  return undefined;
}

// Only direct receiver chains are supported. Stored builders, destructured
// methods, wrappers, and chains passed through helpers are deliberately not
// followed: doing so would require data-flow analysis, not AST ancestry.
function fluentReceiver(node, bindings, context) {
  const feature = importedFeature(node, bindings, context);
  if (feature) return { feature, group: feature.schema, stepIndex: 0 };
  if (node?.type !== 'CallExpression') return undefined;
  const callee = node.callee;
  if (callee.type === 'CallExpression') return fluentReceiver(callee, bindings, context);
  const member = callee.type === 'TaggedTemplateExpression' ? callee.tag : callee;
  if (member.type !== 'MemberExpression') return undefined;
  const previous = fluentReceiver(member.object, bindings, context);
  if (!previous) return undefined;
  const method = staticProperty(member);
  if (KEYWORDS.has(method)) return { ...previous, stepIndex: previous.stepIndex + 1 };
  const name = node.arguments[0]?.type === 'Literal' ? node.arguments[0].value : undefined;
  if (method === 'rule' && typeof name === 'string' && Object.hasOwn(previous.feature.schema.rules, name)) {
    return { ...previous, group: previous.feature.schema.rules[name], steps: undefined, stepIndex: 0 };
  }
  if (method === 'scenario' && typeof name === 'string' && Object.hasOwn(previous.group.scenarios, name)) {
    return { ...previous, scenarioName: name, steps: previous.group.scenarios[name].steps, stepIndex: 0 };
  }
  if (method === 'background') return { ...previous, scenarioName: 'Background', steps: previous.group.background, stepIndex: 0 };
  if (['use', 'beforeAll', 'beforeEach', 'afterEach', 'afterAll', 'only', 'skip'].includes(method)) return previous;
  return undefined;
}

function taggedFluentChain(node, bindings, context) {
  const steps = [];
  let current = node;

  while (current?.type === 'CallExpression' && current.arguments.length === 1) {
    const tagged = current.callee;
    if (tagged?.type !== 'TaggedTemplateExpression' || tagged.tag.type !== 'MemberExpression') break;
    if (!KEYWORDS.has(staticProperty(tagged.tag))) break;

    steps.unshift({
      tagged,
      receiver: tagged.tag.object,
      callback: current.arguments[0],
    });
    current = tagged.tag.object;
  }

  if (steps.length === 0) return undefined;
  const resolved = fluentReceiver(current, bindings, context);
  if (!resolved?.steps || resolved.stepIndex !== 0) return undefined;
  return { base: current, steps };
}

function lineIndent(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] ?? '';
}

function indentCallback(callback, callbackText, source, targetIndent, context, eol) {
  const sourceIndent = lineIndent(source, callback.range[0]);
  const tokens = context.sourceCode.getTokens(callback, { includeComments: true });
  const lines = callbackText.split(/\r\n|\n/);
  let offset = callback.range[0];

  return lines.map((line, index) => {
    if (index === 0) {
      offset += line.length + eol.length;
      return `${targetIndent}${line.trimStart()}`;
    }

    const protectedLine = tokens.some(token => token.range[0] <= offset && offset < token.range[1]);
    const leading = line.match(/^[\t ]*/)?.[0] ?? '';
    const result = !line.trim() || protectedLine
      ? line
      : `${targetIndent}${leading.startsWith(sourceIndent) ? leading.slice(sourceIndent.length) : leading}${line.slice(leading.length)}`;
    offset += line.length + eol.length;
    return result;
  }).join(eol);
}

function formatTaggedFluentChain(chain, context) {
  const source = context.sourceCode.text;
  const baseOffset = chain.base.type === 'CallExpression' && chain.base.callee.type === 'MemberExpression'
    ? chain.base.callee.property.range[0] : chain.base.range[0];
  const baseIndent = lineIndent(source, baseOffset);
  const stepIndent = `${baseIndent}  `;
  const callbackIndent = `${stepIndent}  `;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let formatted = context.sourceCode.getText(chain.base);

  for (const step of chain.steps) {
    const callbackText = context.sourceCode.getText(step.callback);
    const methodText = source.slice(step.receiver.range[1], step.tagged.range[1]).trimStart();
    const callOpen = source.slice(step.tagged.range[1], step.callback.range[0]).trimEnd();

    if (callbackText.includes('\n') || callbackText.includes('\r')) {
      const indented = indentCallback(step.callback, callbackText, source, callbackIndent, context, eol);
      formatted += `${eol}${stepIndent}${methodText}${callOpen}${eol}${indented},${eol}${stepIndent})`;
    } else {
      formatted += `${eol}${stepIndent}${methodText}${callOpen}${callbackText})`;
    }
  }

  return formatted;
}

function isFluentReceiver(node) {
  const method = node.parent;
  const tagged = method?.parent;
  const call = tagged?.parent;
  return method?.type === 'MemberExpression'
    && method.object === node
    && KEYWORDS.has(staticProperty(method))
    && tagged?.type === 'TaggedTemplateExpression'
    && tagged.tag === method
    && call?.type === 'CallExpression'
    && call.callee === tagged;
}

function stepTag(node, scenarioBindings, context) {
  if (node.tag.type !== 'MemberExpression') return undefined;
  const keyword = KEYWORDS.get(staticProperty(node.tag));
  if (!keyword) return undefined;
  const scenario = fluentReceiver(node.tag.object, scenarioBindings, context);
  if (scenario) return { keyword, feature: scenario.feature, scenario };
  return undefined;
}

function featureImports(program, fileName) {
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
      if (imported === 'feature') scenarioBindings.set(specifier.local.name, { feature, specifier });
    }
  }

  return scenarioBindings;
}

const validStepTemplate = {
  meta: {
    type: 'problem',
    docs: { description: 'Check tagged step text against the imported Gherkin feature' },
    schema: [],
  },
  createOnce(context) {
    let scenarioBindings = new Map();

    return {
      before() {
        scenarioBindings = new Map();
      },
      Program(program) {
        scenarioBindings = featureImports(program, context.filename);
      },
      TaggedTemplateExpression(node) {
        const tag = stepTag(node, scenarioBindings, context);
        if (!tag) return;

        const scenario = tag.scenario;
        const expectedSteps = scenario.steps?.slice(scenario.stepIndex, scenario.stepIndex + 1) ?? [];
        const isValid = expectedSteps.some(step =>
          (tag.keyword === 'step' || step.keyword === tag.keyword) && matchesStepTemplate(node.quasi.quasis, step.text));
        if (isValid) return;

        const expected = expectedSteps[0];
        context.report({
          node: node.quasi,
          message: scenario && expected
            ? `Scenario ${JSON.stringify(scenario.scenarioName)}, step ${scenario.stepIndex + 1} must match ${expected.sourceKeyword} ${JSON.stringify(expected.text)}`
            : expected
              ? `Step template does not match the feature step: ${expected.sourceKeyword} ${JSON.stringify(expected.text)}`
            : `The feature has no ${tag.keyword} step matching this template`,
        });
      },
    };
  },
};

const formatFluentChain = {
  meta: {
    type: 'layout',
    docs: { description: 'Format tagged fluent steps from an imported Gherkin feature' },
    fixable: 'code',
    schema: [],
  },
  createOnce(context) {
    let scenarioBindings = new Map();

    return {
      before() {
        scenarioBindings = new Map();
      },
      Program(program) {
        scenarioBindings = featureImports(program, context.filename);
      },
      CallExpression(node) {
        if (isFluentReceiver(node)) return;
        const chain = taggedFluentChain(node, scenarioBindings, context);
        if (!chain) return;

        if (context.sourceCode.getAllComments().some(comment =>
          comment.range[0] >= chain.base.range[0] && comment.range[1] <= node.range[1])) return;

        const formatted = formatTaggedFluentChain(chain, context);
        if (formatted === context.sourceCode.getText(node)) return;

        context.report({
          node,
          message: 'Put each tagged fluent step on its own line',
          fix(fixer) {
            return fixer.replaceText(node, formatted);
          },
        });
      },
    };
  },
};

export default {
  meta: { name: 'gherkin-feature' },
  rules: {
    'valid-step-template': validStepTemplate,
    'format-fluent-chain': formatFluentChain,
  },
};
