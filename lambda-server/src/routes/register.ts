import { Hono } from 'hono';

const app = new Hono();

// In-memory store — persists across warm Lambda invocations, resets on cold start
interface TempItem {
  email: string;
  link: string;
  data: string;
}

let store: TempItem[] = [];

// GET / — list all items
app.get('/', (c) => {
  return c.json({ success: true, data: store });
});

// PUT / — replace entire list
app.put('/', async (c) => {
  const body = await c.req.json<TempItem[]>();
  if (!Array.isArray(body)) {
    return c.json({ success: false, error: 'Body must be an array' }, 400);
  }
  store = body;
  return c.json({ success: true, data: store });
});

// GET /link?email=... — return the link for a given email
app.get('/link', (c) => {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ success: false, error: 'Missing email param' }, 400);
  }
  const item = store.find((i) => i.email === email);
  if (!item) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  return c.json({ success: true, link: item.link });
});

// POST /update — update an item's data field by matching data value
app.post('/update', async (c) => {
  const { data, link } = await c.req.json<{ data: string; link?: string }>();
  if (!data) {
    return c.json({ success: false, error: 'Missing data param' }, 400);
  }
  const item = store.find((i) => i.data === data);
  if (!item) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  if (link !== undefined) {
    item.link = link;
  }
  return c.json({ success: true, data: item });
});

export default app;
