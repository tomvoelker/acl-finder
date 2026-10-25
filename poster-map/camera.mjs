// SVG viewBox geometry. All distances are map units except viewport and pan deltas.
const PADDING = 24;
const MAX_ZOOM = 8;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const positive = value => Number.isFinite(value) && value > 0 ? value : 1;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

function dimensions(bounds, viewport) {
  return {
    mapWidth: positive(bounds.width), mapHeight: positive(bounds.height),
    width: positive(viewport.width), height: positive(viewport.height),
  };
}

/** Fit the complete map, with 24 screen pixels of padding where space permits. */
export function fitView(bounds, viewport) {
  const {mapWidth, mapHeight, width, height} = dimensions(bounds, viewport);
  // Tiny or temporarily hidden containers must still produce a finite viewBox.
  const padding = Math.min(PADDING, width / 4, height / 4);
  const scale = Math.min((width - 2 * padding) / mapWidth, (height - 2 * padding) / mapHeight);
  const viewWidth = width / scale, viewHeight = height / scale;
  return {x: (mapWidth - viewWidth) / 2, y: (mapHeight - viewHeight) / 2, width: viewWidth, height: viewHeight};
}

/** Keep the viewport aspect, a 1–8x zoom range, and accessible map edges. */
export function constrainView(view, bounds, viewport) {
  const fit = fitView(bounds, viewport);
  const {mapWidth, mapHeight, width: screenWidth, height: screenHeight} = dimensions(bounds, viewport);
  const width = clamp(positive(view.width), fit.width / MAX_ZOOM, fit.width);
  const height = width * screenHeight / screenWidth;
  const centerX = finite(view.x, fit.x) + positive(view.width) / 2;
  const centerY = finite(view.y, fit.y) + positive(view.height) / 2;
  const margin = Math.min(PADDING, screenWidth / 4, screenHeight / 4) * width / screenWidth;
  const axis = (center, size, mapSize) => size >= mapSize + margin * 2
    ? (mapSize - size) / 2
    : clamp(center - size / 2, -margin, mapSize - size + margin);
  return {x: axis(centerX, width, mapWidth), y: axis(centerY, height, mapHeight), width, height};
}

/** A factor below one zooms in around a normalized screen anchor. */
export function zoomAt(view, factor, anchor, bounds, viewport) {
  const current = constrainView(view, bounds, viewport);
  const fit = fitView(bounds, viewport);
  const width = clamp(current.width * positive(factor), fit.width / MAX_ZOOM, fit.width);
  const ratio = width / current.width;
  const ax = clamp(finite(anchor.x, 0.5), 0, 1), ay = clamp(finite(anchor.y, 0.5), 0, 1);
  const height = current.height * ratio;
  return constrainView({
    x: current.x + (current.width - width) * ax,
    y: current.y + (current.height - height) * ay,
    width, height,
  }, bounds, viewport);
}

/** Combine pinch scale and moving midpoint before applying edge constraints.
 * Anchors are normalized screen coordinates and may extend beyond the viewport
 * while captured pointers move outside it.
 */
export function pinchAt(view, factor, startAnchor, endAnchor, bounds, viewport) {
  const fit = fitView(bounds, viewport);
  const currentWidth = Number.isFinite(view.width) && view.width > 0 ? view.width : fit.width;
  const currentHeight = Number.isFinite(view.height) && view.height > 0 ? view.height : fit.height;
  const width = clamp(currentWidth * positive(factor), fit.width / MAX_ZOOM, fit.width);
  const height = width * positive(viewport.height) / positive(viewport.width);
  return constrainView({
    x: finite(view.x, fit.x) + currentWidth * finite(startAnchor.x, 0.5) - width * finite(endAnchor.x, 0.5),
    y: finite(view.y, fit.y) + currentHeight * finite(startAnchor.y, 0.5) - height * finite(endAnchor.y, 0.5),
    width, height,
  }, bounds, viewport);
}

/** Screen-pixel drag deltas move the content in the direction of the drag. */
export function panBy(view, delta, bounds, viewport) {
  const current = constrainView(view, bounds, viewport);
  return constrainView({
    ...current,
    x: current.x - finite(delta.x, 0) * current.width / positive(viewport.width),
    y: current.y - finite(delta.y, 0) * current.height / positive(viewport.height),
  }, bounds, viewport);
}

/** Preserve map center and relative zoom when container size or orientation changes. */
export function resizeView(view, previousViewport, nextViewport, bounds) {
  const current = constrainView(view, bounds, previousViewport);
  const oldFit = fitView(bounds, previousViewport), nextFit = fitView(bounds, nextViewport);
  const width = nextFit.width * current.width / oldFit.width;
  const height = width * positive(nextViewport.height) / positive(nextViewport.width);
  return constrainView({
    x: current.x + current.width / 2 - width / 2,
    y: current.y + current.height / 2 - height / 2,
    width, height,
  }, bounds, nextViewport);
}
