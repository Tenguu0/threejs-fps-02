// The look plan, in one place. A dusk depot: cold slate, warm amber accent for the Ember
// side and the spike, pale ink for the Vanguard side, red only for damage and danger.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  vanguard: '#8fb8d8',
  ember: '#e07840',
  danger: '#d95f4b',
};

export function shade(name) {
  return PALETTE[name];
}
