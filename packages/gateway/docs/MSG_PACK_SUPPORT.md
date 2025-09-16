# MessagePack Support in the Gateway

This gateway supports MessagePack (MsgPack) as an internal wire optimization between the gateway and downstream services, and optionally between clients and the gateway.

## Summary

| Link              | Direction | Activation                          | Negotiation Header                | Content-Type                     | Notes                               |
| ----------------- | --------- | ----------------------------------- | --------------------------------- | -------------------------------- | ----------------------------------- |
| Client → Gateway  | Request   | Header only affects response        | `x-msgpack-enabled: 1` (optional) | JSON request body                | Header asks for MsgPack response.   |
| Gateway → Client  | Response  | If client sent header               | (same)                            | `application/x-msgpack`          | Falls back to JSON otherwise.       |
| Gateway → Service | Request   | Auto when Service `useMsgPack=true` | `x-msgpack-enabled: 1`            | JSON GraphQL POST body (for now) | Can evolve to MsgPack bodies later. |
| Service → Gateway | Response  | When gateway sent header            | `x-msgpack-enabled: 1`            | `application/x-msgpack`          | Gateway decodes to JS object.       |

## Goals

1. Reduce latency & bandwidth between gateway and high-throughput services.
2. Keep the stitched execution layer unchanged (operate on plain JS objects).
3. Provide a low‑risk opt‑in knob per service via the `useMsgPack` flag.
4. Allow advanced clients to request MsgPack responses end‑to‑end without forcing all clients to upgrade simultaneously.

## Enabling for a Service

1. Toggle `useMsgPack` to true in the Admin UI (create/edit Service).
2. Or SQL: `UPDATE services SET useMsgPack = true WHERE id = '<id>';`
3. Wait for schema refresh interval (or restart) — downstream calls then use MsgPack automatically.

## Client Usage

Send header:

```
x-msgpack-enabled: 1
```

Gateway encodes GraphQL response payload (data/errors/extensions) as MsgPack with `Content-Type: application/x-msgpack`.

No header → standard JSON.

## Internal Mechanics

### Downstream Requests

Gateway HMAC executor sets `x-msgpack-enabled: 1` if the service has `useMsgPack=true`.
If downstream responds with `application/x-msgpack`, the executor lazily loads the `@msgpack/msgpack` decoder (first-hit only) and returns a normal JSON object to stitching. No startup cost if MsgPack is never used.

### Client Encoding Middleware

Koa middleware (in `gateway.ts`) inspects the incoming request for the header and re-encodes the outbound GraphQL result if present. The encoder is also lazy‑loaded on first usage.

### Error Handling

GraphQL errors are encoded inside the same MsgPack envelope; HTTP status code semantics unchanged.

## Observability

Decode/encode failures log warnings (search for operations mentioning `msgpack`). System falls back gracefully when possible.

### Compression Behavior

The gateway disables gzip/deflate compression for `application/x-msgpack` responses since MsgPack is already a compact binary representation and additional compression typically yields marginal gains while adding CPU overhead.

## Backwards Compatibility

Migration default sets all existing services to `useMsgPack=false`. No behavioral change until toggled.
Clients ignoring the header continue to receive JSON.

## Future Enhancements

- MsgPack request bodies to downstream services.
- Replace custom header with standard `Accept` negotiation.
- Evaluate interplay with gzip compression.
- Add integration test for full client ↔ gateway ↔ service MsgPack path.

## Troubleshooting

| Symptom                  | Cause                               | Action                                            |
| ------------------------ | ----------------------------------- | ------------------------------------------------- |
| Got JSON despite header  | Wrong header or path                | Ensure `x-msgpack-enabled: 1` and path `/graphql` |
| Downstream still JSON    | Flag not enabled or refresh pending | Enable flag & wait for refresh / restart          |
| Decode warning           | Invalid MsgPack or library mismatch | Check downstream encoder & versions               |
| Binary output in browser | Viewing MsgPack directly            | Remove header for JSON                            |

---

Update this doc if negotiation semantics change.
