# ORBI Shop Talk Gateway Integration

ORBI Shop is a trusted ORBI product, but it should still use its own scoped Talk Gateway credential instead of reusing the ORBI Core master key.

## Runtime Variables

```env
ORBI_TALK_GATEWAY_URL=https://talk.orbifinancial.com
ORBI_SHOP_TALK_API_KEY=<generated scoped Talk API credential>
ORBI_SHOP_TALK_OWNER_UID=<firebase owner uid or trusted service owner>
ORBI_SHOP_TALK_OWNER_EMAIL=shop@orbifinancial.com
```

Recommended credential scopes:

- `send_template`
- `send_email`
- `send_sms`
- `templates_read`

## Sender Policy

ORBI Shop may use any approved ORBI sender when business context requires it, but the default sender for marketplace lifecycle messages is:

```text
ORBI Shop <shop@orbifinancial.com>
```

Use these identities by purpose:

- `shop@orbifinancial.com`: orders, escrow, delivery, receipts, marketplace lifecycle.
- `offers@orbifinancial.com`: approved buyer offers, discovery campaigns, and promotional marketplace notices.
- `sellers@orbifinancial.com`: seller education, merchant growth campaigns, and partner guidance.
- `support@orbifinancial.com`: disputes, refunds requiring support, seller/customer assistance.
- `security@orbifinancial.com`: fraud warnings, risky account or order alerts.
- `no-reply@orbifinancial.com`: purely automated notices that should not receive replies.

## Template Pack

Import `templates/orbi_shop_talk_templates.json` from the Talk Gateway dashboard, or through the authenticated import API.

Template names:

- `SHOP_ORDER_CREATED`
- `SHOP_SELLER_NEW_ORDER`
- `SHOP_ESCROW_FUNDED`
- `SHOP_DELIVERY_CONFIRMED`
- `SHOP_DISPUTE_OPENED`
- `SHOP_REFUND_PROCESSED`
- `SHOP_CAMPAIGN_PROMO_BUYERS`
- `SHOP_CAMPAIGN_PROMO_SELLERS`

Transactional and promotional templates have `email` and `sms` variants in both Swahili (`sw`) and English (`en`) for the initial ORBI Shop rollout.

## Send Template Example

```bash
curl -X POST https://talk.orbifinancial.com/api/send-template \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ORBI_SHOP_TALK_API_KEY" \
  -d '{
    "templateName": "SHOP_ORDER_CREATED",
    "recipient": "customer@example.com",
    "channel": "email",
    "language": "sw",
    "messageType": "transactional",
    "ownerUid": "'"$ORBI_SHOP_TALK_OWNER_UID"'",
    "ownerEmail": "shop@orbifinancial.com",
    "requestId": "shop-order-created-ORBI-SHOP-10001",
    "data": {
      "customerName": "Daniel",
      "orderId": "ORBI-SHOP-10001",
      "currency": "TZS",
      "amount": "125000",
      "refId": "SHOP-REF-10001"
    }
  }'
```

## Security Rules

- Never put `ORBI_SHOP_TALK_API_KEY` in browser JavaScript, mobile apps, screenshots, logs, or templates.
- Always send `requestId` so retries do not create duplicate messages.
- Use template messages for customer lifecycle events; reserve direct email/SMS for controlled operational cases.
- Keep ORBI Shop message delivery separate from ORBI Pay Gateway. Pay Gateway moves money; Talk Gateway communicates.
