import test from 'node:test';
import assert from 'node:assert/strict';
import {fitView, constrainView, zoomAt, pinchAt, panBy, resizeView} from '../camera.mjs';

const bounds = {width: 1320, height: 1280};
const viewport = {width: 1000, height: 800};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const center = view => ({x: view.x + view.width / 2, y: view.y + view.height / 2});
const point = (view, anchor) => ({x: view.x + view.width * anchor.x, y: view.y + view.height * anchor.y});

test('fit includes the complete map with screen padding in portrait and landscape', () => {
  for (const screen of [viewport, {width: 390, height: 844}, {width: 1600, height: 500}]) {
    const view = fitView(bounds, screen);
    close(view.width / view.height, screen.width / screen.height);
    close(center(view).x, bounds.width / 2);
    close(center(view).y, bounds.height / 2);
    assert.ok(-view.x * screen.width / view.width >= 24 - 1e-8);
    assert.ok(-view.y * screen.height / view.height >= 24 - 1e-8);
    assert.ok(view.x + view.width >= bounds.width);
    assert.ok(view.y + view.height >= bounds.height);
  }
});

test('zoom keeps an off-center anchor on the same map point away from edges', () => {
  const current = zoomAt(fitView(bounds, viewport), 0.4, {x: 0.5, y: 0.5}, bounds, viewport);
  const anchor = {x: 0.23, y: 0.71};
  const before = point(current, anchor);
  const after = point(zoomAt(current, 0.7, anchor, bounds, viewport), anchor);
  close(after.x, before.x);
  close(after.y, before.y);
});

test('pan converts screen drag exactly and content follows the finger', () => {
  const current = zoomAt(fitView(bounds, viewport), 0.25, {x: 0.5, y: 0.5}, bounds, viewport);
  const delta = {x: 37, y: -29};
  const moved = panBy(current, delta, bounds, viewport);
  close(moved.x, current.x - delta.x * current.width / viewport.width);
  close(moved.y, current.y - delta.y * current.height / viewport.height);
  close(moved.width, current.width);
});

test('pinch follows a moving midpoint without clipping the intermediate scale', () => {
  const width = fitView(bounds, viewport).width / 4;
  const current = {x: 0, y: 400, width, height: width * viewport.height / viewport.width};
  const start = {x: 0.5, y: 0.5}, end = {x: 0.2, y: 0.5};
  const result = pinchAt(current, 2, start, end, bounds, viewport);
  // Scaling alone crosses the left bound, but the combined transform is valid.
  close(result.x, width * 0.1);
  close(point(result, end).x, point(current, start).x);
  close(point(result, end).y, point(current, start).y);
});

test('pinch preserves the map point under its moving midpoint while zooming in', () => {
  const current = zoomAt(fitView(bounds, viewport), 0.4, {x: 0.5, y: 0.5}, bounds, viewport);
  const start = {x: 0.3, y: 0.65}, end = {x: 0.58, y: 0.35};
  const result = pinchAt(current, 0.65, start, end, bounds, viewport);
  close(point(result, end).x, point(current, start).x);
  close(point(result, end).y, point(current, start).y);
  close(result.width, current.width * 0.65);
});

test('zoom limits hold and extreme pans retain map edges', () => {
  const fit = fitView(bounds, viewport);
  const near = zoomAt(fit, 1e-20, {x: 0.5, y: 0.5}, bounds, viewport);
  close(near.width, fit.width / 8);
  assert.deepEqual(zoomAt(near, 1e20, {x: 0.5, y: 0.5}, bounds, viewport), fit);
  for (const direction of [-1, 1]) {
    const moved = panBy(near, {x: direction * 1e9, y: direction * 1e9}, bounds, viewport);
    assert.ok(moved.x < bounds.width && moved.x + moved.width > 0);
    assert.ok(moved.y < bounds.height && moved.y + moved.height > 0);
  }
});

test('orientation changes preserve center and relative zoom instead of resetting', () => {
  const portrait = {width: 390, height: 844};
  const landscape = {width: 844, height: 390};
  const current = panBy(zoomAt(fitView(bounds, portrait), 0.25, {x: 0.5, y: 0.5}, bounds, portrait), {x: 12, y: 15}, bounds, portrait);
  const resized = resizeView(current, portrait, landscape, bounds);
  close(center(resized).x, center(current).x);
  close(center(resized).y, center(current).y);
  close(resized.width / fitView(bounds, landscape).width, 0.25);
  close(resized.width / resized.height, landscape.width / landscape.height);
  const restored = resizeView(resized, landscape, portrait, bounds);
  for (const key of ['x', 'y', 'width', 'height']) close(restored[key], current[key]);
});

test('operations return fresh objects and remain finite for transient zero-size containers', () => {
  const view = Object.freeze(fitView(bounds, viewport));
  assert.notEqual(constrainView(view, bounds, viewport), view);
  const hidden = {width: 0, height: 0};
  for (const result of [fitView(bounds, hidden), resizeView(view, viewport, hidden, bounds), panBy(view, {x: NaN, y: Infinity}, bounds, viewport)]) {
    assert.ok(Object.values(result).every(Number.isFinite));
    assert.ok(result.width > 0 && result.height > 0);
  }
});
