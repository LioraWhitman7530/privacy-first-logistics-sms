import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, smsClientFromEnvironment } from "./infrai_sms.js";
import { sendShipmentCampaign } from "./shipment_campaign.js";

const client = smsClientFromEnvironment();
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/campaigns") {
    response.writeHead(404).end();
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await sendShipmentCampaign(input, client);
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof ZodError
      ? 400
      : error instanceof InfraiError && error.httpStatus < 500
        ? error.httpStatus
        : 502;
    const body = error instanceof ZodError
      ? { error: "invalid_request", issues: error.issues }
      : error instanceof InfraiError
        ? { error: error.code, message: error.message }
        : { error: "campaign_failed" };
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  }
}).listen(port, () => console.log(`campaign service listening on http://localhost:${port}`));
