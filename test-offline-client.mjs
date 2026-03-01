import { createOfflineClient } from './src/base44-client.mjs';

async function runTest() {
  const client = createOfflineClient({ filePath: '.base44-offline-store.json' });
  const entity = client.asServiceRole.entities.RevenueEvent;

  // Add some test data
  await entity.create({ id: 1, settled: false, amount: 10 });
  await entity.create({ id: 2, settled: true, amount: 20 });
  await entity.create({ id: 3, settled: false, amount: 30 });

  // Run some queries
  const all = await entity.list();
  console.log('All:', all);

  const unsettled = await entity.filter({ settled: false });
  console.log('Unsettled:', unsettled);

  const settled = await entity.filter({ settled: true });
  console.log('Settled:', settled);

  const byId = await entity.filter({ id: 1 });
  console.log('By ID:', byId);
}

runTest();
