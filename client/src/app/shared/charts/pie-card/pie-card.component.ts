import { Component, computed, input } from '@angular/core';
import {
  ApexChart,
  ApexDataLabels,
  ApexLegend,
  ApexResponsive,
  ApexStroke,
  ApexTooltip,
  NgApexchartsModule,
} from 'ng-apexcharts';

/**
 * Reusable dark-mode pie chart card. Purely presentational: it receives a
 * title plus parallel `labels` / `series` arrays already aggregated by the
 * caller, and renders an ApexCharts donut. No business logic lives here.
 */
@Component({
  selector: 'app-pie-card',
  imports: [NgApexchartsModule],
  templateUrl: './pie-card.component.html',
})
export class PieCardComponent {
  readonly title = input.required<string>();
  readonly labels = input.required<string[]>();
  readonly series = input.required<number[]>();
  /** Prefix shown before each value in the tooltip (e.g. a currency symbol). */
  readonly valuePrefix = input('');
  readonly emptyMessage = input('No data to display yet.');

  protected readonly hasData = computed(
    () => this.series().length > 0 && this.series().some((v) => v > 0)
  );

  protected readonly chart: ApexChart = {
    type: 'donut',
    height: 280,
    fontFamily: 'inherit',
    foreColor: '#94a3b8',
    background: 'transparent',
    animations: { speed: 400 },
  };

  protected readonly colors = [
    '#fbbf24',
    '#60a5fa',
    '#34d399',
    '#f472b6',
    '#a78bfa',
    '#f87171',
    '#22d3ee',
    '#facc15',
    '#fb923c',
    '#4ade80',
  ];

  protected readonly stroke: ApexStroke = { width: 2, colors: ['#12151c'] };

  protected readonly dataLabels: ApexDataLabels = {
    enabled: true,
    style: { fontSize: '12px', fontWeight: 500 },
    dropShadow: { enabled: false },
  };

  protected readonly legend: ApexLegend = {
    position: 'bottom',
    labels: { colors: '#cbd5e1' },
    fontSize: '12px',
    markers: { strokeWidth: 0 },
  };

  protected readonly responsive: ApexResponsive[] = [
    { breakpoint: 640, options: { chart: { height: 240 }, legend: { position: 'bottom' } } },
  ];

  protected readonly tooltip = computed<ApexTooltip>(() => {
    const prefix = this.valuePrefix();
    return {
      theme: 'dark',
      y: {
        formatter: (val: number, opts?: { w?: { globals?: { series?: number[] } } }) => {
          const series = opts?.w?.globals?.series ?? [];
          const total = series.reduce((sum, v) => sum + (v ?? 0), 0);
          const percent = total > 0 ? ((val ?? 0) / total) * 100 : 0;
          return `${prefix}${(val ?? 0).toFixed(2)} (${percent.toFixed(1)}%)`;
        },
      },
    };
  });
}
