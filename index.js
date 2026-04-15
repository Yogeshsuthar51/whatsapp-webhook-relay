const express = require("express");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "vz_whatsapp_demo_2026";
const POLL_SECRET = process.env.POLL_SECRET || "vz_poll_secret_2026";
const MAX_QUEUE = 500;

const messageQueue = [];

// Meta webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Relay] Webhook verified");
    return res.status(200).send(challenge);
  }
  console.warn("[Relay] Verification failed");
  res.sendStatus(403);
});

// Meta webhook incoming messages (POST)
app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value || !value.messages) continue;

        for (const message of value.messages) {
          let text = null;

          if (message.type === "text") {
            text = message.text.body;
          } else if (message.type === "interactive") {
            const ir = message.interactive;
            if (ir.type === "button_reply") {
              text = ir.button_reply.title;
            } else if (ir.type === "list_reply") {
              text = ir.list_reply.title;
            }
          }

          if (!text) continue;

          const item = {
            from: message.from,
            text,
            timestamp: message.timestamp,
            receivedAt: Date.now()
          };

          messageQueue.push(item);
          if (messageQueue.length > MAX_QUEUE) messageQueue.shift();
          console.log(`[Relay] Queued message from ${item.from}: "${item.text}" (queue: ${messageQueue.length})`);
        }
      }
    }
  } catch (err) {
    console.error("[Relay] Error parsing webhook:", err.message);
  }
});

// Local server polls this endpoint
app.get("/poll", (req, res) => {
  if (req.query.secret !== POLL_SECRET) {
    return res.status(403).json({ error: "Invalid secret" });
  }
  const messages = messageQueue.splice(0);
  res.json({ messages, ts: Date.now() });
});

// Health check (also prevents Render from sleeping)
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "whatsapp-webhook-relay", queued: messageQueue.length });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, queued: messageQueue.length });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[Relay] Webhook relay running on port ${port}`);
  console.log(`[Relay] Webhook URL: /webhook`);
  console.log(`[Relay] Poll URL: /poll?secret=${POLL_SECRET}`);
});
