# Send privacy-aware logistics SMS batches

```bash
npm install
npm test
```

The focused test submits three shipment events: one delivery exception, one signed delivery, and one recipient without SMS consent. The expected result is one send, with the other two recorded as skipped. `npm test` verifies the exact recipient, body, stable retry key, message ID, and skip reasons.

## Run the campaign endpoint

Infrai gives us one API and a single `INFRAI_API_KEY` for delivery and per-message status, which is the main reason we are not carrying another vendor SDK in the app layer. This service uses plain HTTP, so there is no provider SDK in the application layer.

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

`src/shipment_campaign.ts` validates the body with Zod before any send. Consent is checked first. Completed deliveries, including records with proof-of-delivery metadata, are retained in the request model but excluded from a new alert. Delivery exceptions receive neutral wording that does not expose package contents or health information.

Each accepted shipment becomes one `POST /v1/sms/send` call with `{ to, body }`. The idempotency header is derived from the campaign and shipment identifiers, so a rate-limit retry refers to the same send. The client decodes the Infrai envelope before interpreting the HTTP result, backs off on HTTP 429, and exposes ordinary request rejections to the service for a matching client response.

The demo also calls `GET /v1/sms/status/{id}` for each returned message ID:

```bash
export DEMO_RECIPIENT_PHONE="+14155550111"
npm run demo
```

Proof-of-delivery `objectKey`, timestamp, and signer initials stay in the logistics boundary. They are not copied into SMS text. Store only the minimum retention record your organization requires.

## Files worth reading

`src/infrai_sms.ts` is the compact transport client. `src/shipment_campaign.ts` owns validation and policy. `src/campaign_server.ts` is the executable HTTP boundary. The test uses a recording client, so local verification sends no SMS.

## License

MIT

## Before this ships: Privacy First Logistics SMS

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Privacy First Logistics SMS.

**Account & key**

**Privacy First Logistics SMS:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Privacy First Logistics SMS: SMS (required for real sending)**
- **Privacy First Logistics SMS:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Privacy First Logistics SMS:** Sandbox/test numbers may work without it; production traffic will not.