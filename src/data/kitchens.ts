export type KitchenId = 'hotdog' | 'burger' | 'sushi' | 'crepe' | 'fishchips' | 'pizza' | 'burrito';

export interface KitchenDef {
  id: KitchenId;
  /** Fair price at recipe level 0. */
  fairPrice: number;
  /** Ingredient cost per portion. */
  ingredientCost: number;
  /** Cart body colours (hex) — used by the renderer. */
  body: number;
  trim: number;
  /** Minigame flavour: which visual the timing bar uses. */
  minigame: 'grill' | 'flip' | 'roll' | 'spread' | 'fry' | 'oven' | 'wrap';
  /** Unlocked from Phase 2 on; Phase 1 only offers hotdog. */
  available: boolean;
}

export const KITCHENS: Record<KitchenId, KitchenDef> = {
  hotdog: { id: 'hotdog', fairPrice: 5, ingredientCost: 1.2, body: 0xd9573f, trim: 0xf3e3c3, minigame: 'grill', available: true },
  burger: { id: 'burger', fairPrice: 8, ingredientCost: 2.1, body: 0x3f7fb0, trim: 0xf2d27a, minigame: 'flip', available: false },
  sushi: { id: 'sushi', fairPrice: 12, ingredientCost: 3.4, body: 0x2f2f38, trim: 0xe8d9c0, minigame: 'roll', available: false },
  crepe: { id: 'crepe', fairPrice: 7, ingredientCost: 1.6, body: 0xe9a2b4, trim: 0xfff4e0, minigame: 'spread', available: false },
  fishchips: { id: 'fishchips', fairPrice: 9, ingredientCost: 2.5, body: 0x2f7a6d, trim: 0xf6f0de, minigame: 'fry', available: false },
  pizza: { id: 'pizza', fairPrice: 10, ingredientCost: 2.6, body: 0x9a3b2c, trim: 0xf0e2c8, minigame: 'oven', available: false },
  burrito: { id: 'burrito', fairPrice: 9, ingredientCost: 2.2, body: 0xd99a2b, trim: 0x5c3b22, minigame: 'wrap', available: false },
};
