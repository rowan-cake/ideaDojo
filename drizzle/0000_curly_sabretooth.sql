CREATE TABLE `dojo_messages` (
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`encounter` integer NOT NULL,
	`exchange` integer NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('user', 'idea')),
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`owner_id`, `session_id`, `sequence`)
);
--> statement-breakpoint
CREATE INDEX `dojo_messages_session_idx` ON `dojo_messages` (`owner_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `dojo_sessions` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`idea_json` text NOT NULL,
	`turn` integer DEFAULT 0 NOT NULL,
	`moves_json` text DEFAULT '[]' NOT NULL,
	`state_json` text NOT NULL,
	`progress_json` text NOT NULL,
	`history_json` text DEFAULT '[]' NOT NULL,
	`message_pending` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `dojo_sessions_owner_updated_idx` ON `dojo_sessions` (`owner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`slot` integer NOT NULL,
	`title` text NOT NULL,
	`seed` text NOT NULL,
	`tone` text NOT NULL,
	`quip` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active', 'pruned')),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`pruned_at` text,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `ideas_owner_status_idx` ON `ideas` (`owner_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ideas_owner_active_slot_idx` ON `ideas` (`owner_id`,`slot`) WHERE "ideas"."status" = 'active';--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
