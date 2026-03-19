-- CreateEnum
CREATE TYPE "Branch" AS ENUM ('TOKYO', 'OSAKA', 'BOTH');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('NORMAL', 'SECTION_HEADER', 'SUBTOTAL', 'WELFARE', 'EXPENSES', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'REQUESTED', 'IN_PROGRESS', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('SANWA_FORMAT', 'PARTNER_FORMAT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameInternal" TEXT NOT NULL,
    "namePublic" TEXT NOT NULL,
    "address" TEXT,
    "managerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "totalArea" DECIMAL(10,2),
    "buildingType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "tradeTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branch" "Branch" NOT NULL DEFAULT 'BOTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSheet" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateItem" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "remarks" TEXT,
    "itemType" "ItemType" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "TemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "requestType" "RequestType" NOT NULL DEFAULT 'SANWA_FORMAT',
    "deadline" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateHeader" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "estimateNumber" TEXT,
    "date" TIMESTAMP(3),
    "companyName" TEXT,
    "contactName" TEXT,
    "projectName" TEXT,
    "totalAmount" INTEGER,
    "netAmount" INTEGER,
    "specialNotes" TEXT,

    CONSTRAINT "EstimateHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateSheet" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "templateItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" DECIMAL(12,2),
    "unit" TEXT,
    "unitPrice" INTEGER,
    "amount" INTEGER,
    "remarks" TEXT,
    "isAddedByPartner" BOOLEAN NOT NULL DEFAULT false,
    "itemType" "ItemType" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateAttachment" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateComment" (
    "id" TEXT NOT NULL,
    "estimateRequestId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Project_code_idx" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Partner_email_idx" ON "Partner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateRequest_token_key" ON "EstimateRequest"("token");

-- CreateIndex
CREATE INDEX "EstimateRequest_token_idx" ON "EstimateRequest"("token");

-- CreateIndex
CREATE INDEX "EstimateRequest_projectId_idx" ON "EstimateRequest"("projectId");

-- CreateIndex
CREATE INDEX "EstimateRequest_partnerId_idx" ON "EstimateRequest"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateHeader_estimateRequestId_key" ON "EstimateHeader"("estimateRequestId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSheet" ADD CONSTRAINT "TemplateSheet_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "TemplateSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRequest" ADD CONSTRAINT "EstimateRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRequest" ADD CONSTRAINT "EstimateRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRequest" ADD CONSTRAINT "EstimateRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateHeader" ADD CONSTRAINT "EstimateHeader_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "EstimateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSheet" ADD CONSTRAINT "EstimateSheet_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "EstimateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "EstimateSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "TemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateAttachment" ADD CONSTRAINT "EstimateAttachment_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "EstimateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateComment" ADD CONSTRAINT "EstimateComment_estimateRequestId_fkey" FOREIGN KEY ("estimateRequestId") REFERENCES "EstimateRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
