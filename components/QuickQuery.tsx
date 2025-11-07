
import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { PAGASA_SYSTEM_PROMPT } from '../utils/systemPrompt';
import { Spinner, Send, AlertTriangle } from './Icons';

type QueryMode = 'lite' | 'web' | 'local';

export const QuickQuery: React.FC = () => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<QueryMode>('lite');
  const [response, setResponse] = useState('');
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const handleModeChange = (newMode: QueryMode) => {
    setMode(newMode);
    if (newMode === 'local' && !userLocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setError('');
        },
        () => {
          setError('Geolocation is required for local search. Please enable it in your browser settings.');
        }
      );
    }
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResponse('');
    setSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let model: string;
      let config: any = {
        systemInstruction: PAGASA_SYSTEM_PROMPT
      };
      
      switch(mode) {
        case 'lite':
          model = 'gemini-flash-lite-latest';
          break;
        case 'web':
          model = 'gemini-2.5-flash';
          config.tools = [{googleSearch: {}}];
          break;
        case 'local':
          if (!userLocation) {
              throw new Error("Location not available. Please allow location access.");
          }
          model = 'gemini-2.5-flash';
          config.tools = [{googleMaps: {}}];
          config.toolConfig = { retrievalConfig: { latLng: userLocation } };
          break;
      }
      
      const result = await ai.models.generateContent({
        model,
        contents: query,
        config,
      });

      setResponse(result.text);
      
      if ((mode === 'web' || mode === 'local') && result.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        setSources(result.candidates[0].groundingMetadata.groundingChunks);
      }

    } catch (err) {
      console.error('Gemini API Error:', err);
      setError('Failed to get response from Gemini. ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, mode, userLocation]);

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex-shrink-0 space-y-2">
          <label className="block text-sm font-medium text-gray-300">Query Mode</label>
          <div className="flex rounded-md shadow-sm">
            <button onClick={() => handleModeChange('lite')} className={`flex-1 px-4 py-2 text-sm rounded-l-md ${mode === 'lite' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Fast</button>
            <button onClick={() => handleModeChange('web')} className={`flex-1 px-4 py-2 text-sm border-x border-gray-600 ${mode === 'web' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Web Search</button>
            <button onClick={() => handleModeChange('local')} className={`flex-1 px-4 py-2 text-sm rounded-r-md ${mode === 'local' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Local Info</button>
          </div>
          {mode === 'local' && !userLocation && !error && <p className="text-xs text-yellow-400 mt-1">Requesting location for local search...</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex-shrink-0 flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask PAG-ASA a question..."
          className="flex-1 block w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-gray-200 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !query.trim()} className="p-2 rounded-full bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500">
          {loading ? <Spinner className="w-5 h-5"/> : <Send className="w-5 h-5"/>}
        </button>
      </form>
      
      {error && (
         <div className="flex-shrink-0 flex items-center gap-2 p-3 text-sm text-red-300 bg-red-500/10 rounded-lg">
            <AlertTriangle className="w-5 h-5" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-900/50 rounded-lg p-4 space-y-4">
        {loading && !response && (
            <div className="flex items-center justify-center h-full text-gray-400">
                <Spinner className="w-6 h-6 mr-2"/> Consulting PAG-ASA...
            </div>
        )}
        {response && <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{response}</div>}
        {sources.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-400 mt-4 mb-2">Sources:</h4>
            <ul className="space-y-1">
              {sources.map((source, index) => {
                  const uri = source.web?.uri || source.maps?.uri;
                  const title = source.web?.title || source.maps?.title;
                  if (!uri) return null;
                  return (
                    <li key={index} className="text-xs">
                        <a href={uri} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline break-all">
                            {title || uri}
                        </a>
                    </li>
                  )
                })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
