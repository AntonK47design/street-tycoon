/** Pedestrian record (pooled, transient — never saved). */
export enum PedState {
  Off = 0,
  Walk = 1,
  ToCart = 2,
  Queue = 3,
  Leave = 4,
}

export enum Mood {
  None = 0,
  Happy = 1,
  Angry = 2,
}

export interface Ped {
  idx: number;
  state: PedState;
  /** Current and previous-tick position/heading (render interpolates). */
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  pheading: number;
  /** Distance walked (drives the walk-cycle phase). */
  stride: number;
  pstride: number;
  /** 1 while moving, 0 while standing (render blends the walk cycle). */
  moving: number;
  speed: number;
  lane: number;
  /** Edge a→b, distance s along it. */
  a: number;
  b: number;
  s: number;
  len: number;
  edgesLeft: number;
  /** Carts already considered on this edge (bit per cart index). */
  checked: number;
  cart: number;
  slot: number;
  patience: number;
  /** Customers that never give up (first customers of a new game). */
  vip: boolean;
  mood: Mood;
  moodT: number;
  /** Fade 0..1 when appearing/leaving at the border. */
  fade: number;
  leaving: boolean;
  /** Appearance seed (colours, body size). */
  look: number;
  /** Bumped every time the record is reused, so the view can detect respawns. */
  gen: number;
}

export function makePed(idx: number): Ped {
  return {
    idx,
    state: PedState.Off,
    x: 0,
    z: 0,
    px: 0,
    pz: 0,
    heading: 0,
    pheading: 0,
    stride: 0,
    pstride: 0,
    moving: 0,
    speed: 1.3,
    lane: 0,
    a: 0,
    b: 0,
    s: 0,
    len: 1,
    edgesLeft: 0,
    checked: 0,
    cart: -1,
    slot: 0,
    patience: 0,
    vip: false,
    mood: Mood.None,
    moodT: 0,
    fade: 0,
    leaving: false,
    look: 0,
    gen: 0,
  };
}
