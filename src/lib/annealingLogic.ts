export type GlassType =
    | "Bullseye (COE 90)"
    | "Oceanside / Spectrum (COE 96)"
    | "Effetre / Moretti (COE 104)"
    | "Simax / Pyrex (Borosilicate COE 33)"
    | "Satake (COE 110-120)"
    | "Custom";

export type ScheduleMode = "anneal_only" | "tack_fuse" | "full_fuse" | "cast" | "slump";
export type UnitSystem = 'metric' | 'imperial';

// New Physics Enums
export type ShapeFactor = "slab" | "uneven" | "hollow_deep";
export const SHAPE_FACTORS: Record<ShapeFactor, number> = {
    "slab": 1.0,
    "uneven": 1.5,
    "hollow_deep": 2.0
};

export type Conservativeness = "fast" | "standard" | "cautious";
export const CONSERVATIVENESS_FACTORS: Record<Conservativeness, number> = {
    "fast": 0.75,    // Economy / Aggressive (User Requested)
    "standard": 1.0, // Standard Baseline
    "cautious": 1.5  // Safety Margin
};

export interface GlassProperties {
    anneal_temp: number | null; // Fahrenheit
    strain_point: number | null; // Fahrenheit
    brand_factor: number;       // Multiplier for cooling rates (1.0 = standard soft glass)
    slump_temp?: number;
    tack_fuse_temp?: number;
    full_fuse_temp?: number;
    cast_temp?: number;
}

export const GLASS_LIBRARY: Record<GlassType, GlassProperties> = {
    "Bullseye (COE 90)": {
        anneal_temp: 961, // 516°C
        strain_point: 900, // 482°C
        brand_factor: 1.0,
        slump_temp: 1225,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1490,
        cast_temp: 1525
    },
    "Oceanside / Spectrum (COE 96)": {
        anneal_temp: 950, // 510°C
        strain_point: 850, // 455°C
        brand_factor: 1.0,
        slump_temp: 1225,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1465,
        cast_temp: 1500
    },
    "Effetre / Moretti (COE 104)": {
        anneal_temp: 968, // 520°C
        strain_point: 860, // 460°C
        brand_factor: 1.0,
        slump_temp: 1200,
        tack_fuse_temp: 1350,
        full_fuse_temp: 1450,
        cast_temp: 1480
    },
    "Simax / Pyrex (Borosilicate COE 33)": {
        anneal_temp: 1050, // 565°C
        strain_point: 950, // 510°C
        brand_factor: 1.8, // 3x tolerance but 1.8 conservative start
        slump_temp: 1300,
        tack_fuse_temp: 1600,
        full_fuse_temp: 2000,
        cast_temp: 2200
    },
    "Satake (COE 110-120)": {
        anneal_temp: 896, // 480°C
        strain_point: 806, // 430°C
        brand_factor: 0.75, // Very high lead
        slump_temp: 1150,
        tack_fuse_temp: 1300,
        full_fuse_temp: 1400,
        cast_temp: 1450
    },
    "Custom": {
        anneal_temp: null,
        strain_point: null,
        brand_factor: 1.0
    },
};

export interface AnnealingSchedulePoint {
    time: number; // Cumulative hours
    temp: number; // Fahrenheit
    label?: string;
    segment_type: 'heat' | 'soak' | 'cool' | 'off' | 'process' | 'process_hold';
}

export interface ScheduleResult {
    points: AnnealingSchedulePoint[];
    paragon_instructions: string;
    digitry_instructions: string;
}

