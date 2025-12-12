import { useState } from 'react';
import { GLASS_LIBRARY, calculateSchedule } from './lib/annealingLogic';
import type { GlassType, ScheduleResult, ScheduleMode, UnitSystem, ShapeFactor, Conservativeness } from './lib/annealingLogic';
import { AnnealingChart } from './components/AnnealingChart';
import { Activity, Flame, ThermometerSnowflake, Settings, RotateCcw, Share2, Info } from 'lucide-react';

function App() {
  const [glassType, setGlassType] = useState<GlassType>("Bullseye (COE 90)");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("anneal_only");
  const [thickness, setThickness] = useState<string>("0.25"); // Default to inch-like start
  const [units, setUnits] = useState<UnitSystem>("imperial");

  // Physics Controls
  const [shape, setShape] = useState<ShapeFactor>("slab");
  const [conservativeness, setConservativeness] = useState<Conservativeness>("fast");

  // Custom Overrides
  const [customAnneal, setCustomAnneal] = useState<string>("");
  const [customStrain, setCustomStrain] = useState<string>("");

  // Clean Process Overrides
  const [processTemp, setProcessTemp] = useState<string>("");
  const [processHold, setProcessHold] = useState<string>("");
  const [processRamp, setProcessRamp] = useState<string>("");
  const [moldDryHours, setMoldDryHours] = useState<string>("");
  const [moldDryTemp, setMoldDryTemp] = useState<string>("");

  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [chartVersion, setChartVersion] = useState(0);

  const toggleUnits = () => {
    const newUnits = units === 'imperial' ? 'metric' : 'imperial';
    setUnits(newUnits);

    // 1. Convert Thickness State
    let newThickness = thickness;
    const val = parseFloat(thickness);
    if (!isNaN(val)) {
      if (newUnits === 'metric') {
        // Inch -> Cm
        newThickness = (val * 2.54).toFixed(2);
      } else {
        // Cm -> Inch
        newThickness = (val / 2.54).toFixed(3);
      }
      setThickness(newThickness);
    }

    // 2. Helper for C <-> F conversion
    const toC = (f: number) => (f - 32) * 5 / 9;
    const toF = (c: number) => (c * 9 / 5) + 32;

    const convertTempField = (valStr: string) => {
      if (!valStr) return "";
      const v = parseFloat(valStr);
      if (isNaN(v)) return valStr;

      if (newUnits === 'metric') {
        return Math.round(toC(v)).toString();
      } else {
        return Math.round(toF(v)).toString();
      }
    };

    // 3. Convert Overrides State
    const newCustomAnneal = convertTempField(customAnneal);
    const newCustomStrain = convertTempField(customStrain);
    const newProcessTemp = convertTempField(processTemp);
    const newMoldDryTemp = convertTempField(moldDryTemp);

    // Rate Conversion (Delta only)
    const convertRateField = (valStr: string) => {
      if (!valStr) return "";
      const v = parseFloat(valStr);
      if (isNaN(v)) return valStr;

      if (newUnits === 'metric') {
        // F/hr -> C/hr
        return Math.round(v * 5 / 9).toString();
      } else {
        // C/hr -> F/hr
        return Math.round(v * 9 / 5).toString();
      }
    };
    const newProcessRamp = convertRateField(processRamp);

    setCustomAnneal(newCustomAnneal);
    setCustomStrain(newCustomStrain);
    setProcessTemp(newProcessTemp);
    setProcessRamp(newProcessRamp);
    setMoldDryTemp(newMoldDryTemp);


    // 4. Re-Calculate Result immediately if we have a result
    // We must use the NEW values, not the state variables (which are stale in this closure)
    if (result) {
      const thickVal = parseFloat(newThickness);
      if (isNaN(thickVal)) return;

      let cAnneal = undefined;
      let cStrain = undefined;
      let cProcessTemp = undefined;
      let cProcessHold = undefined;
      let cProcessRamp = undefined; // Time is time, no conversion needed
      let cMoldDryHours = undefined;
      let cMoldDryTemp = undefined;

      // Re-construct the logic from handleCalculate but with new values
      if (glassType === "Custom") {
        cAnneal = parseFloat(newCustomAnneal);
        cStrain = parseFloat(newCustomStrain);
      } else {
        if (newCustomAnneal) cAnneal = parseFloat(newCustomAnneal);
        if (newCustomStrain) cStrain = parseFloat(newCustomStrain);
      }

      if (scheduleMode !== "anneal_only") {
        if (newProcessTemp) cProcessTemp = parseFloat(newProcessTemp);
        if (processHold) cProcessHold = parseFloat(processHold);
        if (newProcessRamp) cProcessRamp = parseFloat(newProcessRamp);

        if (scheduleMode === 'cast' && moldDryHours) {
          cMoldDryHours = parseFloat(moldDryHours);
          if (newMoldDryTemp) cMoldDryTemp = parseFloat(newMoldDryTemp);
        }
      }

      const res = calculateSchedule(
        glassType,
        thickVal,
        scheduleMode,
        newUnits,
        shape,
        conservativeness,
        cAnneal,
        cStrain,
        cProcessTemp,
        cProcessHold,
        cProcessRamp,
        cMoldDryHours,
        cMoldDryTemp
      );
      setResult(res);
      setChartVersion(v => v + 1);
    }
  };


  const handleCalculate = () => {
    const thickVal = parseFloat(thickness);
    if (isNaN(thickVal)) {
      alert("Please enter a valid thickness.");
      return;
    }

    let cAnneal = undefined;
    let cStrain = undefined;
    let cProcessTemp = undefined;
    let cProcessHold = undefined;
    let cProcessRamp = undefined;
    let cMoldDryHours = undefined;
    let cMoldDryTemp = undefined;

    if (glassType === "Custom") {
      cAnneal = parseFloat(customAnneal);
      cStrain = parseFloat(customStrain);
      if (isNaN(cAnneal) || isNaN(cStrain)) {
        alert("Please enter valid Custom Temperatures.");
        return;
      }
    } else {
      // Allow overrides even for standard glass if user entered something
      if (customAnneal) cAnneal = parseFloat(customAnneal);
      if (customStrain) cStrain = parseFloat(customStrain);
    }

    if (scheduleMode !== "anneal_only") {
      if (processTemp) cProcessTemp = parseFloat(processTemp);
      if (processHold) cProcessHold = parseFloat(processHold);
      if (processRamp) cProcessRamp = parseFloat(processRamp);

      if (scheduleMode === 'cast' && moldDryHours) {
        cMoldDryHours = parseFloat(moldDryHours);
        if (moldDryTemp) cMoldDryTemp = parseFloat(moldDryTemp);
      }
    }

    const res = calculateSchedule(
      glassType,
      thickVal,
      scheduleMode,
      units,
      shape,
      conservativeness,
      cAnneal,
      cStrain,
      cProcessTemp,
      cProcessHold,
      cProcessRamp,
      cMoldDryHours,
      cMoldDryTemp
    );
    setResult(res);
    setChartVersion(v => v + 1);
  };

  const handleShare = async () => {
    if (!result) return;

    const text = `Annealing Schedule for ${glassType} (${thickness} ${units === 'metric' ? 'cm' : 'in'})

PARAGON SENTRY:
${result.paragon_instructions}

DIGITRY GB4/5:
${result.digitry_instructions}`;

    const shareData = {
      title: 'Glass Annealing Schedule',
      text: text,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(text);
        alert("Schedule copied to clipboard!");
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Glass Firing & Annealing Calculator</h1>
      </header>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

          <div>
            <label>Glass Type</label>
            <select
              value={glassType}
              onChange={(e) => setGlassType(e.target.value as GlassType)}
            >
              {Object.keys(GLASS_LIBRARY).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Schedule Mode</label>
            <select
              value={scheduleMode}
              onChange={(e) => setScheduleMode(e.target.value as ScheduleMode)}
            >
              <option value="anneal_only">Anneal Only</option>
              <option value="slump">Slump</option>
              <option value="tack_fuse">Tack Fuse</option>
              <option value="full_fuse">Full Fuse</option>
              <option value="cast">Cast</option>
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ margin: 0 }}>Thickness ({units === 'metric' ? 'cm' : 'in'})</label>
              <button
                onClick={toggleUnits}
                style={{
                  background: units === 'imperial' ? 'rgba(96, 165, 250, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                  border: units === 'imperial' ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid rgba(248, 113, 113, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  width: 'auto',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: units === 'imperial' ? '#60a5fa' : '#f87171',
                  marginLeft: 'auto',
                  transition: 'all 0.2s',
                }}
                title={`Switch to ${units === 'imperial' ? 'Metric' : 'Imperial'}`}
              >
                <RotateCcw size={12} />
                <span style={{ fontWeight: 600 }}>{units === 'imperial' ? 'Imperial' : 'Metric'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={thickness}
                onChange={(e) => setThickness(e.target.value)}
                placeholder={units === 'metric' ? "e.g. 0.6" : "e.g. 0.25"}
                min="0.01"
                step="0.01"
              />
            </div>
          </div>

        </div>

        {/* Physics Controls Row */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>

          {/* Shape Logic (Only relevant for casting usually, or thick slabs. We can enable for all for "Effective Thickness" logic) */}
          {/* User asked for "section to the casting mode that clarifys if its a slab, 3d, or a sphere". */}
          {/* Let's show it always but maybe highlight it for cast? User said "add a section to the casting mode". */}
          {/* OK, I will show it ONLY if scheduleMode == 'cast' OR maybe just always because it affects cooling? */}
          {/* User text: "We will need to add a section to the casting mode". I will enable it for Casting. */}

          {scheduleMode === 'cast' && (
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label>Form / Shape</label>
              <select
                value={shape}
                onChange={(e) => setShape(e.target.value as ShapeFactor)}
              >
                <option value="slab">Flat Slab (1.0x)</option>
                <option value="uneven">Uneven / Tack (1.5x)</option>
                <option value="hollow_deep">Hollow / Deep / 3D (2.0x)</option>
              </select>
            </div>
          )}

          {/* Aggressiveness Selector */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ margin: 0 }}>Safety Profile</label>
              <div title="Economy = Fast (1.0x baseline). Standard = Safer (1.5x). Museum = Very Slow (2.0x)." style={{ cursor: 'help' }}>
                <Info size={14} className="text-gray-500" />
              </div>
            </div>
            <select
              value={conservativeness}
              onChange={(e) => setConservativeness(e.target.value as Conservativeness)}
              style={{ marginTop: '0.5rem' }}
            >
              <option value="fast">Fast / Economy (1.0x)</option>
              <option value="standard">Standard (1.5x)</option>
              <option value="cautious">Cautious / Museum (2.0x)</option>
            </select>
          </div>

        </div>

        {/* Process Settings (if not anneal only) */}
        {scheduleMode !== "anneal_only" && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Settings className="text-gray-400" size={18} />
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Process Settings</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              {scheduleMode === 'cast' && (
                <>
                  <div>
                    <label>Dry Temp ({units === 'metric' ? '°C' : '°F'})</label>
                    <input
                      type="number"
                      value={moldDryTemp}
                      onChange={(e) => setMoldDryTemp(e.target.value)}
                      placeholder={units === 'metric' ? "121" : "250"}
                    />
                    <small style={{ color: '#888' }}>Default = {units === 'metric' ? "121" : "250"}</small>
                  </div>
                  <div>
                    <label>Mold Dry (Hours)</label>
                    <input
                      type="number"
                      value={moldDryHours}
                      onChange={(e) => setMoldDryHours(e.target.value)}
                      placeholder="None"
                      max="72"
                    />
                    <small style={{ color: '#888' }}>At Dry Temp</small>
                  </div>
                </>
              )}

              <div>
                <label>Ramp ({units === 'metric' ? '°C/hr' : '°F/hr'})</label>
                <input
                  type="number"
                  value={processRamp}
                  onChange={(e) => setProcessRamp(e.target.value)}
                  placeholder="Default (Auto)"
                />
                <small style={{ color: '#888' }}>Empty = Auto</small>
              </div>

              <div>
                <label>Process Temp ({units === 'metric' ? '°C' : '°F'})</label>
                <input
                  type="number"
                  value={processTemp}
                  onChange={(e) => setProcessTemp(e.target.value)}
                  placeholder="Default (Auto)"
                />
                <small style={{ color: '#888' }}>Empty = Auto</small>
              </div>

              <div>
                <label>Hold Time (Mins)</label>
                <input
                  type="number"
                  value={processHold}
                  onChange={(e) => setProcessHold(e.target.value)}
                  placeholder="Default (Auto)"
                />
                <small style={{ color: '#888' }}>Empty = Auto</small>
              </div>
            </div>
          </div>
        )}

        {/* Custom Glass Settings */}
        {(glassType === "Custom" || customAnneal || customStrain) && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Settings className="text-gray-400" size={18} />
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Annealing Overrides</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label>Anneal Temp ({units === 'metric' ? '°C' : '°F'})</label>
                <input
                  type="number"
                  value={customAnneal}
                  onChange={(e) => setCustomAnneal(e.target.value)}
                  placeholder={glassType !== "Custom" ?
                    (units === 'metric'
                      ? `${Math.round((GLASS_LIBRARY[glassType].anneal_temp! - 32) * 5 / 9)}`
                      : `${GLASS_LIBRARY[glassType].anneal_temp}`)
                    : ""}
                />
              </div>
              <div>
                <label>Strain Point ({units === 'metric' ? '°C' : '°F'})</label>
                <input
                  type="number"
                  value={customStrain}
                  onChange={(e) => setCustomStrain(e.target.value)}
                  placeholder={glassType !== "Custom" ?
                    (units === 'metric'
                      ? `${Math.round((GLASS_LIBRARY[glassType].strain_point! - 32) * 5 / 9)}`
                      : `${GLASS_LIBRARY[glassType].strain_point}`)
                    : ""}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          <button onClick={handleCalculate}>
            Generate Schedule
          </button>
        </div>
      </div>

      {result && (
        <div className="dashboard-grid">
          {/* Chart Section */}
          <div className="full-width card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Activity className="text-blue-400" size={24} />
              <h2 style={{ margin: 0 }}>Firing Profile</h2>
            </div>
            <AnnealingChart key={chartVersion} points={result.points} units={units} />
          </div>

          {/* Paragon Output */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Flame className="text-orange-500" size={24} />
              <h2 style={{ margin: 0 }}>Paragon Sentry</h2>
            </div>
            <pre className="instruction-text">
              {result.paragon_instructions}
            </pre>
          </div>

          {/* Digitry Output */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <ThermometerSnowflake className="text-cyan-400" size={24} />
              <h2 style={{ margin: 0 }}>Digitry GB4/5</h2>
            </div>
            <pre className="instruction-text">
              {result.digitry_instructions}
            </pre>
          </div>
          {/* Share Button */}
          <div className="full-width" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleShare}
              style={{
                background: '#334155', // Slate 700
                maxWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Share2 size={18} />
              Share Schedule
            </button>
          </div>
        </div>
      )}

      <footer className="disclaimer">
        <p>All times and temps are approximate. Calculations are subject to change.</p>
        <p>Ramp/cool rates vary between kilns.</p>
        <p style={{ marginTop: '0.5rem' }}>Free and opensource. For educational purposes.</p>
      </footer>
    </div>
  );
}

export default App;
