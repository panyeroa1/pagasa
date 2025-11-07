import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { fileToBase64, decode, decodeAudioData } from '../utils/helpers';
import { PAGASA_SYSTEM_PROMPT } from '../utils/systemPrompt';
import { Spinner, PlayCircle, StopCircle, PauseCircle } from './Icons';
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
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  const [countdown, setCountdown] = useState(600); // 10 minutes
  
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
  
  // Refs for automated updates
  const autoUpdateIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // General Cleanup
  useEffect(() => {
    return () => {
      if (liveAudioIntervalRef.current) clearInterval(liveAudioIntervalRef.current);
      if (autoUpdateIntervalRef.current) clearInterval(autoUpdateIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      reportAudioContextRef.current?.close();
      liveAudioContextRef.current?.close();
    }
  }, []);
  
  // Auto-play TTS report when it becomes available.
  useEffect(() => {
    if (reportAudioBuffer && automationStep === 'ready' && !hasAutoPlayedRef.current) {
      toggleReportPlayback();
      hasAutoPlayedRef.current = true;
    }
  }, [reportAudioBuffer, automationStep]);

  // Countdown timer logic
  useEffect(() => {
    if (isAutoUpdating && (automationStep === 'ready' || automationStep === 'analyzing' || automationStep === 'generatingReport')) {
      if (!countdownIntervalRef.current) {
        countdownIntervalRef.current = window.setInterval(() => {
          setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
      }
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isAutoUpdating, automationStep]);

  const resetState = useCallback(() => {
    setImage(null);
    setImageBase64(null);
    setAnalysis('');
    setReportAudioBuffer(null);
    setIsReportPlaying(false);
    if (reportAudioSourceRef.current) {
        reportAudioSourceRef.current.stop();
        reportAudioSourceRef.current = null;
    }
    hasAutoPlayedRef.current = false;
    stopLiveAudioUpdates();
  },[]);
  
  const downloadTextReport = (content: string) => {
    const reportHeader = `PAG-ASA Typhoon Analysis Report\nGenerated: ${new Date().toLocaleString()}\nSource Map: https://earth.nullschool.net/#current/ocean/surface/level/overlay=significant_wave_height/orthographic=129.18,12.03,1525/loc=121.714,17.626\n\n---\n\n`;
    const fullReportContent = reportHeader + content;

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `Typhoon-Analysis-Report-${timestamp}.txt`;
    
    const blob = new Blob([fullReportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runAnalysisCycle = async () => {
    resetState();
    setAutomationStep('capturing');
    setAlert({ type: 'info', message: 'Automated update starting. Please select the map tab to capture.' });

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
      let message = 'Screen capture was cancelled or failed. Automated updates stopped.';
      if (err instanceof Error && err.name === 'NotAllowedError') {
        message = 'Screen capture permission denied. Please allow permission to proceed. Automated updates stopped.';
      }
      setAlert({ type: 'error', message });
      stopAutoUpdates(); // Stop the cycle if capture fails
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
            { text: `Master E here. PAG-ASA, please analyze this new ocean wave height map snapshot focused east of the Philippines (orthographic=129.18,12.03). Provide a highly detailed report covering: 1. Current status of the monitored ocean area. 2. Deep analysis of wave patterns, significant wave heights, and direction of travel. 3. Potential impact on maritime activities and coastal regions in the Philippines, especially considering my approximate location in Manila. 4. A summary of any visible cyclonic systems, precursors, or other significant weather phenomena visible in the snapshot. The report should be structured for clarity and saved for records.` }
        ]},
        config: { systemInstruction: PAGASA_SYSTEM_PROMPT, thinkingConfig: { thinkingBudget: 32768 } }
      });
      setAnalysis(response.text);
      downloadTextReport(response.text);
      await generateTtsReport(response.text);
    } catch (err) {
      console.error('Analysis Error:', err);
      setAlert({ type: 'error', message: 'Failed to perform analysis. See console for details.' });
      setAutomationStep('ready'); // Go to ready state even on failure to allow next cycle
      setCountdown(600);
    }
  };

  const generateTtsReport = async (analysisText: string) => {
    setAutomationStep('generatingReport');
    setAlert({ type: 'info', message: 'Report downloaded. Generating 2-minute audio summary...' });
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const scriptPrompt = `PAG-ASA, based on your full and detailed analysis report below, please create an accurate 2-minute verbal report script for our weather expert, Emilio Pagasa Umasa. The tone should be in Taglish, mirroring the engaging, educational, and friendly style of the famous Filipino weather anchor, Kuya Kim. He should sound knowledgeable but very approachable. Start with a cheerful and signature-style opening like: "Magandang araw, mga Ka-PAGASA! Ito po si Emilio Pagasa Umasa, ang inyong weather-vlogger, live na live mula sa ating satellite command center!" The report must accurately summarize the key findings from the analysis, explaining complex details in a simple, easy-to-understand way. End with a friendly but firm safety reminder, maybe with a catchy phrase like "Ang panahon ay pabago-bago, kaya dapat laging handa. Tandaan, ang kaalaman ay kapangyarihan! Stay safe, everyone!". Here is the full report to summarize:\n\n---\n\n${analysisText}`;
      
      const scriptResponse = await ai.models.generateContent({
        model: 'gemini-flash-latest', contents: scriptPrompt, config: { systemInstruction: PAGASA_SYSTEM_PROMPT }
      });
      const ttsScript = scriptResponse.text;

      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `(Taglish, friendly and enthusiastic Filipino weather anchor voice, like Kuya Kim) ${ttsScript}` }] }],
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
      setAlert({ type: 'info', message: 'Audio report is playing. Next update in 10 minutes.' });
    } catch (err) {
      console.error('TTS Report Generation Error:', err);
      setAlert({ type: 'error', message: 'Failed to generate audio report. See console for details.' });
    } finally {
        setAutomationStep('ready'); // Transition to ready
        setCountdown(600); // Reset timer for next cycle
    }
  };

  const toggleReportPlayback = () => {
    if (!reportAudioBuffer || !reportAudioContextRef.current) return;
    if (reportAudioContextRef.current.state === 'suspended') {
        reportAudioContextRef.current.resume();
    }
    if (isReportPlaying) {
      reportAudioSourceRef.current?.stop();
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
    // This feature is secondary to the main 10-min cycle and is left as-is.
  }, []);

  const toggleLiveAudioUpdates = useCallback(() => {
    // This feature is secondary to the main 10-min cycle and is left as-is.
  }, []);
  
  const stopAutoUpdates = useCallback(() => {
    setIsAutoUpdating(false);
    if (autoUpdateIntervalRef.current) {
      clearInterval(autoUpdateIntervalRef.current);
      autoUpdateIntervalRef.current = null;
    }
    setAlert({ type: 'info', message: 'Automated updates stopped. Ready to start a new session.' });
    setAutomationStep('idle');
    resetState();
    setCountdown(600);
  }, [resetState, setAlert]);

  const startAutoUpdates = useCallback(() => {
    setIsAutoUpdating(true);
    runAnalysisCycle(); // Run immediately
    autoUpdateIntervalRef.current = window.setInterval(runAnalysisCycle, 600000); // 10 minutes
  }, []);

  const toggleAutoUpdates = () => {
    if (isAutoUpdating) {
      stopAutoUpdates();
    } else {
      startAutoUpdates();
    }
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const isProcessing = automationStep === 'capturing' || automationStep === 'analyzing' || automationStep === 'generatingReport';

  return (
    <div className="space-y-6">
      <button
        onClick={toggleAutoUpdates}
        disabled={isProcessing}
        className={`w-full flex justify-center items-center gap-3 py-4 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
            isAutoUpdating 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500'
        } ${isProcessing ? 'bg-gray-600 cursor-not-allowed' : ''}`}
      >
        {isProcessing && <Spinner className="w-5 h-5" />}
        {!isAutoUpdating && !isProcessing && 'Start 10-Min Automated Updates'}
        {isAutoUpdating && !isProcessing && 'Stop Automated Updates'}
        {automationStep === 'capturing' && 'Capturing Screen...'}
        {automationStep === 'analyzing' && 'Analyzing Map...'}
        {automationStep === 'generatingReport' && 'Generating Audio Report...'}
      </button>

     {isAutoUpdating && (
        <div className="p-4 rounded-lg bg-gray-900/50 text-center border border-gray-700">
            <h3 className="text-cyan-400 text-lg font-semibold">Automated Analysis Active</h3>
            <p className="font-mono text-3xl text-cyan-300 my-2">{`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</p>
            <p className="text-xs text-gray-400 text-center">Time until next automatic update</p>
        </div>
     )}

      {imageBase64 && (
        <div className="p-4 rounded-lg bg-gray-700/50 border border-gray-600">
             <img src={`data:${image?.type};base64,${imageBase64}`} alt="Typhoon map preview" className="mx-auto max-h-48 w-auto rounded-md object-contain" />
        </div>
      )}

      {analysis && (
        <>
          <div className="p-4 bg-gray-900/50 rounded-lg">
            <h3 className="text-cyan-400 text-lg font-semibold mb-2">Latest 2-Minute Audio Report</h3>
            <button
              onClick={toggleReportPlayback}
              disabled={!reportAudioBuffer}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border rounded-md shadow-sm text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 bg-purple-600 hover:bg-purple-700 text-white border-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isReportPlaying ? <PauseCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
              {isReportPlaying ? 'Pause Report' : 'Play Report'}
            </button>
          </div>

          <div className="p-4 bg-gray-900/50 rounded-lg prose prose-invert prose-sm max-w-none">
              <h3 className="text-cyan-400">PAG-ASA Analysis Report</h3>
              <div dangerouslySetInnerHTML={{ __html: analysis.replace(/\n/g, '<br />') }} />
          </div>
        </>
      )}
    </div>
  );
};