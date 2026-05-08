/**
 * Analytics Dashboard — Host-side integration
 *
 * Run: npx tsx examples/analytics-dashboard/host-app.ts
 */

import { WmcpHost } from '../../src/core/host.js';
import { DashboardModule } from './dashboard-module.js';

function generateTimeSeries(metric: string, days: number): Array<{ timestamp: string; value: number }> {
  const points: Array<{ timestamp: string; value: number }> = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    points.push({
      timestamp: new Date(now - i * 86400000).toISOString(),
      value: Math.floor(Math.random() * 1000),
    });
  }
  return points.reverse();
}

async function main() {
  console.log('=== wMCP Analytics Dashboard Example ===\n');

  const dashboard = new DashboardModule();
  const host = new WmcpHost(dashboard.wmcpClient);

  host.connectDirect({
    'metrics:query': async (params) => {
      const metric = params.metric as string;
      const days = 7;
      return generateTimeSeries(metric, days);
    },
    'metrics:aggregate': async (params) => {
      const metrics = params.metrics as string[];
      const result: Record<string, { total: number; avg: number; min: number; max: number }> = {};
      for (const m of metrics) {
        const points = generateTimeSeries(m, 30);
        const values = points.map((p) => p.value);
        result[m] = {
          total: values.reduce((a, b) => a + b, 0),
          avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
      return result;
    },
    'metrics:live': async function* (params) {
      const metrics = (params.metrics as string[]) ?? ['pageviews', 'revenue'];
      for (let i = 0; i < 3; i++) {
        const m = metrics[i % metrics.length];
        yield {
          metric: m,
          value: Math.floor(Math.random() * 500),
          timestamp: new Date().toISOString(),
        };
      }
    },
  });

  host.on('filter:changed', (data) => console.log('[Host] filter:changed:', data));
  host.on('chart:clicked', (data) => console.log('[Host] chart:clicked:', data));
  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await dashboard.mount({
    config: {
      chartType: 'area',
      refreshInterval: 10000,
      dateRange: { preset: 'last7days', start: '2026-03-25', end: '2026-04-01' },
    },
  });

  const filters0 = await host.call<Record<string, unknown>>('dashboard:getFilters');
  console.log('[Host] dashboard:getFilters:', JSON.stringify(filters0, null, 2));

  await host.call('dashboard:setChart', { chartType: 'bar' });
  console.log(`[Host] dashboard:setChart -> module chartType: ${dashboard.getChartType()}`);

  await host.call('dashboard:refresh', {});
  console.log(`[Host] After refresh, series length: ${dashboard.getLastSeries().length}`);

  const pageviews = await dashboard.queryMetrics('pageviews', '2026-03-25', '2026-04-01', 'day');
  console.log(`[Host] Pageview data points: ${pageviews.length}`);

  const agg = await dashboard.getAggregates(['pageviews', 'revenue'], '2026-03-01', '2026-04-01');
  console.log('[Host] Aggregates:', JSON.stringify(agg, null, 2));

  dashboard.onFilterChange({ region: 'us-east', segment: 'enterprise' });

  dashboard.onChartClick('pageviews', 450, '2026-03-28T00:00:00Z');

  host.emit('data:invalidated', { reason: 'backend_rollout' });

  await new Promise((r) => setTimeout(r, 50));

  console.log('\n--- Live feed (first stream) ---');
  await dashboard.startLiveFeed(['pageviews', 'revenue']);

  console.log('\n=== Done ===');
  host.destroy();
}

main().catch(console.error);
