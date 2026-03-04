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

// POST /update — update an item by matching email, optionally update data and link
app.post('/update', async (c) => {
  const { email, data, link } = await c.req.json<{ email?: string; data?: string; link?: string }>();
  if (!email) {
    return c.json({ success: false, error: 'Missing email param' }, 400);
  }
  const item = store.find((i) => i.email === email);
  if (!item) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  if (data !== undefined) item.data = data;
  if (link !== undefined) item.link = link;
  return c.json({ success: true, data: item });
});

export default app;
