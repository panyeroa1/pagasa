
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { fileToBase64, decode, decodeAudioData } from '../utils/helpers';
import { PAGASA_SYSTEM_PROMPT } from '../utils/systemPrompt';
import { Spinner, UploadCloud, PlayCircle, StopCircle, Camera, PauseCircle } from './Icons';
import { Alert } from '../App';

type AutomationStep = 'idle' | 'capturing' | 'analyzing' | 'generatingReport' | 'ready';

interface TyphoonAnalysisProps {
  setAlert: React.Dispatch<React.SetStateAction<Alert>>;
}

export const TyphoonAnalysis: React.FC<TyphoonAnalysisProps> = ({ setAlert }) => {
  const [image, setImage] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [automationStep, setAutomationStep] = useState<AutomationStep>('idle');
  const [timeLeft, setTimeLeft] = useState(900);
  
  // State for 2-min report
  const [reportAudioBuffer, setReportAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isReportPlaying, setIsReportPlaying] = useState(false);
  const reportAudioContextRef = useRef<AudioContext | null>(null);
  const reportAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const hasAutoPlayedRef = useRef(false);

  // State for 60s live updates
  const [isLiveAudioUpdating, setIsLiveAudioUpdating] = useState(false);
  const [liveAudioUpdateStatus, setLiveAudioUpdateStatus] = useState('');
  const liveAudioIntervalRef = useRef<number | null>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);

  // General Cleanup
  useEffect(() => {
    return () => {
      if (liveAudioIntervalRef.current) clearInterval(liveAudioIntervalRef.current);
      reportAudioContextRef.current?.close();
      liveAudioContextRef.current?.close();
    }
  }, []);

  // Countdown timer logic
  useEffect(() => {
    if (timeLeft === 0) {
      setAlert({ type: 'warning', message: 'Analysis is over 15 minutes old. Please perform a new analysis.'});
    }
    if (timeLeft <= 0 || automationStep !== 'ready') return;
    const timer = setInterval(() => setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, automationStep, setAlert]);
  
  // Auto-play TTS report when it becomes available for the first time in a cycle.
  useEffect(() => {
    if (reportAudioBuffer && automationStep === 'ready' && !hasAutoPlayedRef.current) {
      toggleReportPlayback();
      hasAutoPlayedRef.current = true;
    }
  }, [reportAudioBuffer, automationStep]);

  const resetState = () => {
    setImage(null);
    setImageBase64(null);
    setAnalysis('');
    setReportAudioBuffer(null);
    setIsReportPlaying(false);
    if (reportAudioSourceRef.current) {
        reportAudioSourceRef.current.stop();
        reportAudioSourceRef.current = null;
    }
    hasAutoPlayedRef.current = false; // Reset auto-play flag for the next run
    stopLiveAudioUpdates();
  };

  const startAutomatedAnalysis = async () => {
    resetState();
    setAutomationStep('capturing');
    setAlert({ type: 'info', message: 'Please select the browser tab with the map to capture.' });

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: "browser", cursor: "never" } as any, audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(videoTrack);
      const bitmap = await imageCapture.grabFrame();
      videoTrack.stop();

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error("Canvas to Blob conversion failed.");
        const file = new File([blob], "map-snapshot.jpg", { type: 'image/jpeg' });
        const base64 = await fileToBase64(file);
        
        setImage(file);
        setImageBase64(base64);
        
        await performAnalysisInternal(base64, file);
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.error("Screen capture failed:", err);
      let message = 'Screen capture was cancelled or failed.';
      if (err instanceof Error && err.name === 'NotAllowedError') {
        message = 'Screen capture permission was denied. Please click "Start Analysis" again and allow permission to proceed.';
      }
      setAlert({ type: 'error', message });
      setAutomationStep('idle');
    }
  };
  
  const performAnalysisInternal = async (base64: string, file: File) => {
    setAutomationStep('analyzing');
    setAlert({ type: 'info', message: 'Performing deep analysis... This may take a moment.' });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [
            { inlineData: { mimeType: file.type, data: base64 } },
            { text: `Master E here. PAG-ASA, please analyze this wind map snapshot. Provide your standard, location-aware report. My approximate location is Manila, Philippines.` }
        ]},
        config: { systemInstruction: PAGASA_SYSTEM_PROMPT, thinkingConfig: { thinkingBudget: 32768 } }
      });
      setAnalysis(response.text);
      await generateTtsReport(response.text);
    } catch (err) {
      console.error('Analysis Error:', err);
      setAlert({ type: 'error', message: 'Failed to perform analysis. See console for details.' });
      setAutomationStep('idle');
    }
  };

  const generateTtsReport = async (analysisText: string) => {
    setAutomationStep('generatingReport');
    setAlert({ type: 'info', message: 'Generating 2-minute audio report...' });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const scriptPrompt = `PAG-ASA, based on your full analysis report provided below, create a comprehensive 2-minute verbal report script for our reporter, Emilio Pagasa Umasa. The tone should be informative, calm, and professional, delivered in Taglish suitable for a broadcast. Start with his standard introduction: "Magandang araw, Pilipinas! Ito po ang inyong lingkod, Emilio Pagasa Umasa, nag-uulat live mula sa satellite." and end with a concluding safety reminder. Here is the full report to summarize:\n\n---\n\n${analysisText}`;
      
      const scriptResponse = await ai.models.generateContent({
        model: 'gemini-flash-latest', contents: scriptPrompt, config: { systemInstruction: PAGASA_SYSTEM_PROMPT }
      });
      const ttsScript = scriptResponse.text;

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `(Taglish, deep Filipino reporter accent) ${ttsScript}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        },
      });

      const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio data received from TTS API.");

      if (!reportAudioContextRef.current || reportAudioContextRef.current.state === 'closed') {
        reportAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const buffer = await decodeAudioData(decode(base64Audio), reportAudioContextRef.current, 24000, 1);
      setReportAudioBuffer(buffer);
      setAutomationStep('ready');
      setAlert({ type: 'info', message: 'Analysis complete. Playing audio report now.' });
      setTimeLeft(900);
    } catch (err) {
      console.error('TTS Report Generation Error:', err);
      setAlert({ type: 'error', message: 'Failed to generate audio report. See console for details.' });
      setAutomationStep('ready'); // Still ready, just without audio
    }
  };

  const toggleReportPlayback = () => {
    if (!reportAudioBuffer || !reportAudioContextRef.current) return;

    // Best-effort attempt to resume audio context if suspended by browser autoplay policy
    if (reportAudioContextRef.current.state === 'suspended') {
        reportAudioContextRef.current.resume();
    }

    if (isReportPlaying) {
      reportAudioSourceRef.current?.stop();
      // onended will set playing state to false
    } else {
      const source = reportAudioContextRef.current.createBufferSource();
      source.buffer = reportAudioBuffer;
      source.connect(reportAudioContextRef.current.destination);
      source.start();
      source.onended = () => {
          setIsReportPlaying(false);
          reportAudioSourceRef.current = null;
      };
      reportAudioSourceRef.current = source;
      setIsReportPlaying(true);
    }
  };

  const stopLiveAudioUpdates = useCallback(() => {
    if (liveAudioIntervalRef.current) clearInterval(liveAudioIntervalRef.current);
    liveAudioIntervalRef.current = null;
    setIsLiveAudioUpdating(false);
    setLiveAudioUpdateStatus('');
  },[]);

  const fetchAndPlayLiveUpdate = useCallback(async () => {
    if (!imageBase64 || !image) return;
    try {
        setLiveAudioUpdateStatus('Generating new audio summary...');
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const textResponse = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: { parts: [{ inlineData: { mimeType: image.type, data: imageBase64 } }, { text: 'PAG-ASA, provide a single, concise sentence for a verbal status update based on this map.' }] },
            config: { systemInstruction: PAGASA_SYSTEM_PROMPT }
        });
        const summaryText = textResponse.text;

        setLiveAudioUpdateStatus('Synthesizing speech...');
        const ttsPrompt = `(Taglish, deep Filipino reporter accent) Emilio Pagasa Umasa here with a live update: ${summaryText}`;
        const ttsResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: ttsPrompt }] }],
            config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } } },
        });

        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio && liveAudioContextRef.current) {
            setLiveAudioUpdateStatus('Playing audio update...');
            const audioBuffer = await decodeAudioData(decode(base64Audio), liveAudioContextRef.current, 24000, 1);
            const source = liveAudioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(liveAudioContextRef.current.destination);
            source.start();
            source.onended = () => setLiveAudioUpdateStatus('Update complete. Next update in 60s.');
        } else { throw new Error("No audio data received."); }
    } catch (err) {
        setLiveAudioUpdateStatus(`Error: ${(err as Error).message}. Stopping updates.`);
        stopLiveAudioUpdates();
    }
  }, [imageBase64, image, stopLiveAudioUpdates]);

  const toggleLiveAudioUpdates = useCallback(() => {
    if (isLiveAudioUpdating) {
        stopLiveAudioUpdates();
    } else {
        if (!liveAudioContextRef.current || liveAudioContextRef.current.state === 'closed') {
             liveAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        setIsLiveAudioUpdating(true);
        fetchAndPlayLiveUpdate();
        liveAudioIntervalRef.current = window.setInterval(fetchAndPlayLiveUpdate, 60000);
    }
  }, [isLiveAudioUpdating, stopLiveAudioUpdates, fetchAndPlayLiveUpdate]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isAutomating = automationStep !== 'idle' && automationStep !== 'ready';

  return (
    <div className="space-y-6">
      <button
        onClick={startAutomatedAnalysis}
        disabled={isAutomating}
        className="w-full flex justify-center items-center gap-3 py-4 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500"
      >
        {isAutomating && <Spinner className="w-5 h-5" />}
        {automationStep === 'idle' && 'Start Full Automated Analysis'}
        {automationStep === 'capturing' && 'Capturing Screen...'}
        {automationStep === 'analyzing' && 'Analyzing Map...'}
        {automationStep === 'generatingReport' && 'Generating Audio Report...'}
        {automationStep === 'ready' && 'Start New Automated Analysis'}
      </button>

      {imageBase64 && (
        <div className="p-4 rounded-lg bg-gray-700/50 border border-gray-600">
             <img src={`data:${image?.type};base64,${imageBase64}`} alt="Typhoon map preview" className="mx-auto max-h-48 w-auto rounded-md object-contain" />
        </div>
      )}

      {analysis && (
        <>
          <div className="p-4 bg-gray-900/50 rounded-lg">
            <h3 className="text-cyan-400 text-lg font-semibold mb-2">2-Minute Audio Report</h3>
            <p className="font-mono text-3xl text-center text-cyan-400 my-2">{`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</p>
            <p className="text-xs text-gray-400 text-center mb-4">Time until next recommended analysis</p>
            <button
              onClick={toggleReportPlayback}
              disabled={!reportAudioBuffer}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border rounded-md shadow-sm text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 bg-purple-600 hover:bg-purple-700 text-white border-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isReportPlaying ? <PauseCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
              {isReportPlaying ? 'Pause Report' : 'Play 2-Min Report'}
            </button>
          </div>

          <div className="p-4 bg-gray-900/50 rounded-lg prose prose-invert prose-sm max-w-none">
              <h3 className="text-cyan-400">PAG-ASA Analysis Report</h3>
              <div dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, '<br />') }} />
          </div>

          <div className="p-4 bg-gray-900/50 rounded-lg">
              <h3 className="text-cyan-400 mb-3">Live Audio Updates (60s)</h3>
              <p className="text-sm text-gray-400 mb-4">For continuous, short updates based on the current analysis, start the live audio loop.</p>
              <button
                  onClick={toggleLiveAudioUpdates}
                  className={`w-full flex justify-center items-center gap-3 py-3 px-4 border rounded-md shadow-sm text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                      isLiveAudioUpdating
                          ? 'bg-red-600 hover:bg-red-700 text-white border-red-500'
                          : 'bg-green-600 hover:bg-green-700 text-white border-green-500'
                  }`}
              >
                  {isLiveAudioUpdating ? <StopCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                  {isLiveAudioUpdating ? 'Stop Live Updates' : 'Start Live Updates'}
              </button>
              {liveAudioUpdateStatus && <p className="text-xs text-gray-400 mt-3 text-center italic">{liveAudioUpdateStatus}</p>}
          </div>
        </>
      )}
    </div>
  );
};
