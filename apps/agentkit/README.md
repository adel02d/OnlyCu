# AgentKit — Jose / EnergixCu

Adaptación de [whatsapp-agent-kit](https://github.com/alanjmr21/whatsapp-agent-kit) (MIT)
para el asesor **Jose** de EnergixCu.

WhatsApp entra por **Whapi.cloud** (QR en su panel), **Meta Cloud API** o Twilio.
El cerebro por defecto es el motor Jose del Worker (`AGENT_BACKEND=jose`).
Si pones `ANTHROPIC_API_KEY` y `AGENT_BACKEND=claude`, usa Claude como en el kit original.

```bash
./dev.sh
```

Webhook: `POST /webhook` (también expuesto en la Mini App como `/agentkit/webhook`).
