import React from 'react';
import Plot from 'react-plotly.js';
import type { AnnealingSchedulePoint } from '../lib/annealingLogic';

interface AnnealingChartProps {
    points: AnnealingSchedulePoint[];
}

export const AnnealingChart: React.FC<AnnealingChartProps> = ({ points }) => {
    // Dynamic Trace Generation Logic
    // We split the points into traces based on color.
    // Heat/Soak/Process = Red
    // Cool = Blue

    const getColor = (type: string) => {
        if (type === 'cool') return '#3b82f6'; // Blue-500
        return '#ef4444'; // Red-500 (Heat, Soak, Process)
    };

    const getLabel = (type: string) => {
        if (type === 'cool') return 'Cooling';
        return 'Heating / Soaking';
    }

    const traces: any[] = [];

    if (points.length > 0) {
        let currentX = [points[0].time];
        let currentY = [points[0].temp];
        // Determine initial type from first segment (point 1) if exists, else default
        let currentType = points.length > 1 ? points[1].segment_type : 'off';
        let currentColor = getColor(currentType);
        let currentName = getLabel(currentType);

        // Track which legends we've shown to avoid duplicates
        const legendsShown = new Set<string>();

        for (let i = 0; i < points.length - 1; i++) {
            const nextPoint = points[i + 1];
            const nextType = nextPoint.segment_type;
            const nextColor = getColor(nextType);

            if (nextColor === currentColor) {
                // Continue trace
                currentX.push(nextPoint.time);
                currentY.push(nextPoint.temp);
            } else {
                // End current trace
                traces.push({
                    x: currentX,
                    y: currentY,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: currentName,
                    line: { color: currentColor, width: 3 },
                    marker: { color: currentColor },
                    showlegend: !legendsShown.has(currentName),
                    legendgroup: currentName
                });
                legendsShown.add(currentName);

                // Start new trace
                // IMPORTANT: New trace must overlap start point to be continuous
                currentColor = nextColor;
                currentName = getLabel(nextType);
                currentX = [points[i].time, nextPoint.time];
                currentY = [points[i].temp, nextPoint.temp];
                // But wait, points[i] is the END of previous segment.
                // It is the START of this new segment.
            }
        }

        // Push final trace
        traces.push({
            x: currentX,
            y: currentY,
            type: 'scatter',
            mode: 'lines+markers',
            name: currentName,
            line: { color: currentColor, width: 3 },
            marker: { color: currentColor },
            showlegend: !legendsShown.has(currentName),
            legendgroup: currentName
        });
    }

    return (
        <div className="w-full h-[400px] bg-slate-900 rounded-lg overflow-hidden shadow-xl border border-slate-700">
            <Plot
                style={{ width: '100%', height: '100%' }}
                useResizeHandler={true}
                data={traces}
                layout={{
                    title: { text: 'Firing & Annealing Schedule', font: { color: '#e2e8f0' } },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#94a3b8' },
                    xaxis: {
                        title: { text: 'Time (Hours)' },
                        gridcolor: '#334155',
                        zerolinecolor: '#475569'
                    },
                    yaxis: {
                        title: { text: 'Temperature (°F)' },
                        gridcolor: '#334155',
                        zerolinecolor: '#475569'
                    },
                    margin: { t: 50, r: 30, l: 60, b: 50 },
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.2 }
                }}
                config={{ responsive: true, displayModeBar: false }}
            />
        </div>
    );
};
