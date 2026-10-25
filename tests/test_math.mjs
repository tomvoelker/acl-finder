import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { renderTitle, titleSegments, titleSearchText } from '../math-titles.mjs';

// A deliberately small DOM adapter exercises KaTeX's public DOM renderer with
// no HTML parser. Browser layout is covered by the application's visual check.
class Node {
  constructor(name, ownerDocument, text = '') {
    this.nodeName = name;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.text = text;
  }
  appendChild(node) {
    if (node.nodeName === '#fragment') this.children.push(...node.children);
    else this.children.push(node);
    return node;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...children) { this.children = children; this.text = ''; }
  set textContent(value) { this.children = []; this.text = value; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  set innerHTML(_value) { throw new Error('No HTML injection is permitted'); }
}
const document = {
  compatMode: 'CSS1Compat',
  createElement(name) { return new Node(name, this); },
  createElementNS(_namespace, name) { return new Node(name, this); },
  createTextNode(text) { return new Node('#text', this, text); },
  createDocumentFragment() { return new Node('#fragment', this); },
};
globalThis.document = document;
const all = node => [node, ...node.children.flatMap(all)];

test('segments adjacent superscripts, Greek, and parenthesis delimiters', () => {
  assert.deepEqual(titleSegments('E$^3$ and $\\lambda$ or \\(x_2\\)'), [
    { type: 'text', text: 'E' },
    { type: 'math', text: '^3', raw: '$^3$' },
    { type: 'text', text: ' and ' },
    { type: 'math', text: '\\lambda', raw: '$\\lambda$' },
    { type: 'text', text: ' or ' },
    { type: 'math', text: 'x_2', raw: '\\(x_2\\)' },
  ]);
});

test('unmatched, escaped, display, empty, and ordinary price dollars stay literal', () => {
  for (const text of ['Costs $5', '$5 and $10', '\\$x\\$', '$$x$$', '$ x $', '$x\ny$', '\\(x', '']) {
    assert.equal(titleSearchText(text), text);
    assert.ok(titleSegments(text).every(part => part.type === 'text'));
  }
  assert.equal(titleSearchText('a $x\\$y$ b'), 'a x$y b');
});

test('search text includes rendered Greek, text commands, adjacent exponents, and angle aliases', () => {
  assert.equal(titleSearchText('$\\lambda$-Diffusion and $\\sigma$'), 'λ-Diffusion and σ');
  assert.equal(titleSearchText('E$^3$ $A^{2}$ M${}^3$EC'), 'E3 A2 M3EC');
  assert.equal(titleSearchText('$\\text{GR}^2$ and $\\mathit{not}$'), 'GR2 and not');
  assert.equal(titleSearchText('$\\textlangle \\tt /think \\textrangle$'), '⟨/think⟩');
  assert.equal(titleSearchText('$a < b$'), 'a<b');
});

test('renders real superscripts and accessible MathML without passing formulas to highlighter', () => {
  const container = document.createElement('h3');
  const highlighted = [];
  renderTitle(container, 'E$^3$ with $\\lambda$', (node, text) => {
    highlighted.push(text);
    const mark = document.createElement('mark');
    mark.appendChild(document.createTextNode(text));
    node.appendChild(mark);
  });
  assert.deepEqual(highlighted, ['E', ' with ']);
  assert.equal(all(container).filter(node => node.className === 'title-math').length, 2);
  assert.equal(all(container).filter(node => node.nodeName === 'math').length, 2);
  assert.ok(all(container).some(node => node.nodeName === 'msup'));
  assert.ok(all(container).some(node => node.attributes['aria-hidden'] === 'true'));
  renderTitle(container, 'replacement');
  assert.equal(container.textContent, 'replacement');
});

test('plain markup stays literal and invalid formulas gracefully retain source', () => {
  const literal = '<img src=x onerror=alert(1)> & <script>bad()</script>';
  const bad = '$\\unknowncommand{x}$';
  const container = document.createElement('h3');
  renderTitle(container, `${literal} ${bad}`);
  assert.equal(container.textContent, `${literal} ${bad}`);
  assert.ok(all(container).every(node => !['img', 'script'].includes(node.nodeName)));
  assert.equal(titleSearchText(bad), bad);
});

test('a replacing highlighter preserves alternating text, math, and fallback segments', () => {
  const container = document.createElement('h3');
  const source = 'Before $\\lambda$-Diffusion with $x^2$ and $\\unknowncommand$ after';
  renderTitle(container, source, (node, text) => { node.textContent = text; });
  assert.equal(container.children.length, 7);
  assert.deepEqual(container.children.filter(node => node.className !== 'title-math')
    .map(node => node.textContent), ['Before ', '-Diffusion with ', ' and ', '$\\unknowncommand$', ' after']);
  assert.equal(all(container).filter(node => node.nodeName === 'math').length, 2);
  assert.ok(all(container).some(node => node.nodeName === 'mi' && node.textContent === 'λ'));
  assert.ok(all(container).some(node => node.nodeName === 'msup'));
  renderTitle(container, '$\\lambda$-Diffusion Language Models: Controllable Generalization',
    (node, text) => { node.textContent = text; });
  assert.ok(all(container).some(node => node.nodeName === 'mi' && node.textContent === 'λ'));
  assert.equal(container.children.at(-1).textContent,
    '-Diffusion Language Models: Controllable Generalization');
});

test('untrusted URLs and HTML attributes cannot create active DOM', () => {
  for (const formula of [
    '\\href{javascript:alert(1)}{click}',
    '\\includegraphics{https://example.org/track}',
    '\\htmlClass{unsafe}{x}',
    '\\htmlStyle{position:fixed}{x}',
  ]) {
    const container = document.createElement('h3');
    renderTitle(container, `$${formula}$`);
    assert.ok(all(container).every(node => !['a', 'img'].includes(node.nodeName)));
    assert.ok(all(container).every(node => !node.attributes.href && !node.attributes.src));
    assert.ok(all(container).every(node => node.className !== 'unsafe'));
  }
});

test('expansion and length are bounded and macros cannot leak between formulas', () => {
  for (const source of ['$\\def\\loop{\\loop}\\loop$', `$${'x'.repeat(2049)}$`]) {
    assert.equal(titleSearchText(source), source);
    const container = document.createElement('h3');
    renderTitle(container, source);
    assert.equal(container.textContent, source);
  }
  titleSearchText('$\\gdef\\private{x}\\private$');
  assert.equal(titleSearchText('$\\private$'), '$\\private$');
});

test('the pinned stylesheet has every referenced self-hosted font', () => {
  const root = new URL('../vendor/katex-0.19.1/', import.meta.url);
  const css = readFileSync(new URL('katex.min.css', root), 'utf8');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(existsSync(new URL(url, root)), url);
  assert.ok(existsSync(new URL('LICENSE', root)));
});

test('all current programme titles with math render without a literal fallback', () => {
  const data = JSON.parse(readFileSync(new URL('../data/papers.json', import.meta.url), 'utf8'));
  const titles = data.papers.filter(paper => paper.title.includes('$') || paper.title.includes('\\('));
  assert.ok(titles.length > 0);
  for (const { title } of titles) {
    const container = document.createElement('h3');
    const plain = [];
    renderTitle(container, title, (node, text) => {
      plain.push(text);
      node.appendChild(document.createTextNode(text));
    });
    assert.ok(all(container).some(node => node.nodeName === 'math'), title);
    assert.ok(plain.every(text => !text.includes('$')), title);
    assert.ok(!titleSearchText(title).includes('$'), title);
  }
});
