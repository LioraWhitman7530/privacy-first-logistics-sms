import { z } from "zod";
import type { InfraiSmsClient, SmsStatusResult } from "./infrai_sms.js";

const proofOfDeliverySchema = z.object({
  objectKey: z.string().min(1),
  capturedAt: z.string().datetime(),
  signerInitials: z.string().min(1).max(8),
});

const shipmentSchema = z.object({
  shipmentId: z.string().min(1),
  recipientPhone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  smsConsent: z.boolean(),
  event: z.enum(["out_for_delivery", "delivery_exception", "delivered"]),
  eventAt: z.string().datetime(),
  proofOfDelivery: proofOfDeliverySchema.optional(),
});

export const campaignRequestSchema = z.object({
  campaignId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  shipments: z.array(shipmentSchema).min(1).max(100),
});

export type CampaignRequest = z.infer<typeof campaignRequestSchema>;
export type CampaignDecision =
  | { shipmentId: string; action: "skip"; reason: "no_sms_consent" | "already_delivered" }
  | { shipmentId: string; action: "send"; to: string; body: string };

export function decideCampaign(request: CampaignRequest): CampaignDecision[] {
  return request.shipments.map((shipment) => {
    if (!shipment.smsConsent) {
      return { shipmentId: shipment.shipmentId, action: "skip", reason: "no_sms_consent" };
    }
    if (shipment.event === "delivered") {
      return { shipmentId: shipment.shipmentId, action: "skip", reason: "already_delivered" };
    }

    const body = shipment.event === "delivery_exception"
      ? `Shipment ${shipment.shipmentId}: delivery needs attention. Contact the logistics desk for details.`
      : `Shipment ${shipment.shipmentId} is out for delivery.`;
    return { shipmentId: shipment.shipmentId, action: "send", to: shipment.recipientPhone, body };
  });
}

export type CampaignResult = {
  campaignId: string;
  sent: Array<{ shipmentId: string; messageId: string }>;
  skipped: Array<{ shipmentId: string; reason: string }>;
};

export async function sendShipmentCampaign(
  input: unknown,
  client: Pick<InfraiSmsClient, "send">,
): Promise<CampaignResult> {
  const request = campaignRequestSchema.parse(input);
  const decisions = decideCampaign(request);
  const sent = await Promise.all(decisions.filter((decision) => decision.action === "send").map(async (decision) => {
    const result = await client.send(
      decision.to,
      decision.body,
      `${request.campaignId}:${decision.shipmentId}`,
    );
    return { shipmentId: decision.shipmentId, messageId: result.message_id };
  }));
  const skipped = decisions.filter((decision) => decision.action === "skip").map((decision) => ({
    shipmentId: decision.shipmentId,
    reason: decision.reason,
  }));
  return { campaignId: request.campaignId, sent, skipped };
}

export async function getCampaignStatuses(
  messageIds: string[],
  client: Pick<InfraiSmsClient, "status">,
): Promise<Array<{ messageId: string; status: SmsStatusResult }>> {
  return Promise.all(messageIds.map(async (messageId) => ({
    messageId,
    status: await client.status(messageId),
  })));
}
