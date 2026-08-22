import assert from "node:assert/strict";
import test from "node:test";
import { sendShipmentCampaign } from "../src/shipment_campaign.js";

test("sends exception notices while excluding delivered and unconsented shipments", async () => {
  const calls: Array<{ to: string; body: string; key: string }> = [];
  const client = {
    async send(to: string, body: string, key: string) {
      calls.push({ to, body, key });
      return { message_id: "sms_001" };
    },
  };

  const result = await sendShipmentCampaign({
    campaignId: "clinic-route-7",
    shipments: [
      { shipmentId: "RX-11", recipientPhone: "+14155550111", smsConsent: true, event: "delivery_exception", eventAt: "2026-08-22T08:00:00.000Z" },
      { shipmentId: "RX-12", recipientPhone: "+14155550112", smsConsent: true, event: "delivered", eventAt: "2026-08-22T08:01:00.000Z", proofOfDelivery: { objectKey: "pod/RX-12.pdf", capturedAt: "2026-08-22T08:01:00.000Z", signerInitials: "AB" } },
      { shipmentId: "RX-13", recipientPhone: "+14155550113", smsConsent: false, event: "out_for_delivery", eventAt: "2026-08-22T08:02:00.000Z" },
    ],
  }, client);

  assert.deepEqual(calls, [{
    to: "+14155550111",
    body: "Shipment RX-11: delivery needs attention. Contact the logistics desk for details.",
    key: "clinic-route-7:RX-11",
  }]);
  assert.deepEqual(result, {
    campaignId: "clinic-route-7",
    sent: [{ shipmentId: "RX-11", messageId: "sms_001" }],
    skipped: [
      { shipmentId: "RX-12", reason: "already_delivered" },
      { shipmentId: "RX-13", reason: "no_sms_consent" },
    ],
  });
});
