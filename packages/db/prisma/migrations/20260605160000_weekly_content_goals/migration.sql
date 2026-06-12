-- Per-writer weekly content goals + workspace default.
ALTER TABLE "Membership" ADD COLUMN "weeklyGoal" INTEGER;
ALTER TABLE "Membership" ADD COLUMN "weeklyGoalTopic" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "defaultWeeklyGoal" INTEGER NOT NULL DEFAULT 3;
