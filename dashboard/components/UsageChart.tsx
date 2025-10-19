'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface Props {
  data: Array<{ day: string; request_count: number }>;
}

export function UsageChart({ data }: Props) {
  const labels = data.map((item) => item.day);
  const dataset = data.map((item) => item.request_count);

  return (
    <Line
      options={{
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' } },
          y: { ticks: { color: '#94a3b8' } }
        }
      }}
      data={{
        labels,
        datasets: [
          {
            label: 'Requests',
            data: dataset,
            borderColor: '#34d399',
            backgroundColor: 'rgba(52, 211, 153, 0.15)',
            tension: 0.4,
            fill: true
          }
        ]
      }}
    />
  );
}
