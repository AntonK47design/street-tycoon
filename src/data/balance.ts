/** All tunable numbers. Systems never hard-code gameplay values. */
export const BALANCE = {
  /** Fixed simulation rate (ticks per second). */
  SIM_HZ: 10,

  start: {
    cash: 5,
    seed: 20251,
    /** Game clock at the very first start (minutes since midnight). */
    clockMin: 11 * 60 + 35,
    /** Pedestrians already heading to the first cart when the game starts. */
    firstCustomers: 2,
  },

  /** Game clock. One game day runs dayStartMin → dayEndMin, then the next day starts. */
  clock: {
    realSecPerGameHour: 45,
    dayStartMin: 8 * 60,
    dayEndMin: 20 * 60,
  },

  /** Hunger multiplier by game hour (linear interpolation between points). */
  hungerByHour: [
    [8, 0.6],
    [10, 0.75],
    [11.5, 1.15],
    [12.5, 1.45],
    [14, 0.95],
    [16, 0.8],
    [17.5, 1.15],
    [18.5, 1.35],
    [20, 0.9],
  ] as ReadonlyArray<readonly [number, number]>,
  /** Above this hunger multiplier the HUD shows a "rush" badge. */
  rushThreshold: 1.25,

  peds: {
    /** Target population by quality tier (render budget). The sim scales demand so economy is tier-independent. */
    populationByTier: { low: 45, medium: 70, high: 90 },
    /** Population that the economy is balanced for (demand is scaled by balancePopulation / actual). */
    balancePopulation: 70,
    speedMin: 1.15,
    speedMax: 1.6,
    /** Lateral offset range on a sidewalk (m) so people don't walk in one line. */
    laneSpread: 0.9,
    /** Edges walked before a pedestrian heads for the district border to leave. */
    minEdges: 4,
    maxEdges: 10,
    spawnPerSec: 3,
  },

  customers: {
    /** Customers per second at a spot with traffic 1, appeal 3★, fair price, hunger 1. */
    baseRate: 0.2,
    /** Arrival rate bonus per Neon Sign level. */
    signRate: 0.08,
    /** Appeal multiplier = appealBase + appealSlope * stars. */
    appealBase: 0.25,
    appealSlope: 0.25,
    /** Price elasticity: chance × (fair / price)^elasticity, capped. */
    elasticity: 1.5,
    priceMultMax: 2.2,
    priceMultMin: 0.04,
    maxQueue: 6,
    /** Chance multiplier per person already in the queue. */
    queuePenalty: 0.86,
    /** Same-kitchen carts closer than this compete. */
    competitionRadius: 26,
    competitionMult: 0.72,
    patienceSec: 28,
    /** Customers spawned for the tutorial never give up. */
    queueSpacing: 0.95,
    tipChanceByQuality: [0.0, 0.2, 0.45],
    tipFraction: 0.3,
  },

  cart: {
    /** Radius (m) from which passers-by are recruited as customers. */
    baseReach: 22,
    serveSec: 2.6,
    batchSize: 3,
    /** Max stock as a multiple of batch size. */
    stockBatches: 2,
    suppliesCap: 30,
    startSupplies: 30,
    /** Cleanliness lost per sale (0..100). */
    dirtPerSale: 2.2,
    cleanSec: 1.2,
    /** Litter visuals start below this cleanliness. */
    litterBelow: 72,
    /** Minimum price step and range. */
    priceStep: 0.5,
    priceMinFactor: 0.4,
    priceMaxFactor: 3,
  },

  appeal: {
    wClean: 0.3,
    wLocation: 0.3,
    wPrice: 0.25,
    wTaste: 0.15,
    /** Taste score by last cook quality (ok/good/perfect). */
    tasteByQuality: [0.45, 0.75, 1],
    /** Price score = 1 at ≤ fair×priceSweet, 0 at fair×priceSour. */
    priceSweet: 0.9,
    priceSour: 2,
  },

  minigame: {
    /** Seconds per full sweep of the marker (left → right). */
    sweepSec: 1.05,
    /** Zone half widths (fraction of bar). */
    perfectHalf: 0.06,
    goodHalf: 0.17,
    /** The minigame auto-resolves as OK after this long. */
    timeoutSec: 4,
    /** Extra portions for a perfect cook. */
    perfectBonus: 1,
  },

  carts: {
    /** Price of the n-th additional cart (index 0 = second cart). */
    costs: [110, 380, 1100, 3000, 7500, 16000],
  },

  /** Free crate when cash, stock and supplies are all gone (anti soft-lock). */
  rescueSupplies: 12,

  save: {
    autosaveSec: 30,
  },

  /** Rolling window for "income per minute". */
  incomeWindowSec: 60,
} as const;

export type Balance = typeof BALANCE;
