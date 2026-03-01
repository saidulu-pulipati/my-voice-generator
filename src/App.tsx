/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic2, 
  Download, 
  Play, 
  Pause, 
  RefreshCw, 
  Languages, 
  Volume2, 
  Volume1,
  VolumeX,
  Settings2, 
  Sparkles,
  Info,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const MAX_TOKENS = 8192;
const LANGUAGES = [
  { id: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { id: 'te-IN', name: 'Telugu (India)', flag: '🇮🇳' },
];

const VOICE_TYPES = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'youthful', label: 'Youthful' },
  { id: 'mature', label: 'Mature' },
  { id: 'child-like', label: 'Child-like' },
];

const STYLES = [
  { id: 'narrative', label: 'Narrative' },
  { id: 'storytelling', label: 'Storytelling' },
  { id: 'deep', label: 'Deep' },
  { id: 'emotional', label: 'Emotional' },
  { id: 'cheerful', label: 'Cheerful' },
  { id: 'serious', label: 'Serious' },
];

const PREBUILT_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as const;

export default function App() {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState(LANGUAGES[0].id);
  const [voiceType, setVoiceType] = useState('male');
  const [style, setStyle] = useState('narrative');
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [targetDuration, setTargetDuration] = useState<number | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number>(0);
  const [customAttributes, setCustomAttributes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = speed;
    }
  }, [volume, speed, audioUrl]);

  useEffect(() => {
    if (text.trim()) {
      const words = text.trim().split(/\s+/).length;
      const baseDuration = (words / 150) * 60; // 150 wpm base
      setEstimatedDuration(baseDuration / speed);
    } else {
      setEstimatedDuration(0);
    }
  }, [text, speed]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter some text to synthesize.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-2.5-flash-preview-tts";

      // Construct the prompt with natural language instructions for voice
      const langName = LANGUAGES.find(l => l.id === language)?.name || 'English';
      const pitchDesc = pitch === 0 ? 'natural' : pitch > 0 ? 'higher' : 'lower';
      
      // Calculate effective speed if target duration is set
      let effectiveSpeed = speed;
      if (targetDuration && text.trim()) {
        const words = text.trim().split(/\s+/).length;
        const baseDuration = (words / 150) * 60; // 150 wpm base
        effectiveSpeed = Math.max(0.5, Math.min(2.0, baseDuration / targetDuration));
      }

      const speedDesc = effectiveSpeed === 1.0 ? 'normal' : effectiveSpeed > 1.0 ? 'faster' : 'slower';
      const durationNote = targetDuration ? `The target duration for this speech is approximately ${targetDuration} seconds.` : '';
      
      const prompt = `Synthesize the following text in ${langName}. 
Voice instructions: Use a ${voiceType === 'male' ? 'distinctly male' : voiceType} voice with a ${style} tone. The pitch should be ${pitchDesc} than normal (level ${Math.abs(pitch)} on a scale of 0-10). The speaking rate should be ${speedDesc} than normal (at ${effectiveSpeed.toFixed(2)}x speed). ${durationNote} ${customAttributes ? `Additional voice attributes: ${customAttributes}.` : ''}
Text to speak: "${text}"`;

      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              // Map voiceType to appropriate prebuilt voice to help the model
              prebuiltVoiceConfig: { 
                voiceName: voiceType === 'male' || voiceType === 'mature' ? 'Charon' : 
                          voiceType === 'child-like' || voiceType === 'youthful' ? 'Puck' : 'Zephyr' 
              },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const audioBlob = base64ToBlob(base64Audio);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Auto-play after generation
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
          }
        }, 100);
      } else {
        throw new Error('No audio data received from the model.');
      }
    } catch (err: any) {
      console.error('TTS Error:', err);
      setError(err.message || 'Failed to generate audio. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const base64ToBlob = (base64: string) => {
    const binStr = atob(base64);
    const len = binStr.length;
    const pcmData = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      pcmData[i] = binStr.charCodeAt(i);
    }
    
    // Gemini TTS returns raw PCM 16-bit mono at 24kHz
    // We need to add a WAV header for the browser to play it
    const wavHeader = createWavHeader(len, 24000);
    const wavData = new Uint8Array(wavHeader.length + pcmData.length);
    wavData.set(wavHeader);
    wavData.set(pcmData, wavHeader.length);
    
    return new Blob([wavData], { type: 'audio/wav' });
  };

  const createWavHeader = (dataLength: number, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    return new Uint8Array(header);
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `vani-tts-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const reset = () => {
    setText('');
    setAudioUrl(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <Mic2 className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">my voice generator</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
              <Sparkles className="w-3.5 h-3.5" />
              Gemini 2.5 Flash TTS
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-8 space-y-8">
            {/* Input Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  Text Input
                  <span className="text-[10px] font-normal lowercase bg-gray-100 px-2 py-0.5 rounded-full">
                    {text.length} / {MAX_TOKENS} tokens (approx)
                  </span>
                </label>
                <button 
                  onClick={reset}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear
                </button>
              </div>
              <div className="relative group">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_TOKENS))}
                  placeholder="Enter the text you want to convert to speech..."
                  className="w-full h-64 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none text-lg leading-relaxed placeholder:text-gray-300"
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  {estimatedDuration > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      Est. {estimatedDuration.toFixed(1)}s
                    </motion.div>
                  )}
                  {text.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100"
                    >
                      {Math.ceil(text.length / 4)} tokens
                    </motion.div>
                  )}
                </div>
              </div>
            </section>

            {/* Action Section */}
            <section className="flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !text.trim()}
                className={cn(
                  "w-full sm:w-auto px-8 py-4 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-200/50",
                  isGenerating || !text.trim() 
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none" 
                    : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]"
                )}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Synthesizing...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-5 h-5" />
                    Generate Audio
                  </>
                )}
              </button>

              {audioUrl && !isGenerating && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 w-full sm:w-auto"
                >
                  <button
                    onClick={togglePlay}
                    className="flex-1 sm:flex-none px-6 py-4 bg-white border border-gray-200 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    {isPlaying ? 'Pause' : 'Listen'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all shadow-sm group"
                    title="Download Audio"
                  >
                    <Download className="w-5 h-5 text-gray-600 group-hover:text-emerald-600" />
                  </button>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-2xl shadow-sm">
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-gray-400" />
                    ) : volume < 0.5 ? (
                      <Volume1 className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-gray-400" />
                    )}
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>
                </motion.div>
              )}
            </section>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hidden Audio Element */}
            <audio 
              ref={audioRef} 
              src={audioUrl || undefined} 
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
          </div>

          {/* Right Column: Settings */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm space-y-8">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <Settings2 className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-gray-900">Voice Configuration</h2>
              </div>

              {/* Language Selector */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Languages className="w-3.5 h-3.5" />
                  Language
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => setLanguage(lang.id)}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                        language === lang.id
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900 ring-1 ring-emerald-200"
                          : "bg-white border-gray-100 text-gray-600 hover:border-gray-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{lang.flag}</span>
                        <span className="font-medium">{lang.name}</span>
                      </div>
                      {language === lang.id && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Type */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Voice Type</label>
                <div className="flex flex-wrap gap-2">
                  {VOICE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setVoiceType(type.id)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                        voiceType === type.id
                          ? "bg-gray-900 border-gray-900 text-white shadow-md shadow-gray-200"
                          : "bg-white border-gray-100 text-gray-600 hover:border-gray-200"
                      )}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speaking Style */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Speaking Style</label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all border",
                        style === s.id
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100"
                          : "bg-white border-gray-100 text-gray-600 hover:border-gray-200"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pitch Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Voice Pitch</label>
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {pitch === 0 ? 'Natural' : pitch > 0 ? `+${pitch}` : pitch}
                  </span>
                </div>
                <div className="px-2 py-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    value={pitch}
                    onChange={(e) => setPitch(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Deep</span>
                    <span className="text-[9px] text-gray-400 uppercase font-bold">High</span>
                  </div>
                </div>
              </div>

              {/* Speed Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Speaking Speed</label>
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {speed === 1.0 ? 'Normal' : `${speed}x`}
                  </span>
                </div>
                <div className="px-2 py-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(e) => {
                      setSpeed(parseFloat(e.target.value));
                      setTargetDuration(null); // Clear target duration when speed is manually adjusted
                    }}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Slow</span>
                    <span className="text-[9px] text-gray-400 uppercase font-bold">Fast</span>
                  </div>
                </div>
              </div>

              {/* Duration Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    Target Duration
                    <span className="text-[10px] font-normal lowercase bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                  </label>
                  {targetDuration && (
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {targetDuration}s
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={targetDuration || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      setTargetDuration(val);
                    }}
                    placeholder="Set target seconds..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                  {targetDuration && (
                    <button 
                      onClick={() => setTargetDuration(null)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 italic">
                  Overrides speed to fit text into specified time.
                </p>
              </div>

              {/* Custom Attributes */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  Custom Attributes
                  <Info className="w-3 h-3 text-gray-300" />
                </label>
                <input
                  type="text"
                  value={customAttributes}
                  onChange={(e) => setCustomAttributes(e.target.value)}
                  placeholder="e.g. raspy, fast-paced, whispery"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-emerald-900 text-emerald-50 rounded-3xl p-8 shadow-xl shadow-emerald-900/10 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-300" />
                Pro Tip
              </h3>
              <p className="text-sm text-emerald-100/80 leading-relaxed">
                You can use natural language to describe the voice. Try adding "with a slight accent" or "sounding very excited" in the custom attributes field.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-black/5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Mic2 className="w-4 h-4" />
            <span>my voice generator &copy; 2026</span>
          </div>
          <div className="flex items-center gap-6 text-xs font-medium text-gray-400 uppercase tracking-widest">
            <a href="#" className="hover:text-emerald-600 transition-colors">Documentation</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">API Status</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
