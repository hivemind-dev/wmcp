/**
 * @aurorah/wmcp-analytics-dashboard — Sub-module example
 *
 * The module owns chart, filter, and cached data state; registers
 * dashboard:* capabilities; calls host:requires (metrics:*); emits
 * filter:changed / chart:clicked; listens for data:invalidated.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export interface MetricPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface AggregateResult {
  [metric: string]: { total: number; avg: number; min: number; max: number };
}

export interface LiveUpdate {
  metric: string;
  value: number;
  timestamp: string;
}

const DEFAULT_PRIMARY_METRIC = 'pageviews';

export class DashboardModule {
  public readonly wmcpClient: WmcpClient;
  private chartType = 'line';
  private refreshInterval = 30000;
  private dateRange: Record<string, unknown> = {};
  private filters: Record<string, unknown> = {};
  private lastSeries: MetricPoint[] = [];
  private lastAggregates: AggregateResult | null = null;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);

    this.wmcpClient._registerCapabilities({
      'dashboard:getFilters': async () => ({
        filters: { ...this.filters },
        chartType: this.chartType,
        dateRange: { ...this.dateRange },
      }),

      'dashboard:setChart': async (params) => {
        this.chartType = params.chartType as string;
        return { chartType: this.chartType };
      },

      'dashboard:refresh': async () => {
        const { startDate, endDate } = this.resolveDateRange();
        this.lastSeries = await this.wmcpClient.call<MetricPoint[]>('metrics:query', {
          metric: DEFAULT_PRIMARY_METRIC,
          startDate,
          endDate,
          groupBy: 'day',
          filters: this.filters,
        });
        this.lastAggregates = await this.wmcpClient.call<AggregateResult>('metrics:aggregate', {
          metrics: [DEFAULT_PRIMARY_METRIC, 'revenue'],
          startDate,
          endDate,
        });
        const refreshedAt = new Date().toISOString();
        console.log(
          `[DashboardModule] Refreshed at ${refreshedAt}; ${this.lastSeries.length} points, aggregates keys: ${Object.keys(this.lastAggregates ?? {}).join(', ')}`,
        );
        return { ok: true, refreshedAt, pointCount: this.lastSeries.length };
      },
    });

    this.wmcpClient.on('data:invalidated', (data) => {
      const reason = (data as { reason?: string })?.reason;
      console.log(`[DashboardModule] data:invalidated${reason ? `: ${reason}` : ''}`);
      void this.wmcpClient.call('dashboard:refresh', {});
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    const config = options?.config ?? {};
    this.chartType = (config.chartType as string) ?? this.chartType;
    this.refreshInterval = (config.refreshInterval as number) ?? this.refreshInterval;
    this.dateRange = {
      ...(typeof config.dateRange === 'object' && config.dateRange !== null
        ? (config.dateRange as Record<string, unknown>)
        : {}),
    };
    console.log(
      `[DashboardModule] Mounted. chartType=${this.chartType}, refreshInterval=${this.refreshInterval}ms`,
    );
  }

  async queryMetrics(
    metric: string,
    startDate: string,
    endDate: string,
    groupBy?: string,
  ): Promise<MetricPoint[]> {
    const data = await this.wmcpClient.call<MetricPoint[]>('metrics:query', {
      metric,
      startDate,
      endDate,
      groupBy,
      filters: this.filters,
    });
    console.log(`[DashboardModule] Queried "${metric}": ${data.length} data points`);
    return data;
  }

  async getAggregates(metrics: string[], startDate: string, endDate: string): Promise<AggregateResult> {
    return this.wmcpClient.call<AggregateResult>('metrics:aggregate', {
      metrics,
      startDate,
      endDate,
    });
  }

  async startLiveFeed(metrics: string[]): Promise<void> {
    console.log(`[DashboardModule] Starting live feed for: ${metrics.join(', ')}`);
    for await (const update of this.wmcpClient.stream<LiveUpdate>('metrics:live', { metrics })) {
      console.log(`[DashboardModule] Live: ${update.metric} = ${update.value}`);
    }
  }

  onChartClick(metric: string, value: number, timestamp: string): void {
    this.wmcpClient.emit('chart:clicked', { metric, value, timestamp });
  }

  onFilterChange(filters: Record<string, unknown>): void {
    this.filters = { ...filters };
    this.wmcpClient.emit('filter:changed', { filters: this.filters, dateRange: { ...this.dateRange } });
  }

  getChartType(): string {
    return this.chartType;
  }

  getLastSeries(): MetricPoint[] {
    return this.lastSeries;
  }

  private resolveDateRange(): { startDate: string; endDate: string } {
    const start = this.dateRange.start as string | undefined;
    const end = this.dateRange.end as string | undefined;
    return {
      startDate: start ?? '2026-03-25',
      endDate: end ?? '2026-04-01',
    };
  }
}

export { manifest };
