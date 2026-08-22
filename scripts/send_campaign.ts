import { smsClientFromEnvironment } from "../src/infrai_sms.js";
import { getCampaignStatuses, sendShipmentCampaign } from "../src/shipment_campaign.js";

const recipientPhone = process.env.DEMO_RECIPIENT_PHONE;
if (!recipientPhone) throw new Error("DEMO_RECIPIENT_PHONE is required");

const client = smsClientFromEnvironment();
const campaign = await sendShipmentCampaign({
  campaignId: `dispatch-${new Date().toISOString().slice(0, 10)}`,
  shipments: [{
    shipmentId: "MED-1042",
    recipientPhone,
    smsConsent: true,
    event: "out_for_delivery",
    eventAt: new Date().toISOString(),
  }],
}, client);
const statuses = await getCampaignStatuses(campaign.sent.map((item) => item.messageId), client);
console.log(JSON.stringify({ campaign, statuses }, null, 2));
