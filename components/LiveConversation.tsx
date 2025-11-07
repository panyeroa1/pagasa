
import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { decode, encode, decodeAudioData } from '../utils/helpers';
import { PAGASA_SYSTEM_PROMPT } from '../utils/systemPrompt';
import { Mic, MicOff, AlertTriangle } from './Icons';

export const LiveConversation: React.FC = () => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState<string>('');
    const [userTranscript, setUserTranscript] = useState('');
    const [modelTranscript, setModelTranscript] = useState('');
    const [history, setHistory] = useState<{ user: string; model: string }[]>([]);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    
    const stopConversation = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }

        setIsActive(false);
        setIsConnecting(false);
    }, []);

    const startConversation = async () => {
        setIsConnecting(true);
        setError('');
        setHistory([]);
        setUserTranscript('');
        setModelTranscript('');

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support audio recording.');
            }
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            nextStartTimeRef.current = 0;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: PAGASA_SYSTEM_PROMPT,
                },
                callbacks: {
                    onopen: () => {
                        sourceRef.current = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
                        processorRef.current = audioContextRef.current!.createScriptProcessor(4096, 1, 1);

                        processorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        sourceRef.current.connect(processorRef.current);
                        processorRef.current.connect(audioContextRef.current!.destination);
                        
                        setIsConnecting(false);
                        setIsActive(true);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            setUserTranscript(prev => prev + message.serverContent.inputTranscription.text);
                        }
                        if (message.serverContent?.outputTranscription) {
                            setModelTranscript(prev => prev + message.serverContent.outputTranscription.text);
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                        }

                        if (message.serverContent?.turnComplete) {
                            setHistory(prev => [...prev, { user: userTranscript, model: modelTranscript }]);
                            setUserTranscript('');
                            setModelTranscript('');
                        }
                    },
                    onclose: () => {
                        stopConversation();
                    },
                    onerror: (e) => {
                        console.error('Live API Error:', e);
                        setError('An error occurred with the connection.');
                        stopConversation();
                    },
                },
            });

        } catch (err) {
            console.error(err);
            setError((err as Error).message || 'Failed to start conversation.');
            setIsConnecting(false);
            setIsActive(false);
        }
    };

    const toggleConversation = () => {
        if (isActive || isConnecting) {
            stopConversation();
        } else {
            startConversation();
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex-shrink-0">
                <button
                    onClick={toggleConversation}
                    disabled={isConnecting}
                    className={`w-full flex justify-center items-center gap-3 py-3 px-4 border rounded-md shadow-sm text-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        isActive
                            ? 'bg-red-600 hover:bg-red-700 text-white border-red-500'
                            : 'bg-green-600 hover:bg-green-700 text-white border-green-500'
                    } ${isConnecting ? 'bg-gray-600 animate-pulse' : ''}`}
                >
                    {isActive ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    {isConnecting ? 'Connecting...' : (isActive ? 'Stop Conversation' : 'Start Conversation')}
                </button>
            </div>

            {error && (
                 <div className="flex-shrink-0 flex items-center gap-2 p-3 text-sm text-red-300 bg-red-500/10 rounded-lg">
                    <AlertTriangle className="w-5 h-5" /> {error}
                </div>
            )}
            
            <div className="flex-1 overflow-y-auto bg-gray-900/50 rounded-lg p-4 space-y-4">
                {history.map((turn, index) => (
                    <div key={index} className="space-y-2">
                        <p><strong className="text-cyan-400">You:</strong> {turn.user}</p>
                        <p><strong className="text-purple-400">PAG-ASA:</strong> {turn.model}</p>
                    </div>
                ))}
                {userTranscript && <p><strong className="text-cyan-400">You:</strong> <span className="text-gray-400 italic">{userTranscript}</span></p>}
                {modelTranscript && <p><strong className="text-purple-400">PAG-ASA:</strong> <span className="text-gray-400 italic">{modelTranscript}</span></p>}
                 {!isActive && history.length === 0 && (
                  <p className="text-center text-gray-500 pt-8">Click 'Start Conversation' to talk with the PAG-ASA typhoon analyst.</p>
                )}
            </div>
             <p className="text-xs text-center text-gray-500">
                {isActive ? "Microphone is active. Start speaking." : "Ready to start a new voice session."}
            </p>
        </div>
    );
};
