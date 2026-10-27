/**
 * Starter ingredient catalog (DESIGN §10). `npm run db:seed` inserts any of
 * these whose name isn't already in the database.
 *
 * Conversion data comes from USDA FoodData Central, SR Legacy household
 * portions (public domain), rounded. Values are written the way USDA lists
 * them (grams per cup / tbsp / tsp, grams per item) and converted to grams
 * per millilitre here, so each line can be checked against the source.
 * "Each" weights for store-bought packages (cans, jars) are the common US
 * package size. Edit any of it on the Ingredients page.
 */
import { UNITS, type IngredientCategory } from '@meal-planner/shared';
import type { Db } from './client.js';
import { ingredients } from './schema.js';

export interface SeedIngredient {
  name: string;
  category: IngredientCategory;
  countNoun: string | null;
  gramsPerMl: number | null;
  gramsPerEach: number | null;
  isStaple: boolean;
}

interface Opts {
  /** Grams per US cup / tbsp / tsp (use one). */
  cup?: number;
  tbsp?: number;
  tsp?: number;
  /** Grams per item. */
  each?: number;
  /** Count noun when it differs from the name ("clove", "can"). */
  noun?: string;
  /** Left off the shopping list by default. */
  staple?: boolean;
}

function item(name: string, category: IngredientCategory, o: Opts = {}): SeedIngredient {
  const perMl =
    o.cup !== undefined
      ? o.cup / UNITS.cup.toBase
      : o.tbsp !== undefined
        ? o.tbsp / UNITS.tbsp.toBase
        : o.tsp !== undefined
          ? o.tsp / UNITS.tsp.toBase
          : null;
  return {
    name,
    category,
    countNoun: o.noun ?? null,
    gramsPerMl: perMl === null ? null : Math.round(perMl * 1000) / 1000,
    gramsPerEach: o.each ?? null,
    isStaple: o.staple ?? false,
  };
}

