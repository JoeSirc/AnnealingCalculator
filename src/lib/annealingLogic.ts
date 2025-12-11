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

export type UnitSystem = 'metric' | 'imperial';

export function calculateSchedule(
    glassType: GlassType,
    thickness: number, // In current units (cm or inches)
    mode: ScheduleMode = "anneal_only",
    units: UnitSystem = "imperial",
    customAnneal?: number,
    customStrain?: number,
    customProcessTemp?: number, // Override for fuse/cast temp
    customProcessHoldMins?: number, // Override for fuse/cast hold
    customProcessRamp?: number // Override for fuse/cast ramp rate
): ScheduleResult {
    // 1. Get Glass Properties
    const props = GLASS_LIBRARY[glassType];
    let annealTemp = props.anneal_temp; // Always F in library
    let strainPoint = props.strain_point; // Always F in library

    // Helper to convert input temp (potentially C) to F for internal calc if custom
    const toF = (t: number) => units === 'metric' ? (t * 9 / 5) + 32 : t;
    // Helper to convert output F to C
    const toOutputTemp = (f: number) => units === 'metric' ? (f - 32) * 5 / 9 : f;

    if (glassType === "Custom") {
        annealTemp = customAnneal ? toF(customAnneal) : 900;
        strainPoint = customStrain ? toF(customStrain) : 700;
    } else {
        // Custom overrides for standard glass
        if (customAnneal) annealTemp = toF(customAnneal);
        if (customStrain) strainPoint = toF(customStrain);
    }

    // Safe fallback
    if (!annealTemp) annealTemp = 900;
    if (!strainPoint) strainPoint = 700;

    // Determine Process Temp
    let processTemp = annealTemp;
    let processHoldMins = 0;

    if (mode !== "anneal_only") {
        if (customProcessTemp) {
            processTemp = toF(customProcessTemp);
        } else {
            // Defaults (Library is in F)
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
            else if (mode === "cast") processHoldMins = 30;
        }
    }

    // 2. Physics Logic (Annealing)
    // We need inches for the formula
    let thicknessInches = 0;
    if (units === 'metric') {
        // Input is CM
        thicknessInches = thickness / 2.54;
    } else {
        // Input is Inches
        thicknessInches = thickness;
    }

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
    // The previous code had `const roomTemp = 150;`. I will respect that as "Unload Temp".
    const unloadTemp = 150;

    // Rate Calculation Note:
    // If we want points in output units, we should convert the temps FIRST, or convert the points at the end.
    // Easier to calc in F then convert points.

    let rampToProcessRate = 400; // Default F/hr

    // Dynamic Ramp Calculation based on thickness
    if (thicknessInches < 0.25) rampToProcessRate = 400;
    else if (thicknessInches < 0.50) rampToProcessRate = 300;
    else if (thicknessInches < 1.00) rampToProcessRate = 150;
    else rampToProcessRate = 100;

    if (customProcessRamp) {
        // If units are metric, the input is C/hr. Convert to F/hr.
        // Rate conversion: F_rate = C_rate * 9/5
        if (units === 'metric') {
            rampToProcessRate = customProcessRamp * 9 / 5;
        } else {
            rampToProcessRate = customProcessRamp;
        }
    }

    const points: AnnealingSchedulePoint[] = [];

    let currentTime = 0;

    // Start
    points.push({ time: currentTime, temp: toOutputTemp(unloadTemp), label: "Start", segment_type: 'off' });

    // Firing Segments
    if (mode !== "anneal_only") {
        // Ramp to Process
        const timeToProcess = (processTemp - unloadTemp) / rampToProcessRate;
        currentTime += timeToProcess;
        points.push({
            time: currentTime,
            temp: toOutputTemp(processTemp),
            label: `Reach ${mode === "cast" ? "Cast" : "Fuse"}`,
            segment_type: 'process'
        });

        // Hold at Process
        const processHoldHours = processHoldMins / 60;
        currentTime += processHoldHours;
        points.push({
            time: currentTime,
            temp: toOutputTemp(processTemp),
            label: "Process Complete",
            segment_type: 'process'
        });

        // Crash Cool to Anneal
        const timeToAnnealStart = (processTemp - annealTemp) / 1000;
        currentTime += timeToAnnealStart;
        points.push({
            time: currentTime,
            temp: toOutputTemp(annealTemp),
            label: "Cool to Anneal",
            segment_type: 'cool'
        });
    } else {
        // Heat directly to Anneal in 10 minutes
        const timeToSoak = 10 / 60;
        currentTime += timeToSoak;
        points.push({
            time: currentTime,
            temp: toOutputTemp(annealTemp),
            label: "Reach Soak",
            segment_type: 'heat'
        });
    }

    // Anneal Soak
    currentTime += annealSoakHours;
    points.push({
        time: currentTime,
        temp: toOutputTemp(annealTemp),
        label: "Anneal Soak",
        segment_type: 'soak'
    });

    // Cool to Strain
    const timeAnnealToStrain = (annealTemp - strainPoint) / rate1;
    currentTime += timeAnnealToStrain;
    points.push({
        time: currentTime,
        temp: toOutputTemp(strainPoint),
        label: "Strain Point",
        segment_type: 'cool'
    });

    // Cool to Room (Unload)
    const timeToCool = (strainPoint - unloadTemp) / rate2;
    currentTime += timeToCool;
    points.push({
        time: currentTime,
        temp: toOutputTemp(unloadTemp),
        label: "Finished",
        segment_type: 'cool'
    });


    // 4. Generate Instructions
    const tempUnit = units === 'metric' ? "°C" : "°F";
    const rateUnit = units === 'metric' ? "°C/hr" : "°F/hr";

    // Helper for outputting rates/temps in correct unit
    // Rates must be converted: C_rate = F_rate * 5/9
    const toRate = (r: number) => units === 'metric' ? r * 5 / 9 : r;

    // Paragon Sentry
    let paragon = `Make sure to verify these against your specific kiln manual.\n`;
    paragon += `ALL TEMPS IN ${tempUnit}, RATES IN ${rateUnit}\n\n`;

    let segCount = 1;
    let sc = 0;

    if (mode !== "anneal_only") {
        sc = segCount++;
        paragon += `SEG ${sc} (Ramp to Process):\n` +
            `  RA${sc} : ${Math.round(toRate(rampToProcessRate))}\n` +
            `  ${tempUnit}${sc} : ${Math.round(toOutputTemp(processTemp))}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(processHoldMins))}\n\n`;

        sc = segCount++;
        paragon += `SEG ${sc} (Cool to Anneal):\n` +
            `  RA${sc} : FULL (or 9999)\n` +
            `  ${tempUnit}${sc} : ${Math.round(toOutputTemp(annealTemp))}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    } else {
        // Calc rate for 10 mins (10/60 hours)
        // Rate = DeltaTemp / TimeHours
        // DeltaTemp in F is (annealTemp - unloadTemp)
        // Convert that Rate to Output Unit
        const deltaTempF = annealTemp - unloadTemp;
        const rateF = deltaTempF / (10 / 60);

        sc = segCount++;
        paragon += `SEG ${sc} (Ramp to Soak):\n` +
            `  RA${sc} : ${Math.round(toRate(rateF))}\n` +
            `  ${tempUnit}${sc} : ${Math.round(toOutputTemp(annealTemp))}\n` +
            `  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    }

    // Remaining Paragon Segments
    sc = segCount++;
    paragon += `SEG ${sc} (Anneal to Strain):\n` +
        `  RA${sc} : ${Math.round(toRate(rate1))}\n` +
        `  ${tempUnit}${sc} : ${Math.round(toOutputTemp(strainPoint))}\n` +
        `  HLD${sc}: 00:00\n\n`;

    sc = segCount++;
    paragon += `SEG ${sc} (Strain to Room):\n` +
        `  RA${sc} : ${Math.round(toRate(rate2))}\n` +
        `  ${tempUnit}${sc} : ${Math.round(toOutputTemp(unloadTemp))}\n` +
        `  HLD${sc}: 00:00`;


    // Digitry GB4 (Cumulative Time Model)
    let digitry = `NOTE: Time is CUMULATIVE from start.\n`;
    digitry += `TEMPS IN ${tempUnit}\n\n`;
    let digitryStep = 1;

    const schedulePoints = points.slice(1);

    schedulePoints.forEach((p) => {
        const pMins = Math.round(p.time * 60);

        digitry += `STEP ${digitryStep++}: ${p.label}\n` +
            `  TEMP: ${Math.round(p.temp)}${tempUnit}\n` +
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
