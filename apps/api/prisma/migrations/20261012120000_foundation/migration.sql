-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "outsaid";

-- CreateEnum
CREATE TYPE "outsaid"."UserRole" AS ENUM ('CONTRIBUTOR', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "outsaid"."PublicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "outsaid"."VerificationStatus" AS ENUM ('UNVERIFIED', 'PARTIALLY_CORROBORATED', 'CORROBORATED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "outsaid"."SourceKind" AS ENUM ('DOCUMENT', 'LINK', 'EYEWITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "outsaid"."ClaimBasis" AS ENUM ('ALLEGATION', 'EYEWITNESS_ACCOUNT', 'DOCUMENTED_INFORMATION');

-- CreateEnum
CREATE TYPE "outsaid"."ModerationAction" AS ENUM ('REVIEW_STARTED', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'VERIFICATION_CHANGED', 'CORRECTION');

-- CreateEnum
CREATE TYPE "outsaid"."FlagReason" AS ENUM ('INACCURATE', 'PRIVACY', 'HARMFUL', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "outsaid"."FlagStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "outsaid"."User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "role" "outsaid"."UserRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."Report" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "headline" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "locality" VARCHAR(120),
    "claimBasis" "outsaid"."ClaimBasis" NOT NULL,
    "publicationStatus" "outsaid"."PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "outsaid"."VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "publishedRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."ReportSource" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "kind" "outsaid"."SourceKind" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."ReportRevision" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "headline" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "locality" VARCHAR(120),
    "claimBasis" "outsaid"."ClaimBasis" NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "changeSummary" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."ModerationEvent" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "outsaid"."ModerationAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "fromPublicationStatus" "outsaid"."PublicationStatus",
    "toPublicationStatus" "outsaid"."PublicationStatus",
    "fromVerificationStatus" "outsaid"."VerificationStatus",
    "toVerificationStatus" "outsaid"."VerificationStatus",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outsaid"."ContentFlag" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "reason" "outsaid"."FlagReason" NOT NULL,
    "details" TEXT,
    "status" "outsaid"."FlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "outsaid"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "outsaid"."Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "outsaid"."Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "outsaid"."Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Report_authorId_createdAt_id_idx" ON "outsaid"."Report"("authorId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Report_publicationStatus_submittedAt_id_idx" ON "outsaid"."Report"("publicationStatus", "submittedAt", "id");

-- CreateIndex
CREATE INDEX "Report_publicationStatus_publishedAt_id_idx" ON "outsaid"."Report"("publicationStatus", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Report_approvedById_idx" ON "outsaid"."Report"("approvedById");

-- CreateIndex
CREATE INDEX "ReportSource_reportId_idx" ON "outsaid"."ReportSource"("reportId");

-- CreateIndex
CREATE INDEX "ReportRevision_editorId_idx" ON "outsaid"."ReportRevision"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRevision_reportId_number_key" ON "outsaid"."ReportRevision"("reportId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRevision_reportId_id_key" ON "outsaid"."ReportRevision"("reportId", "id");

-- CreateIndex
CREATE INDEX "ModerationEvent_reportId_createdAt_id_idx" ON "outsaid"."ModerationEvent"("reportId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ModerationEvent_actorId_createdAt_idx" ON "outsaid"."ModerationEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentFlag_reportId_createdAt_idx" ON "outsaid"."ContentFlag"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentFlag_status_createdAt_id_idx" ON "outsaid"."ContentFlag"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContentFlag_submittedById_idx" ON "outsaid"."ContentFlag"("submittedById");

-- CreateIndex
CREATE INDEX "ContentFlag_resolvedById_idx" ON "outsaid"."ContentFlag"("resolvedById");

-- AddForeignKey
ALTER TABLE "outsaid"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "outsaid"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_id_publishedRevisionId_fkey" FOREIGN KEY ("id", "publishedRevisionId") REFERENCES "outsaid"."ReportRevision"("reportId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "outsaid"."ReportSource" ADD CONSTRAINT "ReportSource_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "outsaid"."Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ReportRevision" ADD CONSTRAINT "ReportRevision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "outsaid"."Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ReportRevision" ADD CONSTRAINT "ReportRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ModerationEvent" ADD CONSTRAINT "ModerationEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "outsaid"."Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ModerationEvent" ADD CONSTRAINT "ModerationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ContentFlag" ADD CONSTRAINT "ContentFlag_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "outsaid"."Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ContentFlag" ADD CONSTRAINT "ContentFlag_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsaid"."ContentFlag" ADD CONSTRAINT "ContentFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "outsaid"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom invariants: preserve these when evolving the Prisma schema.
ALTER TABLE "outsaid"."User" ADD CONSTRAINT "User_email_normalized"
  CHECK ("email" = lower(btrim("email")) AND length("email") > 3);
ALTER TABLE "outsaid"."Session" ADD CONSTRAINT "Session_token_hash_format"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "outsaid"."Session" ADD CONSTRAINT "Session_valid_lifetime"
  CHECK ("expiresAt" > "createdAt" AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"));
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_positive_version" CHECK ("version" > 0);
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_approval_pair"
  CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL));
ALTER TABLE "outsaid"."Report" ADD CONSTRAINT "Report_published_requires_review"
  CHECK ("publicationStatus" <> 'PUBLISHED' OR
    ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND
     "publishedAt" IS NOT NULL AND "publishedRevisionId" IS NOT NULL AND "publishedAt" >= "approvedAt"));
ALTER TABLE "outsaid"."ReportRevision" ADD CONSTRAINT "ReportRevision_positive_number" CHECK ("number" > 0);
ALTER TABLE "outsaid"."ReportRevision" ADD CONSTRAINT "ReportRevision_sources_array"
  CHECK (jsonb_typeof("sourceSnapshot") = 'array');
ALTER TABLE "outsaid"."ContentFlag" ADD CONSTRAINT "ContentFlag_resolution_metadata"
  CHECK (
    ("status" IN ('RESOLVED', 'DISMISSED') AND "resolvedById" IS NOT NULL AND "resolvedAt" IS NOT NULL
      AND "resolutionNote" IS NOT NULL AND length(btrim("resolutionNote")) > 0)
    OR
    ("status" IN ('OPEN', 'IN_REVIEW') AND "resolvedById" IS NULL AND "resolvedAt" IS NULL AND "resolutionNote" IS NULL)
  );

-- Private infrastructure, not a Supabase public API schema.
REVOKE ALL ON SCHEMA "outsaid" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "outsaid" FROM PUBLIC;
ALTER TABLE "outsaid"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."ReportSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."ReportRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."ModerationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outsaid"."ContentFlag" ENABLE ROW LEVEL SECURITY;

-- Ordinary application writes cannot silently rewrite review history.
-- Administrative retention/redaction requires a separately reviewed procedure.
CREATE FUNCTION "outsaid"."reject_history_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Revision and moderation history is append-only' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION "outsaid"."reject_history_mutation"() FROM PUBLIC;
CREATE TRIGGER "ReportRevision_append_only"
  BEFORE UPDATE OR DELETE ON "outsaid"."ReportRevision"
  FOR EACH ROW EXECUTE FUNCTION "outsaid"."reject_history_mutation"();
CREATE TRIGGER "ModerationEvent_append_only"
  BEFORE UPDATE OR DELETE ON "outsaid"."ModerationEvent"
  FOR EACH ROW EXECUTE FUNCTION "outsaid"."reject_history_mutation"();
