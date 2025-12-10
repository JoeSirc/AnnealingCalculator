import { useState, useEffect } from 'react';
import { GLASS_LIBRARY, calculateSchedule } from './lib/annealingLogic';
import type { GlassType, ScheduleResult, ScheduleMode } from './lib/annealingLogic';
import { AnnealingChart } from './components/AnnealingChart';
import { Activity, Flame, ThermometerSnowflake, Settings } from 'lucide-react';

function App() {
  const [glassType, setGlassType] = useState<GlassType>("Bullseye (COE 90)");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("anneal_only");
  const [thickness, setThickness] = useState<string>("6");

  // Custom Overrides
  const [customAnneal, setCustomAnneal] = useState<string>("");
  const [customStrain, setCustomStrain] = useState<string>("");

  // Clean Process Overrides
  const [processTemp, setProcessTemp] = useState<string>("");
  const [processHold, setProcessHold] = useState<string>("");

  const [result, setResult] = useState<ScheduleResult | null>(null);

  // Auto-fill Process Defaults when Glass or Mode changes
  // optional: leave blank to imply "Default"

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
    }

    const res = calculateSchedule(
      glassType,
      thickVal,
      scheduleMode,
      cAnneal,
      cStrain,
      cProcessTemp,
      cProcessHold
    );
    setResult(res);
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
              <option value="tack_fuse">Tack Fuse</option>
              <option value="full_fuse">Full Fuse</option>
              <option value="cast">Cast</option>
            </select>
          </div>

          <div>
            <label>Thickness (mm)</label>
            <input
              type="number"
              value={thickness}
              onChange={(e) => setThickness(e.target.value)}
              placeholder="e.g. 6"
              min="0.1"
            />
          </div>

        </div>

        {/* Process Settings (if not anneal only) */}
        {scheduleMode !== "anneal_only" && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Settings className="text-gray-400" size={18} />
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Process Settings</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label>Process Temp (°F)</label>
                <input
                  type="number"
                  value={processTemp}
                  onChange={(e) => setProcessTemp(e.target.value)}
                  placeholder="Default (Auto)"
                />
                <small style={{ color: '#888' }}>Leave empty for default</small>
              </div>
              <div>
                <label>Hold Time (Minutes)</label>
                <input
                  type="number"
                  value={processHold}
                  onChange={(e) => setProcessHold(e.target.value)}
                  placeholder="Default (Auto)"
                />
                <small style={{ color: '#888' }}>Leave empty for default</small>
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
                <label>Anneal Temp (°F)</label>
                <input
                  type="number"
                  value={customAnneal}
                  onChange={(e) => setCustomAnneal(e.target.value)}
                  placeholder={glassType !== "Custom" ? `${GLASS_LIBRARY[glassType].anneal_temp}` : ""}
                />
              </div>
              <div>
                <label>Strain Point (°F)</label>
                <input
                  type="number"
                  value={customStrain}
                  onChange={(e) => setCustomStrain(e.target.value)}
                  placeholder={glassType !== "Custom" ? `${GLASS_LIBRARY[glassType].strain_point}` : ""}
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
            <AnnealingChart points={result.points} />
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
        </div>
      )}
    </div>
  );
}

export default App;
