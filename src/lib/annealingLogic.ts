export type GlassType =
    | "Bullseye (COE 90)"
    | "Oceanside / Spectrum (COE 96)"
    | "Effetre / Moretti (COE 104)"
    | "Simax / Pyrex (Borosilicate COE 33)"
    | "Satake (COE 110-120)"
    | "Custom";

export type ScheduleMode = "anneal_only" | "tack_fuse" | "full_fuse" | "cast";

export interface GlassProperties {
    anneal_temp: number | null;
    strain_point: number | null;
    tack_fuse_temp?: number;
    full_fuse_temp?: number;
    cast_temp?: number;
}

export const GLASS_LIBRARY: Record<GlassType, GlassProperties> = {
    "Bullseye (COE 90)": {
        anneal_temp: 900,
        strain_point: 700,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1490,
        cast_temp: 1525
    },
    "Oceanside / Spectrum (COE 96)": {
        anneal_temp: 950,
        strain_point: 800,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1465,
        cast_temp: 1500
    },
    "Effetre / Moretti (COE 104)": {
        anneal_temp: 940,
        strain_point: 840,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1450,
        cast_temp: 1480 // Estimated
    },
    "Simax / Pyrex (Borosilicate COE 33)": {
        anneal_temp: 1050,
        strain_point: 950,
        tack_fuse_temp: 1600, // Very high, flame usually
        full_fuse_temp: 2000, // Very high
        cast_temp: 2200 // Requires high temp kiln
    },
    "Satake (COE 110-120)": {
        anneal_temp: 890,
        strain_point: 750,
        tack_fuse_temp: 1300,
        full_fuse_temp: 1400,
        cast_temp: 1450
    },
    "Custom": {
        anneal_temp: null,
        strain_point: null
    },
};

export interface AnnealingSchedulePoint {
    time: number; // Cumulative hours
    temp: number; // Fahrenheit
    label?: string;
    segment_type: 'heat' | 'soak' | 'cool' | 'off' | 'process';
}

export interface ScheduleResult {
    points: AnnealingSchedulePoint[];
    paragon_instructions: string;
    digitry_instructions: string;
}

