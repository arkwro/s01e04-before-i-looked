import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { countStatuses, readNight } from './digest/read.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { DigestTable } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const nightSummaries = status.nights.map((night) => ({
      night,
      counts: countStatuses(readNight(config.runsDir, night)?.rows ?? []),
    }));
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} nightSummaries={nightSummaries} />
      </Layout>,
    );
  });

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (!digest) return c.notFound();

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <h1>morning digest · {night}</h1>
        {digest.rows.length === 0 ? <p class="mute">nothing ran</p> : <DigestTable rows={digest.rows} />}
        {digest.malformedLines > 0 ? (
          <p class="warn">
            {digest.malformedLines} malformed {digest.malformedLines === 1 ? 'line' : 'lines'} counted
          </p>
        ) : null}
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));
    if (!digest) return c.notFound();
    return c.json(digest.rows);
  });

  return app;
}
