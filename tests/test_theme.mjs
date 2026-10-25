import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
const key = 'emnlp2026-finder.theme';

function page({ dark = false, saved = null, storageBlocked = false } = {}) {
  const values = new Map(saved === null ? [] : [[key, saved]]);
  const events = {};
  const root = { dataset: {} };
  const control = {
    hidden: true, dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener: (type, fn) => { events[type] = fn; },
  };
  const system = { matches: dark, addEventListener: (_, fn) => { events.system = fn; } };
  const localStorage = {
    getItem(k) { if (storageBlocked) throw new Error('Storage blocked'); return values.get(k) ?? null; },
    setItem(k, v) { if (storageBlocked) throw new Error('Storage blocked'); values.set(k, v); },
    removeItem(k) { if (storageBlocked) throw new Error('Storage blocked'); values.delete(k); },
  };
  runInNewContext(source, {
    localStorage,
    window: { matchMedia: () => system },
    document: {
      documentElement: root,
      querySelector: () => control,
      addEventListener: (_, fn) => { events.ready = fn; },
    },
  });
  return {
    root, control, values,
    ready: () => events.ready(),
    systemChange(dark) { system.matches = dark; events.system(); },
    click: () => events.click(),
  };
}

test('system theme applies before DOM readiness and follows system changes in Auto', () => {
  const p = page({ dark: true });
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.control.hidden, true);
  p.ready();
  assert.equal(p.control.hidden, false);
  assert.equal(p.control.dataset.mode, 'auto');
  assert.match(p.control.attributes['aria-label'], /Auto \(system\).*Switch to Light/);
  p.systemChange(false);
  assert.equal(p.root.dataset.theme, 'light');
});

test('saved theme overrides the system on first paint and subsequent system changes', () => {
  for (const [saved, dark] of [['light', true], ['dark', false]]) {
    const p = page({ saved, dark });
    assert.equal(p.root.dataset.theme, saved);
    p.ready();
    assert.equal(p.control.dataset.mode, saved);
    assert.match(p.control.attributes['aria-label'], new RegExp(`Theme: ${saved === 'light' ? 'Light' : 'Dark'}`));
    p.systemChange(!dark);
    p.systemChange(dark);
    assert.equal(p.root.dataset.theme, saved);
  }
});

test('manual choices persist; switching back to Auto removes the override', () => {
  const p = page({ dark: false });
  p.ready();
  p.click();
  assert.equal(p.root.dataset.theme, 'light');
  assert.equal(p.values.get(key), 'light');
  assert.match(p.control.attributes['aria-label'], /Theme: Light/);
  assert.match(p.control.title, /Switch to Dark/);
  p.click();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(p.values.get(key), 'dark');
  assert.match(p.control.attributes['aria-label'], /Theme: Dark.*Switch to Auto/);
  assert.equal(page({ saved: p.values.get(key) }).root.dataset.theme, 'dark');
  p.click();
  assert.equal(p.values.has(key), false);
  assert.equal(p.root.dataset.theme, 'light');
  p.systemChange(true);
  assert.equal(p.root.dataset.theme, 'dark');
});

test('theme control works without storage, and invalid saved choices use the system', () => {
  const p = page({ dark: true, storageBlocked: true });
  assert.equal(p.root.dataset.theme, 'dark');
  p.ready();
  p.click();
  assert.equal(p.root.dataset.theme, 'light');
  p.click();
  assert.equal(p.root.dataset.theme, 'dark');
  p.click();
  assert.equal(p.root.dataset.theme, 'dark');
  assert.equal(page({ saved: 'unexpected', dark: true }).root.dataset.theme, 'dark');
});