export function calculateSchedule(
    glassType: GlassType,
    thicknessMm: number,
    mode: ScheduleMode = "anneal_only",
    customAnneal?: number,
    customStrain?: number,
    customProcessTemp?: number, // Override for fuse/cast temp
    customProcessHoldMins?: number // Override for fuse/cast hold
): ScheduleResult {
    // 1. Get Glass Properties
    const props = GLASS_LIBRARY[glassType];
    let annealTemp = props.anneal_temp;
    let strainPoint = props.strain_point;

    if (glassType === "Custom") {
        annealTemp = customAnneal ?? 900;
        strainPoint = customStrain ?? 700;
    }

    // Safe fallback
    if (!annealTemp) annealTemp = 900;
    if (!strainPoint) strainPoint = 700;

    // Determine Process Temp
    let processTemp = annealTemp;
    let processHoldMins = 0;

    if (mode !== "anneal_only") {
        if (customProcessTemp) {
            processTemp = customProcessTemp;
        } else {
            // Defaults
            if (mode === "tack_fuse") processTemp = props.tack_fuse_temp ?? (annealTemp + 400);
            else if (mode === "full_fuse") processTemp = props.full_fuse_temp ?? (annealTemp + 550);
            else if (mode === "cast") processTemp = props.cast_temp ?? (annealTemp + 600);
        }

        // Process Hold Defaults
        if (customProcessHoldMins !== undefined) {
            processHoldMins = customProcessHoldMins;
        } else {
            if (mode === "tack_fuse") processHoldMins = 10;
            else if (mode === "full_fuse") processHoldMins = 15;
            else if (mode === "cast") processHoldMins = 30; // Longer for casting usually
        }
    }

    // 2. Physics Logic (Annealing)
    const thicknessInches = thicknessMm / 25.4;

    // Soak Time Calculation (Anneal Soak)
    let annealSoakHours = 0;
    if (thicknessInches < 0.25) annealSoakHours = 0.5;
    else if (thicknessInches < 0.50) annealSoakHours = 1.0;
    else if (thicknessInches < 1.00) annealSoakHours = 2.0;
    else annealSoakHours = (180 + (thicknessInches * 60)) / 60;

    // Rate 1 (Anneal to Strain)
    let rate1 = 0; // F/hr
    if (thicknessInches < 0.25) rate1 = 300;
    else if (thicknessInches < 0.50) rate1 = 150;
    else if (thicknessInches < 1.00) rate1 = 90;
    else rate1 = 45;

    // Rate 2 (Strain to Room)
    let rate2 = rate1 * 2;
    if (rate2 > 400) rate2 = 400;

    // 3. Generate Schedule Points
    const roomTemp = 150; // User requested 150 as safe unload temp
    const rampToProcessRate = 400; // Moderate ramp to protect glass involved in fusing


    const points: AnnealingSchedulePoint[] = [];

    let currentTime = 0;

    // Start
    points.push({ time: currentTime, temp: roomTemp, label: "Start", segment_type: 'off' });

    // Firing Segments (if not anneal only)
    if (mode !== "anneal_only") {
        // Ramp to Process
        // Duration = (Target - Start) / Rate
        const timeToProcess = (processTemp - roomTemp) / rampToProcessRate;
        currentTime += timeToProcess;
        points.push({
            time: currentTime,
            temp: processTemp,
            label: `Reach ${mode === "cast" ? "Cast" : "Fuse"}`,
            segment_type: 'process'
        });

        // Hold at Process
        const processHoldHours = processHoldMins / 60;
        currentTime += processHoldHours;
        points.push({
            time: currentTime,
            temp: processTemp,
            label: "Process Complete",
            segment_type: 'process'
        });

        // Crash Cool to Anneal
        // In reality, this takes time, but we model it as a segment
        // Assume efficient cooling or flash venting: 
        // For calculation, let's use a "Fast" rate like 1500F/hr or just minimal time
        const timeToAnnealStart = (processTemp - annealTemp) / 1000; // 1000F/hr approximate crash
        currentTime += timeToAnnealStart;
        points.push({
            time: currentTime,
            temp: annealTemp,
            label: "Cool to Anneal",
            segment_type: 'cool'
        });
    } else {
        // Ramp directly to Anneal (Anneal Only)
        // Usually 500F/hr or Full
        const timeToSoak = (annealTemp - roomTemp) / 500;
        currentTime += timeToSoak;
        points.push({
            time: currentTime,
            temp: annealTemp,
            label: "Reach Soak",
            segment_type: 'heat'
        });
    }

    // Anneal Soak
    currentTime += annealSoakHours;
    points.push({
        time: currentTime,
        temp: annealTemp,
        label: "Anneal Soak",
        segment_type: 'soak'
    });

    // Cool to Strain
    const timeAnnealToStrain = (annealTemp - strainPoint) / rate1;
    currentTime += timeAnnealToStrain;
    points.push({
        time: currentTime,
        temp: strainPoint,
        label: "Strain Point",
        segment_type: 'cool'
    });

    // Cool to Room
    const timeToCool = (strainPoint - roomTemp) / rate2;
    currentTime += timeToCool;
    points.push({
        time: currentTime,
        temp: roomTemp,
        label: "Finished",
        segment_type: 'cool'
    });


    // 4. Generate Instructions

    // Paragon Sentry
    let paragon = `Make sure to verify these against your specific kiln manual.\n\n`;
    let segCount = 1;
    let sc = 0;

    if (mode !== "anneal_only") {
        sc = segCount++;
        paragon += `SEG ${sc} (Ramp to Process):\n` +
            `  RA${sc} : ${rampToProcessRate}\n` +
            `  °F${sc} : ${Math.round(processTemp)}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(processHoldMins))}\n\n`;

        sc = segCount++;
        paragon += `SEG ${sc} (Cool to Anneal):\n` +
            `  RA${sc} : FULL (or 9999)\n` +
            `  °F${sc} : ${Math.round(annealTemp)}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    } else {
        sc = segCount++;
        paragon += `SEG ${sc} (Ramp to Soak):\n` +
            `  RA${sc} : FULL (or 9999)\n` +
            `  °F${sc} : ${Math.round(annealTemp)}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    }

    // Remaining Paragon Segments (Annealing Cool Down)
    sc = segCount++;
    paragon += `SEG ${sc} (Anneal to Strain):\n` +
        `  RA${sc} : ${Math.round(rate1)}\n` +
        `  °F${sc} : ${Math.round(strainPoint)}\n` +
        `  HLD${sc}: 00:00\n\n`;

    sc = segCount++;
    paragon += `SEG ${sc} (Strain to Room):\n` +
        `  RA${sc} : ${Math.round(rate2)}\n` +
        `  °F${sc} : ${Math.round(roomTemp)}\n` +
        `  HLD${sc}: 00:00`;


    // Digitry GB4 (Cumulative Time Model)
    // Structure: STEP N -> TEMP X, TIME Y (Cumulative Minutes)
    // We traverse our points.
    // Point 0 is start (0, 80).
    // Subsequent points define the steps.

    let digitry = `NOTE: Time is CUMULATIVE from start.\n\n`;
    let digitryStep = 1;


    // If firing, we have specific steps. 
    // If anneal only, specific steps.
    // Actually, we can just iterate the generated points (excluding start).

    // Filter points to exclude index 0
    const schedulePoints = points.slice(1);

    // Digitry usually needs integer minutes
    schedulePoints.forEach((p) => {
        const pMins = Math.round(p.time * 60);
        // Sometimes points might be effectively same time (crash cool), ensure strictly increasing or equal?
        // Digitry handles same time as instant? Or requires +1 min? 
        // For "Hold as repeat step", temp is same, time increases.

        digitry += `STEP ${digitryStep++}: ${p.label}\n` +
            `  TEMP: ${Math.round(p.temp)}°F\n` +
            `  TIME: ${generateTimeStr(pMins)}\n\n`;
    });

    return {
        points,
        paragon_instructions: paragon,
        digitry_instructions: digitry
    };
}

function generateTimeStr(totalMins: number): string {
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
