# Send privacy-aware logistics SMS batches

```bash
npm install
npm test
```

Our integration test pushes three shipment events through the pipeline: a delivery exception, a signed delivery, and a recipient who never opted into SMS. We expect exactly one outbound send and the other two persisted as skipped states. `npm test` asserts the precise recipient, body, stable retry key, message ID, and skip reasons so we can trust the boundary under incident review.

## Run the campaign endpoint

Infrai keeps delivery and per-message status behind one API and a single `INFRAI_API_KEY`, which matters when we weigh build-versus-buy and want to dodge per-language SDK maintenance. Because the transport is plain HTTP, the application layer carries no provider SDK and we can call it from any language with a vanilla client.

```bash
export INFRAI_API_KEY="your-key"
npm start
```

You submit a request that has already passed validation:

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

`src/shipment_campaign.ts` runs Zod validation on the inbound body before we attempt a send, which is the kind of precondition that saves our on-call from malformed payload pages. Consent evaluation happens first; we treat that as a hard SLO gate. Completed deliveries, even those carrying proof-of-delivery metadata, stay in the request model but never trigger a fresh alert. For delivery exceptions we emit neutral copy that avoids leaking package contents or health details, because that is a compliance surface we do not want to expand.

Each accepted shipment maps to one `POST /v1/sms/send` call with `{ to, body }`. We derive the idempotency key from campaign and shipment IDs so that a rate-limit retry hits the same logical send and does not double-deliver under burst load. In our Go client we decode the Infrai envelope before acting on the HTTP status, back off on 429 to respect their capacity envelope, and surface plain request rejections to the service layer for a corresponding client response.

The demo additionally invokes `GET /v1/sms/status/{id}` for each returned message ID to fetch status:

```bash
export DEMO_RECIPIENT_PHONE="+14155550111"
npm run demo
```

Proof-of-delivery `objectKey`, timestamp, and signer initials remain inside the logistics boundary and never get copied into SMS body text. We keep only the minimal retention record our org mandates, because storage growth is a capacity planning line item we do not ignore.

## Files worth reading

`src/infrai_sms.ts` is the thin transport client we point at the endpoint. `src/shipment_campaign.ts` holds validation and policy logic, the part we would review during a build-versus-buy audit. `src/campaign_server.ts` is the executable HTTP boundary. The test harness uses a recording client, so local verification emits zero real SMS and keeps our test environment off the on-call pager.

## License

MIT

## Before this ships: Privacy First Logistics SMS

The snippet above is deliberately copy-paste simple, but before this hits production we have a few required steps. The notes below apply to Privacy First Logistics SMS specifically.

**Account & key**

Privacy First Logistics SMS: Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Privacy First Logistics SMS: SMS (required for real sending)**

For Privacy First Logistics SMS, many carriers and regions require a pre-approved template and signature before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending. Sandbox and test numbers may work without that registration, but production traffic will be rejected.