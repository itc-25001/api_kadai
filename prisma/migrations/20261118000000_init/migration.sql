-- User, Topic, Post: すべての ID はアプリケーション (Prisma) が UUID v7 を採番します。
CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" VARCHAR(256) NOT NULL,
  "password" VARCHAR(192) NOT NULL,
  "name" VARCHAR(128),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
  "id" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "title" VARCHAR(256) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Post" (
  "id" UUID NOT NULL,
  "topicId" UUID NOT NULL,
  "contributorId" UUID NOT NULL,
  "message" VARCHAR(512) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Topic_deletedAt_updatedAt_idx" ON "Topic"("deletedAt", "updatedAt");
CREATE INDEX "Topic_authorId_idx" ON "Topic"("authorId");
CREATE INDEX "Post_topicId_deletedAt_createdAt_idx" ON "Post"("topicId", "deletedAt", "createdAt");
CREATE INDEX "Post_contributorId_idx" ON "Post"("contributorId");

ALTER TABLE "Topic" ADD CONSTRAINT "Topic_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_contributorId_fkey"
  FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