export const SEED_INGREDIENTS: SeedIngredient[] = [
  // Produce (cup values are chopped/sliced unless noted)
  item('yellow onion', 'produce', { cup: 160, each: 110 }),
  item('red onion', 'produce', { cup: 160, each: 110 }),
  item('green onion', 'produce', { cup: 100, each: 15, noun: 'stalk' }),
  item('shallot', 'produce', { tbsp: 10, each: 40 }),
  item('garlic', 'produce', { cup: 136, each: 3, noun: 'clove' }),
  item('ginger root', 'produce', { tsp: 2 }),
  item('carrot', 'produce', { cup: 128, each: 61 }),
  item('celery', 'produce', { cup: 101, each: 40, noun: 'stalk' }),
  item('russet potato', 'produce', { cup: 150, each: 213 }),
  item('sweet potato', 'produce', { cup: 133, each: 130 }),
  item('tomato', 'produce', { cup: 180, each: 123 }),
  item('cherry tomatoes', 'produce', { cup: 149, each: 17, noun: 'cherry tomato' }),
  item('bell pepper', 'produce', { cup: 149, each: 119 }),
  item('jalapeño', 'produce', { cup: 90, each: 14 }),
  item('romaine lettuce', 'produce', { cup: 47, each: 626, noun: 'head' }),
  item('spinach', 'produce', { cup: 30 }),
  item('kale', 'produce', { cup: 67 }),
  item('broccoli', 'produce', { cup: 91, each: 350, noun: 'head' }),
  item('cauliflower', 'produce', { cup: 107, each: 588, noun: 'head' }),
  item('cabbage', 'produce', { cup: 89, each: 908, noun: 'head' }),
  item('zucchini', 'produce', { cup: 124, each: 196 }),
  item('cucumber', 'produce', { cup: 119, each: 301 }),
  item('white mushrooms', 'produce', { cup: 70, each: 18, noun: 'mushroom' }),
  item('green beans', 'produce', { cup: 100 }),
  item('asparagus', 'produce', { cup: 134, each: 16, noun: 'spear' }),
  item('corn on the cob', 'produce', { cup: 154, each: 90, noun: 'ear' }),
  item('butternut squash', 'produce', { cup: 140 }),
  item('avocado', 'produce', { cup: 150, each: 201 }),
  item('lemon', 'produce', { each: 84 }),
  item('lime', 'produce', { each: 67 }),
  item('apple', 'produce', { cup: 125, each: 182 }),
  item('banana', 'produce', { cup: 225, each: 118 }),
  item('strawberries', 'produce', { cup: 144, each: 12, noun: 'strawberry' }),
  item('blueberries', 'produce', { cup: 148 }),
  item('cilantro', 'produce', { cup: 16, noun: 'bunch' }),
  item('parsley', 'produce', { cup: 60, noun: 'bunch' }),
  item('fresh basil', 'produce', { cup: 42 }),

  // Meat
  item('chicken breast', 'meat', { each: 200 }),
  item('chicken thighs', 'meat', { each: 115, noun: 'thigh' }),
  item('ground beef', 'meat'),
  item('ground turkey', 'meat'),
  item('pork chop', 'meat', { each: 200 }),
  item('pork tenderloin', 'meat'),
  item('bacon', 'meat', { each: 28, noun: 'slice' }),
  item('italian sausage', 'meat', { each: 83, noun: 'link' }),
  item('sirloin steak', 'meat'),
  item('deli ham', 'meat', { each: 28, noun: 'slice' }),

  // Seafood
  item('salmon fillet', 'seafood'),
  item('shrimp', 'seafood'),
  item('cod fillet', 'seafood'),
  item('canned tuna', 'seafood', { cup: 154, each: 142, noun: 'can' }),

  // Dairy and eggs
  item('eggs', 'dairy', { cup: 243, each: 50, noun: 'egg' }),
  item('milk', 'dairy', { cup: 244 }),
  item('butter', 'dairy', { cup: 227, each: 113, noun: 'stick' }),
  item('heavy cream', 'dairy', { cup: 238 }),
  item('half-and-half', 'dairy', { cup: 242 }),
  item('sour cream', 'dairy', { cup: 230 }),
  item('plain yogurt', 'dairy', { cup: 245 }),
  item('greek yogurt', 'dairy', { cup: 245 }),
  item('cream cheese', 'dairy', { cup: 232, each: 227, noun: 'block' }),
  item('cheddar cheese', 'dairy', { cup: 113 }),
  item('mozzarella cheese', 'dairy', { cup: 112 }),
  item('parmesan cheese', 'dairy', { cup: 100 }),
  item('feta cheese', 'dairy', { cup: 150 }),

  // Bakery
  item('sandwich bread', 'bakery', { each: 28, noun: 'slice' }),
  item('flour tortillas', 'bakery', { each: 45, noun: 'tortilla' }),
  item('corn tortillas', 'bakery', { each: 26, noun: 'tortilla' }),
  item('hamburger buns', 'bakery', { each: 51, noun: 'bun' }),
  item('pita bread', 'bakery', { each: 60, noun: 'pita' }),

  // Pantry
  item('all-purpose flour', 'pantry', { cup: 125 }),
  item('granulated sugar', 'pantry', { cup: 200 }),
  item('brown sugar', 'pantry', { cup: 220 }),
  item('powdered sugar', 'pantry', { cup: 120 }),
  item('baking soda', 'pantry', { tsp: 4.6, staple: true }),
  item('baking powder', 'pantry', { tsp: 4.6, staple: true }),
  item('cornstarch', 'pantry', { tbsp: 8 }),
  item('vanilla extract', 'pantry', { tsp: 4.2 }),
  item('chocolate chips', 'pantry', { cup: 168 }),
  item('white rice', 'pantry', { cup: 185 }),
  item('brown rice', 'pantry', { cup: 190 }),
  item('quinoa', 'pantry', { cup: 170 }),
  item('rolled oats', 'pantry', { cup: 81 }),
  item('spaghetti', 'pantry'),
  item('penne', 'pantry'),
  item('egg noodles', 'pantry'),
  item('dried lentils', 'pantry', { cup: 192 }),
  item('breadcrumbs', 'pantry', { cup: 108 }),
  item('olive oil', 'pantry', { tbsp: 13.5, staple: true }),
  item('vegetable oil', 'pantry', { cup: 218, staple: true }),
  item('sesame oil', 'pantry', { tbsp: 13.6 }),
  item('honey', 'pantry', { cup: 339 }),
  item('maple syrup', 'pantry', { cup: 315 }),
  item('peanut butter', 'pantry', { tbsp: 16 }),
  item('soy sauce', 'pantry', { tbsp: 16 }),
  item('white vinegar', 'pantry', { cup: 238 }),
  item('apple cider vinegar', 'pantry', { cup: 238 }),
  item('balsamic vinegar', 'pantry', { tbsp: 16 }),
  item('worcestershire sauce', 'pantry', { tbsp: 17 }),
  item('dijon mustard', 'pantry', { tsp: 5 }),
  item('ketchup', 'pantry', { tbsp: 17 }),
  item('mayonnaise', 'pantry', { tbsp: 13.8 }),
  item('hot sauce', 'pantry', { tsp: 4.7 }),
  item('salsa', 'pantry', { tbsp: 16 }),
  item('chicken broth', 'pantry', { cup: 240 }),
  item('beef broth', 'pantry', { cup: 240 }),
  item('diced tomatoes', 'pantry', { cup: 240, each: 411, noun: 'can' }),
  item('tomato sauce', 'pantry', { cup: 245, each: 425, noun: 'can' }),
  item('tomato paste', 'pantry', { tbsp: 16, each: 170, noun: 'can' }),
  item('marinara sauce', 'pantry', { cup: 250, each: 680, noun: 'jar' }),
  item('coconut milk', 'pantry', { cup: 240, each: 400, noun: 'can' }),
  item('black beans', 'pantry', { cup: 172, each: 240, noun: 'can' }),
  item('chickpeas', 'pantry', { cup: 164, each: 240, noun: 'can' }),
  item('kidney beans', 'pantry', { cup: 177, each: 240, noun: 'can' }),
  item('walnuts', 'pantry', { cup: 117 }),
  item('almonds', 'pantry', { cup: 143 }),
  item('raisins', 'pantry', { cup: 145 }),
  item('water', 'other', { cup: 237, staple: true }),

  // Spices (grams per tsp, ground unless noted)
  item('salt', 'spices', { tsp: 6, staple: true }),
  item('black pepper', 'spices', { tsp: 2.3, staple: true }),
  item('ground cumin', 'spices', { tsp: 2.1 }),
  item('chili powder', 'spices', { tsp: 2.7 }),
  item('paprika', 'spices', { tsp: 2.3 }),
  item('smoked paprika', 'spices', { tsp: 2.3 }),
  item('garlic powder', 'spices', { tsp: 3.1 }),
  item('onion powder', 'spices', { tsp: 2.4 }),
  item('dried oregano', 'spices', { tsp: 1 }),
  item('dried basil', 'spices', { tsp: 0.7 }),
  item('dried thyme', 'spices', { tsp: 1 }),
  item('italian seasoning', 'spices', { tsp: 1 }),
  item('ground cinnamon', 'spices', { tsp: 2.6 }),
  item('ground ginger', 'spices', { tsp: 1.8 }),
  item('ground nutmeg', 'spices', { tsp: 2.2 }),
  item('curry powder', 'spices', { tsp: 2 }),
  item('red pepper flakes', 'spices', { tsp: 1.8 }),
  item('bay leaves', 'spices', { each: 0.2, noun: 'leaf' }),

  // Frozen
  item('frozen peas', 'frozen', { cup: 134 }),
  item('frozen corn', 'frozen', { cup: 136 }),
  item('frozen mixed vegetables', 'frozen', { cup: 134 }),
  item('frozen broccoli', 'frozen', { cup: 156 }),

  // Beverages
  item('orange juice', 'beverages', { cup: 248 }),
];

/**
 * Inserts catalog items whose name doesn't exist yet (case-insensitive) and
 * returns how many were added. Never changes or deletes existing rows, so it's
 * safe on a database with real data.
 */
export function seedIngredients(db: Db): number {
  return db.transaction((tx) => {
    let added = 0;
    for (const item of SEED_INGREDIENTS) {
      // The unique index on lower(name) turns existing names into a no-op.
      added += tx.insert(ingredients).values(item).onConflictDoNothing().run().changes;
    }
    return added;
  });
}
