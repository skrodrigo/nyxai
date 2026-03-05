CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"title" text NOT NULL,
	"content" json NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"user_id" text NOT NULL,
	"active_branch_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"share_path" text,
	"model" text,
	CONSTRAINT "chats_share_path_unique" UNIQUE("share_path")
);
--> statement-breakpoint
CREATE TABLE "chat_branches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" text NOT NULL,
	"parent_branch_id" text,
	"fork_message_id" text,
	"fork_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_branch_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" text NOT NULL,
	"message_id" text NOT NULL,
	"position" integer NOT NULL,
	"message_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_branch_messages_branch_pos_unique" UNIQUE("branch_id","position")
);
--> statement-breakpoint
CREATE TABLE "email_campaign_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_campaign_log_user_campaign_unique" UNIQUE("user_id","campaign_key")
);
--> statement-breakpoint
CREATE TABLE "email_otp" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"image_url" text NOT NULL,
	"r2_key" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"content" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chat_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean,
	"seats" integer
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"occupation" text,
	"ai_instructions" text,
	"bio" text,
	"locale" text DEFAULT 'pt' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_customer_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"day_count" integer DEFAULT 0 NOT NULL,
	"day_window_start" timestamp with time zone NOT NULL,
	"week_count" integer DEFAULT 0 NOT NULL,
	"week_window_start" timestamp with time zone NOT NULL,
	"month_count" integer DEFAULT 0 NOT NULL,
	"month_window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_branches" ADD CONSTRAINT "chat_branches_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_branches" ADD CONSTRAINT "chat_branches_parent_fk" FOREIGN KEY ("parent_branch_id") REFERENCES "public"."chat_branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_branch_messages" ADD CONSTRAINT "chat_branch_messages_branch_id_chat_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."chat_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_branch_messages" ADD CONSTRAINT "chat_branch_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_branch_messages" ADD CONSTRAINT "chat_branch_messages_message_version_id_message_versions_id_fk" FOREIGN KEY ("message_version_id") REFERENCES "public"."message_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_log" ADD CONSTRAINT "email_campaign_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_versions" ADD CONSTRAINT "message_versions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_chat_id_idx" ON "artifacts" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "artifacts_message_id_idx" ON "artifacts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "artifacts_status_idx" ON "artifacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chats_user_id_idx" ON "chats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_branches_chat_id_idx" ON "chat_branches" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_branches_parent_id_idx" ON "chat_branches" USING btree ("parent_branch_id");--> statement-breakpoint
CREATE INDEX "chat_branches_fork_msg_idx" ON "chat_branches" USING btree ("fork_message_id");--> statement-breakpoint
CREATE INDEX "chat_branch_messages_branch_idx" ON "chat_branch_messages" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "chat_branch_messages_message_idx" ON "chat_branch_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_branch_messages_version_idx" ON "chat_branch_messages" USING btree ("message_version_id");--> statement-breakpoint
CREATE INDEX "email_campaign_log_campaign_idx" ON "email_campaign_log" USING btree ("campaign_key");--> statement-breakpoint
CREATE INDEX "email_otp_email_idx" ON "email_otp" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_otp_expires_at_idx" ON "email_otp" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "image_generations_chat_id_idx" ON "image_generations" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "image_generations_user_id_idx" ON "image_generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "image_generations_status_idx" ON "image_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_chat_id_idx" ON "messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_versions_message_id_idx" ON "message_versions" USING btree ("message_id");