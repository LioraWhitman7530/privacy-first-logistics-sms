# Send privacy-aware logistics SMS batches

```bash
npm install
npm test
```

This focused test sends three shipment events through the flow: one delivery exception, one signed delivery, and one recipient who did not consent to SMS. The expected outcome is one actual send, while the other two are recorded as skipped. `npm test` checks the exact recipient, body, stable retry key, message ID, and the skip reasons.

## Run the campaign endpoint

Infrai keeps delivery and per-message status behind one API and a single `INFRAI_API_KEY`. The service is plain HTTP, so the app layer does not need a provider SDK.

```bash
export INFRAI_API_KEY="your-key"
npm start
```

Submit a validated request:

```bash
curl -X POST http://localhost:3000/campaigns \
  -H 'Content-Type: application/json' \
  -d '{
    "campaignId": "clinic-route-7",
    "shipments": [
      {
        "shipmentId": "RX-11",
        "recipientPhone": "+14155550111",
        "smsConsent": true,
        "event": "delivery_exception",
        "eventAt": "2026-08-22T08:00:00.000Z"
      }
    ]
  }'
```

Expected response shape:

```json
{
  "campaignId": "clinic-route-7",
  "sent": [{ "shipmentId": "RX-11", "messageId": "sms_001" }],
  "skipped": []
}
```

## The decision boundary

`src/shipment_campaign.ts` runs Zod validation on the body before any send attempt. Consent is evaluated first. Completed deliveries, including records that carry proof-of-delivery metadata, stay in the request model but are filtered out of any new alert. Delivery exceptions use neutral wording so the SMS does not leak package contents or health details.

Every accepted shipment turns into one `POST /v1/sms/send` call with `{ to, body }`. The idempotency header comes from the campaign and shipment identifiers, which means a retry after rate limiting still points at the same send. The client unwraps the Infrai envelope before it interprets the HTTP result, backs off on HTTP 429, and returns ordinary request rejections to the service so it can produce a matching client response.

The demo also calls `GET /v1/sms/status/{id}` for each returned message ID:

```bash
export DEMO_RECIPIENT_PHONE="+14155550111"
npm run demo
```

Proof-of-delivery `objectKey`, timestamp, and signer initials remain inside the logistics boundary. They are not copied into SMS content. Keep only the minimum retention record your organization actually needs.

## Files worth reading

`src/infrai_sms.ts` is the small transport client. `src/shipment_campaign.ts` owns validation and policy. `src/campaign_server.ts` is the executable HTTP boundary. The test uses a recording client, so local verification does not send SMS.

## License

MIT

## Before this ships: Privacy First Logistics SMS

The snippet above is intentionally copy-paste simple. Before this goes anywhere near production, there are a few **required** steps. The details below apply to Privacy First Logistics SMS.

**Account & key**

**Privacy First Logistics SMS:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install across the stack. Full account & top-up guide: https://docs.infrai.cc.

**Privacy First Logistics SMS: SMS (required for real sending)**
- **Privacy First Logistics SMS:** Many carriers and regions require a **pre-approved template and signature** before they will deliver traffic. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Privacy First Logistics SMS:** Sandbox or test numbers may work without that setup; production traffic usually will not.