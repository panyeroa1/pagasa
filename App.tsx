
import React, { useState } from 'react';
import { MapDisplay } from './components/MapDisplay';
import { AnalysisPanel } from './components/AnalysisPanel';
import { AlertTriangle, X } from './components/Icons';
import { Header } from './components/Header';

export type Alert = {
  type: 'info' | 'warning' | 'error';
  message: string;
} | null;

function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(false); // Default to closed for mobile-first
  const [alert, setAlert] = useState<Alert>({type: 'info', message: "Welcome! Click 'Start Full Automated Analysis' to begin."});

  const alertStyles = {
    info: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30',
    warning: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
    error: 'bg-red-500/20 text-red-200 border-red-400/30',
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      <Header setIsPanelOpen={setIsPanelOpen} />
      
      {alert && (
         <div className={`flex items-center justify-between gap-4 p-3 text-sm border-y border-gray-700 ${alertStyles[alert.type]}`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p>{alert.message}</p>
            </div>
            <button onClick={() => setAlert(null)} className="p-1 rounded-full hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
      )}

      <div className="relative flex-1 flex min-h-0">
        <main className="flex-1 h-full">
          <MapDisplay />
        </main>
        
        {/* Backdrop for mobile overlay */}
        {isPanelOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setIsPanelOpen(false)} />}

        {/* Side Panel */}
        <aside
          className={`
            fixed top-0 right-0 h-screen w-full max-w-md 
            md:relative md:h-full md:w-1/3 md:max-w-none 
            transform transition-transform duration-300 ease-in-out z-40
            bg-gray-800
            ${isPanelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          `}
        >
          <AnalysisPanel setAlert={setAlert} setIsPanelOpen={setIsPanelOpen} />
        </aside>
      </div>
    </div>
  );
}

export default App;
