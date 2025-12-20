import React from 'react';
import Plot from 'react-plotly.js';
import type { AnnealingSchedulePoint } from '../lib/annealingLogic';

interface AnnealingChartProps {
    points: AnnealingSchedulePoint[];
    units: 'metric' | 'imperial';
}

export const AnnealingChart: React.FC<AnnealingChartProps> = ({ points, units }) => {
    // Dynamic Trace Generation Logic
    // We split the points into traces based on color.
    // Heat/Soak/Process = Red
    // Cool = Blue

    const getColor = (type: string) => {
        if (type === 'cool') return '#3b82f6'; // Blue-500
        if (type === 'process_hold') return '#eab308'; // Yellow-500 (Visual Hold / Indefinite)
        return '#ef4444'; // Red-500 (Heat, Soak, Process, Mold Dry)
    };

    const getLabel = (type: string) => {
        if (type === 'cool') return 'Cooling';
        if (type === 'process_hold') return 'Indefinite Hold';
        return 'Heating / Soaking';
    }

    const traces: any[] = [];

    if (points.length > 0) {
        let currentX = [points[0].time];
        let currentY = [points[0].temp];
        let currentIndices = [0];

        // Determine initial type from first segment (point 1) if exists, else default
        let currentType = points.length > 1 ? points[1].segment_type : 'off';
        let currentColor = getColor(currentType);
        let currentName = getLabel(currentType);

        // Track which legends we've shown to avoid duplicates
        const legendsShown = new Set<string>();

        const pushTrace = (x: number[], y: number[], indices: number[], color: string, name: string) => {
            const isIndefiniteTrace = (name === 'Indefinite Hold');

            // Calculate marker opacity to hide overlaps
            // If we are NOT the indefinite trace, hide our marker if it lands on an indefinite hold point
            const markerOpacities = indices.map((idx, i) => {
                if (isIndefiniteTrace) return 1;
                // If it's the first point in a trace being shown in the legend, keep it visible for the legend icon
                if (i === 0 && !legendsShown.has(name)) return 1;
                // If the point acts as a junction for the hold, hide it so the Yellow point shows cleanly
                if (points[idx].segment_type === 'process_hold') return 0;
                return 1;
            });

            traces.push({
                x: x,
                y: y,
                type: 'scatter',
                mode: isIndefiniteTrace ? 'markers' : 'lines+markers',
                name: name,
                line: { color: color, width: 3 },
                marker: { color: color, size: 8, opacity: markerOpacities },
                showlegend: !legendsShown.has(name),
                legendgroup: name
            });
            legendsShown.add(name);
        };

        for (let i = 0; i < points.length - 1; i++) {
            const nextPoint = points[i + 1];
            const nextType = nextPoint.segment_type;
            const nextColor = getColor(nextType);
            const nextName = getLabel(nextType);

            if (nextName === currentName) {
                // Continue trace
                currentX.push(nextPoint.time);
                currentY.push(nextPoint.temp);
                currentIndices.push(i + 1);
            } else {
                // End current trace
                pushTrace(currentX, currentY, currentIndices, currentColor, currentName);

                // Start new trace
                currentColor = nextColor;
                currentName = nextName;
                currentX = [points[i].time, nextPoint.time];
                currentY = [points[i].temp, nextPoint.temp];
                currentIndices = [i, i + 1];
            }
        }

        // Push final trace
        pushTrace(currentX, currentY, currentIndices, currentColor, currentName);

        // Sort traces: Indefinite Hold (Yellow) MUST be last to render on top
        traces.sort((a, b) => {
            if (a.name === 'Indefinite Hold') return 1;
            if (b.name === 'Indefinite Hold') return -1;
            return 0;
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
                        title: { text: `Temperature (°${units === 'metric' ? 'C' : 'F'})` },
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
