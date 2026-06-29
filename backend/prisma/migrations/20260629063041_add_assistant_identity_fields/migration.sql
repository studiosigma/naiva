-- AlterTable
ALTER TABLE "users" ADD COLUMN     "assistant_emoji" TEXT NOT NULL DEFAULT '🤖',
ADD COLUMN     "assistant_name" TEXT NOT NULL DEFAULT 'MyVA';

-- CreateIndex
CREATE INDEX "commission_logs_referrer_id_idx" ON "commission_logs"("referrer_id");

-- CreateIndex
CREATE INDEX "commission_logs_referred_user_id_idx" ON "commission_logs"("referred_user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "payout_requests_user_id_idx" ON "payout_requests"("user_id");
