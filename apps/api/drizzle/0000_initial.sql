CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`count_noun` text,
	`grams_per_ml` real,
	`grams_per_each` real,
	`is_staple` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT "ingredients_category_check" CHECK("ingredients"."category" IN ('produce', 'bakery', 'meat', 'seafood', 'dairy', 'pantry', 'spices', 'frozen', 'beverages', 'other')),
	CONSTRAINT "ingredients_grams_per_ml_check" CHECK("ingredients"."grams_per_ml" IS NULL OR "ingredients"."grams_per_ml" > 0),
	CONSTRAINT "ingredients_grams_per_each_check" CHECK("ingredients"."grams_per_each" IS NULL OR "ingredients"."grams_per_each" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (lower("name"));--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real,
	`unit` text,
	`preparation` text,
	`is_optional` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "recipe_ingredients_unit_check" CHECK("recipe_ingredients"."unit" IS NULL OR "recipe_ingredients"."unit" IN ('tsp', 'tbsp', 'cup', 'fl_oz', 'pint', 'quart', 'gallon', 'ml', 'l', 'oz', 'lb', 'g', 'kg', 'each')),
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK(("recipe_ingredients"."quantity" IS NULL AND "recipe_ingredients"."unit" IS NULL) OR ("recipe_ingredients"."quantity" > 0 AND "recipe_ingredients"."unit" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_ingredient_idx` ON `recipe_ingredients` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_tags_tag_idx` ON `recipe_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`servings` integer NOT NULL,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`instructions` text DEFAULT '' NOT NULL,
	`source_url` text,
	`notes` text,
	`rating` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	CONSTRAINT "recipes_servings_check" CHECK("recipes"."servings" > 0),
	CONSTRAINT "recipes_rating_check" CHECK("recipes"."rating" IS NULL OR "recipes"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `recipes_name_idx` ON `recipes` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`household_size` integer DEFAULT 2 NOT NULL,
	`week_starts_on` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_household_size_check" CHECK("settings"."household_size" > 0),
	CONSTRAINT "settings_week_starts_on_check" CHECK("settings"."week_starts_on" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (lower("name"));