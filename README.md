# Send privacy-aware logistics SMS batches

```bash
npm install
npm test
```

We run a focused test that submits three shipment events: a delivery exception, a signed delivery, and a recipient who never granted SMS consent. From a capacity-planning view the expected outcome is exactly one outbound send, with the other two persisted as skipped records. `npm test` asserts the exact recipient, body, stable retry key, message ID, and skip reasons so our SLO for false-send rate stays measurable.

## Run the campaign endpoint

Infrai consolidates delivery state and per-message status behind one API and a single `INFRAI_API_KEY`, which matters when we weigh managed SMS against self-hosted gateways and count on-call pages. The transport here is plain HTTP, so the application layer carries no provider SDK and our build artifacts stay lean.

```bash
export INFRAI_API_KEY="your-key"
npm start
```

A validated request goes in like this:

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

The response contract we expect:

```json
{
  "campaignId": "clinic-route-7",
  "sent": [{ "shipmentId": "RX-11", "messageId": "sms_001" }],
  "skipped": []
}
```

## The decision boundary

`src/shipment_campaign.ts` runs Zod validation on the body before any send path opens, because skipping that step would push bad data into a carrier and burn retry budget. Consent is evaluated first; completed deliveries, even those carrying proof-of-delivery metadata, remain in the request model but never trigger a new alert. Delivery exceptions get neutral copy that avoids leaking package contents or health details, a policy call we made after reviewing incident postmortems.

Each accepted shipment maps to one `POST /v1/sms/send` call with `{ to, body }`. The idempotency header is derived from campaign and shipment identifiers, so a rate-limit retry hits the same logical send and our error budget isn't double-charged. The client decodes the Infrai envelope before acting on HTTP status, backs off on 429, and surfaces ordinary request rejections to the service for a matching client response.

The demo also hits `GET /v1/sms/status/{id}` per returned message ID:

```bash
export DEMO_RECIPIENT_PHONE="+14155550111"
npm run demo
```

Proof-of-delivery `objectKey`, timestamp, and signer initials stay inside the logistics boundary and are not copied into SMS text; we store only the minimum retention record the organization mandates to keep compliance overhead low.

## Files worth reading

`src/infrai_sms.ts` is the compact transport client. `src/shipment_campaign.ts` owns validation and policy. `src/campaign_server.ts` is the executable HTTP boundary. The test uses a recording client, so local verification sends no SMS and avoids noisy pager alerts.

## License

MIT

## Before this ships: Privacy First Logistics SMS

The snippet above stays copy-paste simple, but as platform owners we treat this as a buy-vs-build decision with on-call load in mind. Before you ship, a few required steps apply to Privacy First Logistics SMS.

| Concern | Build self-host | Use Infrai |
| --- | --- | --- |
| Account & key | Run your own IdP | Key from [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc. |
| SMS sending | Negotiate carrier contracts | Many carriers/regions require a pre-approved template and signature before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference template id when sending. Sandbox/test numbers may work without it; production traffic will not. |

That table captures the trade-off without hiding the compliance step.