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

// Flattens `root.a(...).b\`...\`(...)(...)` into its root and ordered links.
// Each link keeps the member that names it and the offset where it ends.
function chainLinks(node) {
  const links = [];
  let current = node;

  while (current?.type === 'CallExpression') {
    const callee = current.callee;
    let member;
    if (callee.type === 'MemberExpression') member = callee;
    else if (callee.type === 'TaggedTemplateExpression' && callee.tag.type === 'MemberExpression') member = callee.tag;
    else if (callee.type === 'CallExpression' && callee.callee.type === 'MemberExpression') member = callee.callee;
    else break;

    links.unshift({ member, end: current.range[1] });
    current = member.object;
  }

  return { root: current, links };
}

function isChainPart(node) {
  const parent = node.parent;
  return (parent?.type === 'MemberExpression' && parent.object === node)
    || (parent?.type === 'CallExpression' && parent.callee === node);
}

function lineIndent(source, offset) {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] ?? '';
}

// Shift continuation lines by the same amount as their link's first line.
// Template literal lines are kept as written, because their whitespace is data.
function shiftLines(text, offset, delta, tokens) {
  let lineOffset = offset;
  return text.split('\n').map((line, index) => {
    const start = lineOffset;
    lineOffset += line.length + 1;
    const inTemplate = tokens.some(token => token.type === 'Template' && token.range[0] < start && start < token.range[1]);
    if (index === 0 || !line.trim() || inTemplate) return line;
    if (delta >= 0) return `${' '.repeat(delta)}${line}`;
    const leading = line.match(/^[\t ]*/)[0].length;
    return line.slice(Math.min(leading, -delta));
  }).join('\n');
}

// Step links (Given, When, Then, And, But, Step) sit one level under their scenario.
// Structural links (feature, scenario, rule, background, run) sit one level under the root.
function formatChain(node, root, links, context) {
  const source = context.sourceCode.text;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const tokens = context.sourceCode.getTokens(node, { includeComments: true });
  const baseIndent = lineIndent(source, node.range[0]);
  let formatted = context.sourceCode.getText(root);

  for (const link of links) {
    const isStep = KEYWORDS.has(staticProperty(link.member));
    const indent = `${baseIndent}${isStep ? '    ' : '  '}`;
    const start = link.member.object.range[1];
    const segment = source.slice(start, link.end);
    const dotOffset = start + segment.length - segment.trimStart().length;
    const delta = indent.length - lineIndent(source, dotOffset).length;
    const text = shiftLines(source.slice(dotOffset, link.end), dotOffset, delta, tokens);
    formatted += `${eol}${indent}${text}`;
  }

  return formatted;
}

const formatFluentChain = {
  meta: {
    type: 'layout',
    docs: { description: 'Put each link of an imported Gherkin feature chain on its own line' },
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
        if (isChainPart(node)) return;
        const { root, links } = chainLinks(node);
        if (!links.some(link => KEYWORDS.has(staticProperty(link.member)))) return;
        if (!importedFeature(root, scenarioBindings, context)) return;

        if (context.sourceCode.getAllComments().some(comment =>
          comment.range[0] >= node.range[0] && comment.range[1] <= node.range[1])) return;

        const formatted = formatChain(node, root, links, context);
        if (formatted === context.sourceCode.getText(node)) return;

        context.report({
          node,
          message: 'Put each feature chain link on its own line',
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
