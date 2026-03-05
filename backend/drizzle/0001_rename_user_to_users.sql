-- Migration: Rename user table to users
ALTER TABLE "user" RENAME TO "users";

-- Update foreign key references
ALTER TABLE "email_otp" DROP CONSTRAINT IF EXISTS "email_otp_user_id_user_id_fk";
ALTER TABLE "email_otp" ADD CONSTRAINT "email_otp_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

ALTER TABLE "email_campaign_log" DROP CONSTRAINT IF EXISTS "email_campaign_log_user_id_user_id_fk";
ALTER TABLE "email_campaign_log" ADD CONSTRAINT "email_campaign_log_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_user_id_user_id_fk";
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

ALTER TABLE "user_usage" DROP CONSTRAINT IF EXISTS "user_usage_user_id_user_id_fk";
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

-- Rename constraints
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "user_email_unique";
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
