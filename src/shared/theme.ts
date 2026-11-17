/**
 * The Living Garden: Atrium's one design system. Six palette colours; everything else is a
 * named shade of them. theme.css mirrors these as CSS variables for the HTML pages.
 */

export const PALETTE = {
  ivory: '#F4F0E6',
  forest: '#173D32',
  gold: '#B99A62',
  charcoal: '#26332D',
  sage: '#DCE7D9',
  terracotta: '#C98265',
} as const;

/** The VR sanctuary: deep forest and charcoal, natural dark materials, gold light. */
export const SCENE = {
  sky: '#0E1A15', // background + fog: darker than charcoal so the room reads as enclosed
  floor: '#22302A',
  inlay: '#8C7448', // muted gold, darkened, for the floor ring under the chair
  wall: PALETTE.forest,
  ceiling: '#16211C',
  oculus: '#25463E', // dusk seen through the open roof
  niche: '#1B2722', // recessed: darker than the trim so each alcove reads as a niche
  trim: '#3D5A4D',
  pedestal: '#6B7D71', // sage stone: the stage the dioramas stand on
  veil: '#2C4A3E',
  veilSheen: PALETTE.forest,
  fern: '#2F5A45',
  fernTip: '#4C7A5C',
  lightSky: '#FFF0CF', // warm sunlight from the oculus
  lightGround: '#3A3324',
  fade: '#0B1410',
  cardBase: '#C9D6C5',
} as const;

/** The rotunda's architecture (after the palace mockup): green marble, gold trim, ivy, a sunlit oculus. */
export const DECOR = {
  gold: '#C9A259',
  goldEmissive: '#8A6526',
  goldLine: '#E2C27A',
  capTop: '#CDBF9B',
  emblemTint: '#FFFFFF',
  banner: '#1F4A3A',
  bannerDark: '#122C22',
  leafDark: '#2F5A2A',
  leafLight: '#8DB850',
  sunCore: '#FFFBE8',
  sunMid: '#F6DC8E',
  floor: '#122A1F',
  floorLight: '#24493A',
  forestSky: '#E9E7B4',
  forestMid: '#8DB062',
  forestDeep: '#2C4A24',
  /** Multipliers that dim the painted forest and canopy to a dusk under the dark green arcade. */
  forestShade: '#6F8466',
  canopyShade: '#B9C2A0',
} as const;

/** The lantern: Atrium's signature. Unlit charcoal → muted gold → warm ivory-gold at full. */
export const LANTERN = {
  unlit: '#2C3832',
  /** Multiplies the painted lantern: unlit reads as dark bronze, still clearly a lantern. */
  unlitArt: '#59645C',
  lit: '#F6E7C1',
  glowCore: 'rgba(246, 231, 193, 1)',
  glowMid: 'rgba(185, 154, 98, 0.55)',
  glowEdge: 'rgba(185, 154, 98, 0)',
  mote: '#E9D3A0',
} as const;

/** In-world panels: charcoal-forest glass-free surfaces, ivory text, gold hairlines. */
export const PANEL = {
  bg: 'rgba(22, 36, 30, 0.9)',
  bgStrong: 'rgba(16, 27, 22, 0.96)',
  button: 'rgba(38, 51, 45, 0.94)',
  buttonHover: 'rgba(23, 61, 50, 0.98)',
  fg: PALETTE.ivory,
  muted: '#B9C7B6',
  title: PALETTE.gold,
  hairline: 'rgba(185, 154, 98, 0.45)',
  focus: PALETTE.gold,
  attention: PALETTE.terracotta,
} as const;

export const FONT = {
  display: '"Fraunces Variable", "Iowan Old Style", Georgia, serif',
  body: '"Source Sans 3 Variable", "Segoe UI", system-ui, sans-serif',
} as const;
