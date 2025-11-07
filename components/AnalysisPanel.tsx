
import React, { useState } from 'react';
import { TyphoonAnalysis } from './TyphoonAnalysis';
import { LiveConversation } from './LiveConversation';
import { QuickQuery } from './QuickQuery';
import { HistoricalData } from './HistoricalData';
import { BrainCircuit, MessageSquare, Search, History, X } from './Icons';
import { Alert } from '../App';

type Tab = 'analysis' | 'live' | 'query' | 'history';

interface AnalysisPanelProps {
  setAlert: React.Dispatch<React.SetStateAction<Alert>>;
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ setAlert, setIsPanelOpen }) => {
  const [activeTab, setActiveTab] = useState<Tab>('analysis');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'analysis':
        return <TyphoonAnalysis setAlert={setAlert} />;
      case 'live':
        return <LiveConversation />;
      case 'query':
        return <QuickQuery />;
      case 'history':
        return <HistoricalData />;
      default:
        return null;
    }
  };

  const TabButton = ({ tabId, icon, label }: { tabId: Tab; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors duration-200 ${
        activeTab === tabId
          ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400'
          : 'text-gray-400 hover:bg-gray-700/50'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-gray-800/50 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-gray-700 pr-2">
        <div className="flex flex-1">
          <TabButton tabId="analysis" icon={<BrainCircuit className="w-5 h-5" />} label="Analysis" />
          <TabButton tabId="live" icon={<MessageSquare className="w-5 h-5" />} label="Live" />
          <TabButton tabId="query" icon={<Search className="w-5 h-5" />} label="Query" />
          <TabButton tabId="history" icon={<History className="w-5 h-5" />} label="History" />
        </div>
        <button
          onClick={() => setIsPanelOpen(false)}
          className="p-2 text-gray-400 rounded-full hover:bg-white/10 md:hidden"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {renderTabContent()}
      </div>
    </div>
  );
};
