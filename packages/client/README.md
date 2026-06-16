# @flowcms/client

The official JavaScript client for [Flow CMS](https://flowcms.co). Read your content, or let an agent write it — in 3 lines.

```bash
npm install @flowcms/client
```

```js
import { createClient } from "@flowcms/client";

const flow = createClient({
  url: "https://cms.yoursite.com/api", // 👈 your Flow CMS URL
  token: "flw_xxx",                          // Settings → API Keys
});

// Read (Content/Preview token)
const { data: posts } = await flow.list("articles", { limit: 10, sort: "publishedAt:desc" });
const post = await flow.get("articles", "my-slug");
const home = await flow.single("homepage");

// GraphQL
const { entries } = await flow.graphql(`{ entries(type:"article", limit:5){ id slug data } }`);

// Write (Agent/Admin token)
const draft = await flow.create("articles", { title: "Hello", data: { body: "<p>Hi</p>" } });
await flow.publish("articles", draft.id);
```

Works in the browser and Node 18+ (uses the global `fetch`; pass `fetch` in `createClient` for older runtimes).

### Live editing (visual editor)

A separate, browser-only entry point enables in-place editing of your rendered
pages inside the Flow CMS live preview. It's independent of the data client above
and needs no token.

```ts
import { enableVisualEditing } from "@flowcms/client/visual-editing";

enableVisualEditing(); // call once on the client (a no-op during SSR)
```

Then tag editable regions with the matching content-model field name:

```html
<h1 data-flowcms-field="title">My title</h1>
<div data-flowcms-field="body" data-flowcms-rich>…rich content…</div>
```

Use `data-flowcms-field="<name>"` for any field (`title` maps to the entry title),
and add `data-flowcms-rich` to keep rich HTML. See the studio's **Connect your site**
panel for a copy-paste snippet for your framework.

### Read options
`list` / `get` / `single` accept: `limit`, `offset`, `sort` (`"field:desc"`), `fields` (string[]), `locale`, and `filters` (`{ category: "news" }`).

### Tokens
Create them in **Settings → API Keys**. **Content** reads published content, **Preview** also reads drafts, **Agent/Admin** can write.
