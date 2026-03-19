"use server";

import { prisma } from "@/lib/prisma";
import { generateToken, getTokenExpiryDate } from "@/lib/token";
import { redirect } from "next/navigation";

interface CreateRequestInput {
  projectId: string;
  tradeType: string;
  partnerIds: string[];
  deadline: string;
}

export async function createEstimateRequests(input: CreateRequestInput) {
  const { projectId, tradeType, partnerIds, deadline } = input;

  if (!partnerIds.length) {
    return { error: "協力会社を選択してください" };
  }

  const deadlineDate = new Date(deadline);
  const tokenExpiry = getTokenExpiryDate(deadlineDate);

  const created = [];

  for (const partnerId of partnerIds) {
    const token = generateToken();
    const request = await prisma.estimateRequest.create({
      data: {
        projectId,
        partnerId,
        tradeType,
        token,
        tokenExpiresAt: tokenExpiry,
        status: "REQUESTED",
        requestedAt: new Date(),
        deadline: deadlineDate,
      },
    });
    created.push(request);
  }

  redirect(`/admin/projects/${projectId}`);
}

export async function submitEstimate(
  requestId: string,
  totalAmount: number,
  notes: string
) {
  const request = await prisma.estimateRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "見積依頼が見つかりません" };
  if (request.status === "SUBMITTED" || request.status === "CONFIRMED") {
    return { error: "この見積は既に提出済みです" };
  }
  if (request.tokenExpiresAt < new Date()) {
    return { error: "回答期限を過ぎています" };
  }

  await prisma.estimateRequest.update({
    where: { id: requestId },
    data: {
      totalAmount,
      notes: notes || null,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  return { success: true };
}
