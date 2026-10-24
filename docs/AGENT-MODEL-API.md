# Agent API: the content model

Agent and Admin tokens can read and change the content model (content types,
reusable components and their fields) under `/api/agent/model/...`, so an
automation doesn't need someone's Studio session to add a field.

Every write goes through the same code Studio's Schema Builder uses, so field
keys are camelCased the same way, renames carry entry data across, and a
repeatable-to-single change migrates entries in the same transaction.

## Scopes

All three are opt-in. A token gets them only when they're ticked under
**Settings > API keys > Extra access**. Full access (`*`) and tokens made
before this release don't include them.

| Scope | Allows |
| --- | --- |
| `model.read` | Read types and components with their full field definitions |
| `model.update` | Create types and components; add fields; edit labels, help text, options, validation; rename and reorder fields |
| `model.delete` | Anything that drops or moves content: removing fields, types or components, changing a field's type, making a repeatable or multiple field single, and changing routing (`pageType`, `routePattern`, `slugPattern`, `isPage`, the apiId) |

Any model scope can read. Writes need `model.update`; the changes listed under
`model.delete` need both.

Routing settings sit under `model.delete`, not `model.update`, because changing
them moves every page of that type to new URLs: as disruptive as deleting it,
even though no data is lost.

## Routes

`:group` is `types` or `components`. `:ref` and `:field` accept the apiId (or
field name) or the id.

| Method | Path | Body |
| --- | --- | --- |
| GET | `/agent/model/:group` | |
| GET | `/agent/model/:group/:ref` | |
| POST | `/agent/model/:group` | `{ name, apiId?, kind?, schema }` (as Studio sends it) |
| PATCH | `/agent/model/:group/:ref` | `{ name?, apiId?, draftAndPublish?, schema? }`. Schema keys you send replace the stored ones; `schema.fields` replaces the whole list (this is how you reorder) |
| POST | `/agent/model/:group/:ref/fields` | `{ field, position? }`. Refused with 409 if the name is taken |
| PATCH | `/agent/model/:group/:ref/fields/:field` | `{ changes }`, merged into the field |
| DELETE | `/agent/model/:group/:ref/fields/:field` | |
| DELETE | `/agent/model/:group/:ref` | |

A type whose apiId is `model` can't be reached at `/agent/:type`, since
`/agent/model` is taken. Use the delivery API for it.

## Safety

- **Dry run.** Add `?dryRun=true` to any write to get the resulting type and a
  change summary without saving.
- **Confirm.** A change that drops or converts stored values is refused with
  `409 CONFIRM_REQUIRED` until you repeat it with `?confirm=true`. The 409 body
  is the dry-run summary:

  ```json
  {
    "code": "CONFIRM_REQUIRED",
    "destructive": [{ "field": "ctaLine", "change": "removed" }],
    "routing": [],
    "entriesWithValue": { "ctaLine": 212 }
  }
  ```

  For a component, the summary lists the types that use it (`usedBy`) instead
  of an entry count, because its values live inside those types' entries.
  Deleting a type reports `entriesDeleted`.
- **Audit.** Writes record the same `model.create`, `model.update` and
  `model.delete` events as Studio, with the token named as the actor and
  `metadata.via = "agent"`.
- **Events.** Studio fires no webhook or realtime event for model changes, and
  neither does this API. An open Schema Builder shows the change after a reload.
  The REST delivery API reads the model on every request; the GraphQL schema
  refreshes within 30 seconds, the same as after a Studio edit.

## Example: add a repeatable image field to a component

A repeatable image list is a repeatable Component field with a Media field
inside, the same shape Studio builds:

```sh
curl -X POST "https://cms.example.com/api/agent/model/components/faqSection/fields" \
  -H "Authorization: Bearer $FLOWCMS_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "field": {
      "name": "images",
      "label": "Images",
      "type": "Component",
      "repeatable": true,
      "fields": [
        { "name": "image", "type": "Media" },
        { "name": "alt", "type": "Text" }
      ]
    }
  }'
```

Add `?dryRun=true` first to preview the result.

With `@flowcms/client`:

```ts
await flow.model.addField("types", "cityoverrides", { name: "ctaLine", type: "Text" });
await flow.model.addField("types", "cityoverrides", { name: "mainHeading", type: "Text" });
await flow.model.removeField("types", "cityoverrides", "ctaLine", { dryRun: true }); // see the impact first
```
