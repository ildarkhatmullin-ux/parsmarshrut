import { useEffect, useState, useRef } from "react";

interface LogMsg {
  time: string;
  level: string;
  message: string;
  color?: string;
  levelColor?: string;
}

interface RouteData {
  source_id: string;
  source_url: string;
  title: string;
  region_name: string;
  distance_km: number | null;
  points_count: number;
  status: 'success' | 'error' | 'queued' | 'pending';
  polyline: number[][];
  error?: string | null;
}

interface ProcessState {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED' | 'ERROR';
  logs: LogMsg[];
  regionsProcessed: number;
  routesSaved: number;
  duplicatesSkipped: number;
  errorsFound: number;
  coordsCached: number;
  routes: RouteData[];
  duration?: number;
}

export default function App() {
  const [state, setState] = useState<ProcessState>({
    status: 'IDLE',
    logs: [],
    regionsProcessed: 0,
    routesSaved: 0,
    duplicatesSkipped: 0,
    errorsFound: 0,
    coordsCached: 0,
    routes: []
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval = setInterval(() => {
      fetch("/api/state")
        .then(res => res.json())
        .then(data => setState(data))
        .catch(console.error);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.logs]);

  const handleExecute = async () => {
    if (state.status === "RUNNING") return;
    try {
      await fetch("/api/start", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const handlePause = async () => {
    try {
      await fetch("/api/pause", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    try {
      await fetch("/api/resume", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStop = async () => {
    try {
      await fetch("/api/stop", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const getPolylinePreview = () => {
    if (!state.routes.length) return "[]";
    const route = state.routes.find(r => r.status === 'success' && r.polyline && r.polyline.length > 0);
    if (!route) return "[]";
    const pts = route.polyline;
    const preview = pts.slice(0, 5).map(p => `[${p[0]}, ${p[1]}]`).join(", ");
    return `[ ${preview}, ... +${pts.length > 5 ? pts.length - 5 : 0} points ]`;
  };

  // Default routes for idle state
  const displayRoutes = state.routes.length > 0 ? state.routes : [
    { source_id: "3803", title: "Камень Ветлан", region_name: "Пермский край", distance_km: 12.4, status: "queued", source_url: "", polyline: [], points_count: 0 } as any,
    { source_id: "3805", title: "Полюдов камень", region_name: "Пермский край", distance_km: 15.0, status: "queued", source_url: "", polyline: [], points_count: 0 } as any,
    { source_id: "5311", title: "Усьвинские Столбы", region_name: "Пермский край", distance_km: 8.2, status: "queued", source_url: "", polyline: [], points_count: 0 } as any
  ];

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#222]">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#f27d26] rounded flex items-center justify-center font-bold text-black">I</div>
          <h1 className="text-lg font-medium tracking-tight uppercase">
            Idilesom Parser <span className="text-[#666] ml-2 text-xs font-mono">v1.1.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] ${state.status === 'RUNNING' ? 'bg-yellow-400 animate-pulse' : (state.status === 'PAUSED' ? 'bg-yellow-600' : 'bg-green-500')}`}></div>
            <span className="text-xs uppercase tracking-widest text-[#888]">
              {state.status === 'RUNNING' ? 'Running Scrape...' : (state.status === 'PAUSED' ? 'Paused' : 'Auth: IDILESOM_COOKIE Detected')}
            </span>
          </div>
          
          <div className="flex gap-2">
            {state.status === 'RUNNING' && (
              <button 
                onClick={handlePause}
                className="px-4 py-1.5 bg-[#444] text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-[#555] transition-colors"
              >
                Pause
              </button>
            )}
            {state.status === 'PAUSED' && (
              <button 
                onClick={handleResume}
                className="px-4 py-1.5 bg-[#444] text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-[#555] transition-colors"
              >
                Resume
              </button>
            )}
            {(state.status === 'RUNNING' || state.status === 'PAUSED') && (
              <button 
                onClick={handleStop}
                className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-red-500 transition-colors"
              >
                Stop
              </button>
            )}
            <button 
              onClick={handleExecute}
              disabled={state.status === 'RUNNING' || state.status === 'PAUSED'}
              className="px-4 py-1.5 bg-[#f27d26] text-black text-xs font-bold uppercase tracking-widest rounded hover:bg-[#ff8e3c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Grid */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-px bg-[#222] min-h-0">
        {/* Left Panel: Data Preview */}
        <section className="col-span-1 md:col-span-8 bg-[#0a0a0a] p-8 flex flex-col min-h-0 overflow-y-auto">
          <div className="mb-6 flex justify-between items-end flex-shrink-0">
            <div>
              <h2 className="text-2xl font-serif italic text-white">Extraction Buffer</h2>
              <p className="text-sm text-[#666] font-mono mt-1">Targeting: regions.txt file</p>
            </div>
            <div className="flex gap-2">
              <div className="px-3 py-1 border border-[#333] text-[10px] font-mono uppercase text-[#888]">JSON</div>
              <div className="px-3 py-1 border border-[#333] text-[10px] font-mono uppercase text-[#888]">CSV</div>
              <div className="px-3 py-1 border border-[#333] text-[10px] font-mono uppercase text-[#888]">GPX</div>
              <div className="px-3 py-1 border border-[#333] text-[10px] font-mono uppercase text-[#888]">KML</div>
            </div>
          </div>

          <div className="flex-1 border border-[#222] rounded flex flex-col min-h-0">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-[#111] text-[#666] uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="p-4 border-b border-[#222] bg-[#111]">ID</th>
                    <th className="p-4 border-b border-[#222] bg-[#111]">Route Name</th>
                    <th className="p-4 border-b border-[#222] bg-[#111]">Region</th>
                    <th className="p-4 border-b border-[#222] bg-[#111]">Dist (km)</th>
                    <th className="p-4 border-b border-[#222] bg-[#111]">Points</th>
                    <th className="p-4 border-b border-[#222] bg-[#111]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#181818]">
                  {displayRoutes.map((r, i) => (
                    <tr key={i} className={r.status === 'success' ? "bg-[#0f0f0f]" : "opacity-50"}>
                      <td className={`p-4 ${r.status !== 'queued' ? 'text-[#f27d26]' : ''}`}>{r.source_id}</td>
                      <td className={`p-4 ${r.status === 'success' ? 'text-white' : ''}`}>{r.title || r.source_url || 'Pending...'}</td>
                      <td className="p-4">{r.region_name || '-'}</td>
                      <td className="p-4">{r.distance_km || '-'}</td>
                      <td className="p-4">{r.points_count || '-'}</td>
                      <td className="p-4">
                        <span className={r.status === 'success' ? "text-green-500 uppercase" : (r.status === 'error' ? "text-red-500 uppercase" : "uppercase")}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Polyline Preview Area */}
            <div className="p-6 bg-[#0d0d0d] border-t border-[#222] flex-shrink-0">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#555] mb-4">L.Polyline Buffer (Raw Leaflet Format)</h3>
              <div className="bg-black p-4 rounded text-[#888] font-mono text-[11px] leading-relaxed break-all">
                {state.routes.some(r => r.polyline?.length) ? getPolylinePreview() : 
                  (state.status === 'COMPLETED' ? "[]" : 
                    <span className="opacity-50">[ [60.45608, 57.07907], [60.45610, 57.07910], [60.45612, 57.07915], ... ]</span>
                  )
                }
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel: Console/Logs */}
        <section className="col-span-1 md:col-span-4 bg-[#0d0d0d] p-8 md:border-l border-[#222] flex flex-col min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h2 className="text-sm uppercase tracking-widest text-white">Terminal Output</h2>
            <span className="text-[10px] font-mono text-[#444]">bash -- node server.ts</span>
          </div>

          <div className="flex-1 bg-black rounded p-4 font-mono text-xs leading-6 overflow-y-auto mb-6">
            {state.logs.length === 0 && state.status !== 'RUNNING' && state.status !== 'COMPLETED' && (
              <p className="text-[#666]">Ready to execute scrape protocol...</p>
            )}
            
            {state.logs.map((log, i) => (
               <p key={i} className={`text-[#666] ${log.color || ''}`}>
                [{log.time}] <span className={log.levelColor}>{log.level}:</span> {log.message}
               </p>
            ))}
            
            {state.status === 'COMPLETED' && state.duration !== undefined && (
              <p className="text-green-500 mt-2">Process completed in {state.duration}s</p>
            )}
            {state.status === 'RUNNING' && (
              <div className="animate-pulse mt-2 inline-block w-2 h-4 bg-white opacity-50"></div>
            )}
            <div ref={logsEndRef} />
          </div>

          <div className="pt-6 border-t border-[#222] flex-shrink-0">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-center">
              <div className="bg-[#151515] p-3 rounded">
                <div className="text-[9px] uppercase text-[#666] mb-1">Regions</div>
                <div className="text-xl font-serif text-white">{state.regionsProcessed}</div>
              </div>
              <div className="bg-[#151515] p-3 rounded">
                <div className="text-[9px] uppercase text-[#666] mb-1">Routes Saved</div>
                <div className="text-xl font-serif text-[#f27d26]">{state.routesSaved}</div>
              </div>
              <div className="bg-[#151515] p-3 rounded">
                <div className="text-[9px] uppercase text-[#666] mb-1">Coords</div>
                <div className="text-xl font-serif text-white">{state.coordsCached}</div>
              </div>
              <div className="bg-[#151515] p-3 rounded">
                <div className="text-[9px] uppercase text-[#666] mb-1">Duplicates</div>
                <div className="text-xl font-serif text-yellow-500">{state.duplicatesSkipped}</div>
              </div>
              <div className="bg-[#151515] p-3 rounded">
                <div className="text-[9px] uppercase text-[#666] mb-1">Errors</div>
                <div className="text-xl font-serif text-red-500">{state.errorsFound}</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Status Bar */}
      <footer className="px-8 py-2 bg-[#0f0f0f] flex-shrink-0 border-t border-[#222] flex justify-between items-center text-[10px] font-mono text-[#555]">
        <div className="flex gap-4">
          <span>NODE_ENV: development</span>
          <span>FORMATS: JSON, CSV, GPX, KML</span>
        </div>
        <div>ID-I-LESOM.COM DATA PIPELINE</div>
      </footer>
    </div>
  );
}
