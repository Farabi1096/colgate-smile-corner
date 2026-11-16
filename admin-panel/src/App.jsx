import React, { useState, useEffect } from "react";

export default function App() {
  const [pin, setPin] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [targetVal, setTargetVal] = useState(80);
  const [stats, setStats] = useState({ total: 1000, uploads: 12, display: 0, regular: 1000 });

  useEffect(() => {
    try {
      const pjp = JSON.parse(localStorage.getItem('pjpData') || '[]');
      const subs = JSON.parse(localStorage.getItem('submissions') || '[]');
      if (pjp.length > 0) {
        const d = pjp.filter(r => (r.status||'').toLowerCase().includes('display')).length;
        setStats({ total: pjp.length, uploads: subs.length, display: d, regular: pjp.length - d });
      }
    } catch(e){}
  }, []);

  const maxVal = Math.max(stats.total, stats.uploads, stats.display, stats.regular, 1);
  const getH = (val) => Math.max(5, Math.min(95, (val/maxVal)*88)) + '%';

  if (!loggedIn) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0B0F19]">
        <div className="bg-[#1E293B] border border-slate-700 p-8 rounded shadow-2xl w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-600 text-white flex items-center justify-center font-bold text-xs mono rounded-sm">OPS</div>
            <div>
              <h1 className="text-white font-bold tracking-tight">FIELD CONSOLE</h1>
              <p className="text-slate-400 text-xs mono">ENTERPRISE LOGIN</p>
            </div>
          </div>
          <input 
            type="password" value={pin} onChange={(e) => setPin(e.target.value)} 
            placeholder="Enter PIN..." maxLength={4}
            className="w-full bg-[#0F172A] border border-slate-600 text-white rounded p-3 mb-4 text-center text-xl tracking-[0.5em] focus:outline-none focus:border-blue-500"
          />
          <button 
            onClick={() => pin === "1234" ? setLoggedIn(true) : alert("Invalid PIN")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded transition-colors"
          >
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-[240px] bg-[#0B0F19] text-slate-50 flex flex-col border-r border-slate-800 z-20 shrink-0">
        <div className="h-14 px-4 flex items-center gap-3 border-b border-slate-800">
          <div className="w-6 h-6 bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] mono">OPS</div>
          <div>
            <div className="text-[13px] font-bold tracking-tight text-white">FIELD CONSOLE</div>
            <div className="text-[10px] text-slate-400 mono">ENTERPRISE v2.4</div>
          </div>
        </div>
        <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Workspace</div>
        <button className="flex items-center gap-2 mx-2 px-3 py-2 text-[13px] font-semibold bg-blue-600 text-white rounded-sm text-left">Overview & KPIs</button>
        <button className="flex items-center gap-2 mx-2 px-3 py-2 text-[13px] font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-sm text-left transition-colors">Coverage Analytics</button>
        <button className="flex items-center gap-2 mx-2 px-3 py-2 text-[13px] font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-sm text-left transition-colors">Live GIS Route Map</button>
        <button className="flex items-center gap-2 mx-2 px-3 py-2 text-[13px] font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-sm text-left transition-colors">System Controls</button>
        
        <div className="mt-auto p-4 border-t border-slate-800">
          <button onClick={() => setLoggedIn(false)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded border border-slate-700 transition-colors">
            Exit Console
          </button>
        </div>
      </aside>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Admin Console</span>
            <span className="text-slate-300">/</span>
            <span className="text-[13px] text-slate-900 font-semibold">Operations & Field Telemetry</span>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Live Sync: <span className="mono text-emerald-600 font-bold ml-1">Connected</span>
          </div>
        </header>

        <div className="p-6 max-w-[1440px] w-full mx-auto flex flex-col gap-5">
          
          {/* KPI GRID */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">Total Outlets</div>
              <div className="mono text-2xl font-bold text-slate-900 tracking-tight">{stats.total.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-blue-100 rounded p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase text-blue-600 mb-1">Uploaded</div>
              <div className="mono text-2xl font-bold text-blue-600 tracking-tight">{stats.uploads.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase text-slate-600 mb-1">Display</div>
              <div className="mono text-2xl font-bold text-slate-700 tracking-tight">{stats.display.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">Regular</div>
              <div className="mono text-2xl font-bold text-slate-500 tracking-tight">{stats.regular.toLocaleString()}</div>
            </div>
          </div>

          {/* CHARTS & CONTROLS */}
          <div className="grid grid-cols-[1.5fr_1fr] gap-6 bg-white border border-slate-200 rounded shadow-sm p-6">
            
            {/* Chart */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Coverage Analytics</h2>
                <div className="mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                  {stats.total > 0 ? ((stats.uploads/stats.total)*100).toFixed(1) : '0.0'}% Executed
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-4 h-40 bg-slate-50 border border-slate-200 rounded p-4 items-end">
                <div className="flex flex-col items-center justify-end h-full">
                  <span className="mono text-[11px] font-semibold mb-1">{stats.total}</span>
                  <div className="w-10 bg-slate-900 rounded-t-sm transition-all duration-300" style={{height: getH(stats.total)}}></div>
                  <span className="text-[11px] text-slate-500 mt-2 font-medium">Total</span>
                </div>
                <div className="flex flex-col items-center justify-end h-full">
                  <span className="mono text-[11px] font-semibold text-blue-600 mb-1">{stats.uploads}</span>
                  <div className="w-10 bg-blue-600 rounded-t-sm transition-all duration-300" style={{height: getH(stats.uploads)}}></div>
                  <span className="text-[11px] text-slate-500 mt-2 font-medium">Uploads</span>
                </div>
                <div className="flex flex-col items-center justify-end h-full">
                  <span className="mono text-[11px] font-semibold text-slate-700 mb-1">{stats.display}</span>
                  <div className="w-10 bg-slate-600 rounded-t-sm transition-all duration-300" style={{height: getH(stats.display)}}></div>
                  <span className="text-[11px] text-slate-500 mt-2 font-medium">Display</span>
                </div>
                <div className="flex flex-col items-center justify-end h-full">
                  <span className="mono text-[11px] font-semibold text-slate-500 mb-1">{stats.regular}</span>
                  <div className="w-10 bg-slate-400 rounded-t-sm transition-all duration-300" style={{height: getH(stats.regular)}}></div>
                  <span className="text-[11px] text-slate-500 mt-2 font-medium">Regular</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[13px] font-semibold text-slate-900">Daily Coverage Target</label>
                  <span className="mono text-xs font-semibold text-slate-700">
                    Target: {targetVal}% ({Math.round((stats.total * targetVal)/100)})
                  </span>
                </div>
                <input 
                  type="range" min="10" max="100" value={targetVal} 
                  onChange={(e) => setTargetVal(e.target.value)} 
                  className="slider"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 p-4 rounded">
                <h3 className="text-[13px] font-semibold text-slate-900 mb-3">System Controls</h3>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> 
                    Allow Gallery Uploads
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-medium text-red-600 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300 text-red-600 focus:ring-red-500" /> 
                    Maintenance Mode (Block App)
                  </label>
                  <button 
                    onClick={() => alert('Settings Saved!')} 
                    className="mt-2 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded transition-colors"
                  >
                    Save Global Settings
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
