
import React from 'react';
import { Menu } from './Icons';

interface HeaderProps {
  setIsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const Header: React.FC<HeaderProps> = ({ setIsPanelOpen }) => {
  return (
    <header className="flex-shrink-0 flex items-center justify-between p-4 bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 z-20">
      <h1 className="text-lg font-bold text-cyan-400">Typhoon Analysis Center</h1>
      <button 
        onClick={() => setIsPanelOpen(true)}
        className="md:hidden p-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        aria-label="Open analysis panel"
      >
        <Menu className="w-6 h-6" />
      </button>
    </header>
  );
};