export function calculateSchedule(
    glassType: GlassType,
    thickness: number, // In current units (cm or inches)
    mode: ScheduleMode = "anneal_only",
    units: UnitSystem = "imperial",
    shape: ShapeFactor = "slab",
    conservativeness: Conservativeness = "fast",
    customAnneal?: number,
    customStrain?: number,
    customProcessTemp?: number,
    customProcessHoldMins?: number,
    customProcessRamp?: number,
    moldDryHours?: number,
    moldDryTemp?: number,
    processHoldIndefinite?: boolean
): ScheduleResult {
    // 1. Get Glass Properties
    const props = GLASS_LIBRARY[glassType];
    let annealTemp = props.anneal_temp;
    let strainPoint = props.strain_point;
    const brandFactor = props.brand_factor;

    // Helpers
    const toF = (t: number) => units === 'metric' ? (t * 9 / 5) + 32 : t;
    const toOutputTemp = (f: number) => units === 'metric' ? (f - 32) * 5 / 9 : f;

    // Custom Overrides
    if (glassType === "Custom") {
        annealTemp = customAnneal ? toF(customAnneal) : 900;
        strainPoint = customStrain ? toF(customStrain) : 700;
    } else {
        if (customAnneal) annealTemp = toF(customAnneal);
        if (customStrain) strainPoint = toF(customStrain);
    }

    // Safety Fallback
    if (!annealTemp) annealTemp = 900;
    if (!strainPoint) strainPoint = 700;

    // Process Temp (Max Temp)
    let processTemp = annealTemp;
    let processHoldMins = 0;

    if (mode !== "anneal_only") {
        // ... (Logic for process temp same as before, essentially)
        if (customProcessTemp) {
            processTemp = toF(customProcessTemp);
        } else {
            if (mode === "slump") processTemp = props.slump_temp ?? (annealTemp + 325);
            else if (mode === "tack_fuse") processTemp = props.tack_fuse_temp ?? (annealTemp + 400);
            else if (mode === "full_fuse") processTemp = props.full_fuse_temp ?? (annealTemp + 550);
            else if (mode === "cast") processTemp = props.cast_temp ?? (annealTemp + 600);
        }

        if (customProcessHoldMins !== undefined) {
            processHoldMins = customProcessHoldMins;
        } else {
            if (mode === "slump") processHoldMins = 20;
            else if (mode === "tack_fuse") processHoldMins = 10;
            else if (mode === "full_fuse") processHoldMins = 15;
            else if (mode === "cast") processHoldMins = 30; // Base, but often needs more for cast
        }
    }

    // Override hold if indefinite
    if (processHoldIndefinite) {
        processHoldMins = 0; // It takes "0 time" in the schedule plot calculation, effectively a pause point
    }

    // 2. Physics Calculation

    // Convert thickness to mm for consistent internal math (report used mm and inches mixed, let's standardize on mm for formulas if easiest, or inches. The report formulas: (25 / thickness_mm)^2. 25mm is approx 1 inch.)
    // Let's use mm for the physics formulas as per report "25 / thickness_mm".

    let thicknessMm = 0;
    if (units === 'metric') {
        thicknessMm = thickness * 10; // cm -> mm
    } else {
        thicknessMm = thickness * 25.4; // inch -> mm
    }

    // Effective Thickness
    const shapeMultiplier = SHAPE_FACTORS[shape];
    const effectiveThicknessMm = thicknessMm * shapeMultiplier;

    // Conservativeness Factor
    const safeFactor = CONSERVATIVENESS_FACTORS[conservativeness];

    // -- CALCULATION: ANNEAL SOAK --
    // t_soak_hours = max(0.5, 0.16 * effective_thickness_mm) * safeFactor
    // 0.16 * 6mm (~1/4") = 0.96 hours. 
    // Bullseye chart says 1 hr for 6mm. Matches well.
    let annealSoakHours = Math.max(0.5, 0.16 * effectiveThicknessMm) * safeFactor;

    // -- CALCULATION: COOLING RATE 1 (Anneal -> Strain) --
    // R1 = 15 C/h * (25 / thickness_mm)^2 * brand_factor / safeFactor
    // Report formula uses 15 C/h (which is 27 F/h) for 25mm (1 inch). 
    // Bullseye chart says 27 F/h for 1 inch. Matches perfectly.
    // NOTE: Formula uses PHYSICAL thickness for stress limitation, or EFFECTIVE? 
    // Usually thermal gradients depend on physical thickness, but heat trapping depends on shape. 
    // Complex forms usually require "effective thickness" for the cooling rate too to be safe. 
    // We will use Effective Thickness for the cooling rate denominator to be safe (slower rate for deeper forms).

    const baseRate1_C = 15; // C per hour normalized to 25mm
    let r1_C = baseRate1_C * Math.pow(25 / effectiveThicknessMm, 2) * brandFactor / safeFactor;

    // Cap R1: Max 300 C/h (540 F/h)
    if (r1_C > 300) r1_C = 300;

    let rate1_F = r1_C * 9 / 5; // Convert to F/hr

    // -- CALCULATION: COOLING RATE 2 (Strain -> Room/Safe) --
    // R2 = 27 C/h * (25 / thickness_mm)^2 * brand_factor / safeFactor
    // 27 C/h = ~49 F/h. Bullseye 1" is 49 F/h. Matches.

    const baseRate2_C = 27;
    let r2_C = baseRate2_C * Math.pow(25 / effectiveThicknessMm, 2) * brandFactor / safeFactor;

    // Cap R2: Max 400 C/h
    if (r2_C > 400) r2_C = 400;

    let rate2_F = r2_C * 9 / 5;

    // -- FINAL COOL (Below "Safe Final") --
    // Often ignored or just "Rate 2 continued" or fast. 
    // For simplicity / safety, we usually just continue Rate 2 to room temp or slightly faster. 
    // The report suggests R_final = 150 C/h ... 
    // Let's stick to Rate 2 down to room temp to be "Research Grade" safe, unless user is very impatient.
    // Actually, let's allow a Rate 3 if we want to be fancy, but standard kiln controllers usually just do 2-3 steps. 
    // We'll stick to 2 cooling segments for simplicity in output, or maybe 3 if significant.
    // Let's just use Rate 2 all the way to unload temp for simplicity and safety.

    // 3. Generate Schedule Points
    const unloadTemp = 150; // F
    let rampToProcessRate = 400; // Default F/hr

    // Dynamic Ramp Up base on thickness (Physics: Heat also stresses glass!)
    // If thick, heat slower. 
    // Heuristic: If > 1 inch, slow down.
    if (effectiveThicknessMm > 25) rampToProcessRate = 200;
    if (effectiveThicknessMm > 50) rampToProcessRate = 100;

    if (customProcessRamp) {
        if (units === 'metric') rampToProcessRate = customProcessRamp * 9 / 5;
        else rampToProcessRate = customProcessRamp;
    }

    const points: AnnealingSchedulePoint[] = [];
    let currentTime = 0;

    // Start
    points.push({ time: currentTime, temp: toOutputTemp(unloadTemp), label: "Start", segment_type: 'off' });

    // Firing
    if (mode !== "anneal_only") {
        let currentStartTemp = unloadTemp;

        // Mold Dry
        if (mode === 'cast' && moldDryHours && moldDryHours > 0) {
            const mdt = moldDryTemp ? toF(moldDryTemp) : 250;
            const timeToDry = (mdt - currentStartTemp) / rampToProcessRate;
            currentTime += timeToDry;
            points.push({ time: currentTime, temp: toOutputTemp(mdt), label: "Mold Dry Reach", segment_type: 'heat' });

            currentTime += moldDryHours;
            points.push({ time: currentTime, temp: toOutputTemp(mdt), label: "Mold Dry Hold", segment_type: 'process' }); // Revert to process (Red)
            currentStartTemp = mdt;
        }

        // Ramp to Process
        const timeToProcess = (processTemp - currentStartTemp) / rampToProcessRate;
        currentTime += timeToProcess;
        let reachLabel = "Process Reach";
        if (mode === 'cast') reachLabel = "Reach Cast";
        points.push({ time: currentTime, temp: toOutputTemp(processTemp), label: reachLabel, segment_type: 'process' });

        // Hold
        currentTime += (processHoldMins / 60);
        const holdLabel = processHoldIndefinite ? "Process Hold (Indefinite)" : "Process Complete";
        points.push({ time: currentTime, temp: toOutputTemp(processTemp), label: holdLabel, segment_type: 'process_hold' }); // New specific type for Yellow

        // Crash Cool to Anneal
        // In physics model, crash cool is limited by "thermal shock of the kiln" usually lol, but glass can break if cooled too fast on surface. 
        // We assume "Full" is fine for most art glass until anneal soak.
        const timeToAnneal = (processTemp - annealTemp) / 1000; // Assume fast
        currentTime += timeToAnneal;
        points.push({ time: currentTime, temp: toOutputTemp(annealTemp), label: "Cool to Anneal", segment_type: 'cool' });

    } else {
        // Ramp to Soak
        const timeToSoak = (annealTemp - unloadTemp) / rampToProcessRate;
        currentTime += timeToSoak;
        points.push({ time: currentTime, temp: toOutputTemp(annealTemp), label: "Reach Soak", segment_type: 'heat' });
    }

    // Anneal Soak
    currentTime += annealSoakHours;
    points.push({ time: currentTime, temp: toOutputTemp(annealTemp), label: "Anneal Soak", segment_type: 'soak' });

    // Cool to Strain (Rate 1)
    const timeAnnealToStrain = (annealTemp - strainPoint) / rate1_F;
    currentTime += timeAnnealToStrain;
    points.push({ time: currentTime, temp: toOutputTemp(strainPoint), label: "Strain Point", segment_type: 'cool' });

    // Cool to Unload (Rate 2)
    const timeToCool = (strainPoint - unloadTemp) / rate2_F;
    currentTime += timeToCool;
    points.push({ time: currentTime, temp: toOutputTemp(unloadTemp), label: "Finished", segment_type: 'cool' });


    // 4. Instructions
    const tempUnit = units === 'metric' ? "°C" : "°F";
    const rateUnit = units === 'metric' ? "°C/hr" : "°F/hr";
    const toRate = (r: number) => units === 'metric' ? r * 5 / 9 : r;

    let paragon = `Make sure to verify these against your specific kiln manual.\n`;
    paragon += `ALL TEMPS IN ${tempUnit}, RATES IN ${rateUnit}\n`;

    paragon += `Logic: Physics Model v1 (Shape: ${shape}, Safety: ${safeFactor}x)\n\n`;

    // ... Paragon Builder (Simplified for brevity, logic holds)
    let segCount = 1;
    let sc = 0;

    if (mode !== "anneal_only") {
        if (mode === 'cast' && moldDryHours && moldDryHours > 0) {
            const mdt = moldDryTemp ? toF(moldDryTemp) : 250;
            sc = segCount++;
            paragon += `SEG ${sc} (Mold Dry):\n  RA${sc} : ${Math.round(toRate(rampToProcessRate))}\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(mdt))}\n  HLD${sc}: ${generateTimeStr(Math.round(moldDryHours * 60))}\n\n`;
        }

        sc = segCount++;
        sc = segCount++;
        const holdStr = processHoldIndefinite ? "HOLD" : generateTimeStr(Math.round(processHoldMins));
        const holdNote = processHoldIndefinite ? " (INDEFINITE HOLD)" : "";
        paragon += `SEG ${sc} (Process):\n  RA${sc} : ${Math.round(toRate(rampToProcessRate))}\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(processTemp))}\n  HLD${sc}: ${holdStr}${holdNote}\n\n`;

        sc = segCount++;
        paragon += `SEG ${sc} (Cool to Anneal):\n  RA${sc} : 9999\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(annealTemp))}\n  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    } else {
        sc = segCount++;
        paragon += `SEG ${sc} (Ramp to Soak):\n  RA${sc} : ${Math.round(toRate(rampToProcessRate))}\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(annealTemp))}\n  HLD${sc}: ${generateTimeStr(Math.round(annealSoakHours * 60))}\n\n`;
    }

    sc = segCount++;
    paragon += `SEG ${sc} (Anneal -> Strain):\n  RA${sc} : ${Math.round(toRate(rate1_F))}\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(strainPoint))}\n  HLD${sc}: 00:00\n\n`;

    sc = segCount++;
    paragon += `SEG ${sc} (Strain -> Cool):\n  RA${sc} : ${Math.round(toRate(rate2_F))}\n  ${tempUnit}${sc} : ${Math.round(toOutputTemp(unloadTemp))}\n  HLD${sc}: 00:00`;


    // Digitry
    let digitry = `NOTE: Time is CUMULATIVE from start.\n`;
    digitry += `Logic: Physics Model v1 (Shape: ${shape}, Safety: ${safeFactor}x)\n`;
    digitry += `TEMPS IN ${tempUnit}\n\n`;
    let digitryStep = 1;
    const schedulePoints = points.slice(1);
    schedulePoints.forEach((p) => {
        const pMins = Math.round(p.time * 60);
        let timeStr = generateTimeStr(pMins);
        if (p.label?.includes("Indefinite")) {
            timeStr += " (HOLD)";
        }
        digitry += `STEP ${digitryStep++}: ${p.label}\n  TEMP: ${Math.round(p.temp)}${tempUnit}\n  TIME: ${timeStr}\n\n`;
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
