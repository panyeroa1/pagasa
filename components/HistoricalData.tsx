
import React, { useState } from 'react';
import { ChevronDown } from './Icons';

type Typhoon = {
  name: string;
  year: number;
  category: string;
  maxWinds: string;
  fatalities: string;
  summary: string;
};

const historicalData: Typhoon[] = [
  {
    name: 'Haiyan (Yolanda)',
    year: 2013,
    category: 'Category 5-equivalent',
    maxWinds: '315 km/h (195 mph)',
    fatalities: '6,300+',
    summary: 'One of the most powerful tropical cyclones ever recorded. Devastated portions of Southeast Asia, particularly the Philippines, with catastrophic storm surge.'
  },
  {
    name: 'Mangkhut (Ompong)',
    year: 2018,
    category: 'Category 5-equivalent',
    maxWinds: '285 km/h (180 mph)',
    fatalities: '134',
    summary: 'A powerful typhoon that caused widespread damage in Guam, the Philippines, and South China. Known for its massive size and destructive winds.'
  },
  {
    name: 'Rai (Odette)',
    year: 2021,
    category: 'Category 5-equivalent',
    maxWinds: '280 km/h (175 mph)',
    fatalities: '409',
    summary: 'Underwent rapid intensification just before making landfall in the Philippines, causing severe and unexpected damage across the Visayas and Mindanao.'
  }
];

export const HistoricalData: React.FC = () => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">Historical Typhoon Data</h2>
      <p className="text-sm text-gray-400">
        Compare current events with notable past typhoons. This data serves as a reference for understanding potential storm impacts.
      </p>
      <div className="space-y-2">
        {historicalData.map((typhoon, index) => (
          <div key={index} className="rounded-lg bg-gray-900/50 overflow-hidden border border-gray-700">
            <button
              onClick={() => toggleExpand(index)}
              className="w-full flex justify-between items-center p-4 text-left hover:bg-gray-700/50 transition-colors"
            >
              <span className="font-semibold text-gray-200">{typhoon.name} ({typhoon.year})</span>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedIndex === index ? 'rotate-180' : ''}`} />
            </button>
            {expandedIndex === index && (
              <div className="p-4 border-t border-gray-700 bg-gray-900">
                <p className="text-gray-300 mb-3">{typhoon.summary}</p>
                <ul className="text-sm space-y-1 text-gray-400">
                  <li><strong>Category:</strong> {typhoon.category}</li>
                  <li><strong>Max Winds:</strong> {typhoon.maxWinds}</li>
                  <li><strong>Fatalities:</strong> {typhoon.fatalities}</li>
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
