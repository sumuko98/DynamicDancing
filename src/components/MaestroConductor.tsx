import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { useHandTracking } from '../hooks/useHandTracking';
import { Music, Volume2, Gauge, Play, Pause, Info, Wind } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// High-quality orchestral track (Beethoven's 5th - Public Domain)
const ORCHESTRA_URL = 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Beethoven_Symphony_No._5_-_I._Allegro_con_brio.ogg';

const MaestroConductor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioError, setIsAudioError] = useState(false);
  const [tempo, setTempo] = useState(1.0);
  const [volume, setVolume] = useState(0.5);
  const [isBassBoosted, setIsBassBoosted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  // Tracking state for "energy" (tempo)
  const lastRightHandY = useRef<number | null>(null);
  const lastTimestamp = useRef<number>(Date.now());
  const velocityBuffer = useRef<number[]>([]);

  // Initialize Web Audio
  const initAudioContext = async () => {
    if (!audioContextRef.current && audioRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        const source = ctx.createMediaElementSource(audioRef.current);

        // Create Low Shelf Filter for Bass
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowshelf';
        filter.frequency.value = 200; // Bass frequencies
        filter.gain.value = 0; // Initial gain

        source.connect(filter);
        filter.connect(ctx.destination);

        audioContextRef.current = ctx;
        bassFilterRef.current = filter;
      } catch (err) {
        console.error('Failed to initialize AudioContext:', err);
        setIsAudioError(true);
      }
    }

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Background
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw mirrored video with a "Concert Hall" tint
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.4;
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    let rightHandFist = false;

    // 2. Process Hands
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      results.multiHandLandmarks.forEach((landmarks, index) => {
        const label = results.multiHandedness[index].label;
        const isRightHand = label === 'Left';
        const isLeftHand = label === 'Right';

        // --- FIST DETECTION (Right Hand) ---
        if (isRightHand) {
          const wrist = landmarks[0];
          const fingerTips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
          const knuckles = [landmarks[5], landmarks[9], landmarks[13], landmarks[17]];

          let curledFingers = 0;
          for (let i = 0; i < 4; i++) {
            const tipDist = Math.sqrt(Math.pow(fingerTips[i].x - wrist.x, 2) + Math.pow(fingerTips[i].y - wrist.y, 2));
            const knuckleDist = Math.sqrt(Math.pow(knuckles[i].x - wrist.x, 2) + Math.pow(knuckles[i].y - wrist.y, 2));
            if (tipDist < knuckleDist) curledFingers++;
          }

          if (curledFingers >= 3) {
            rightHandFist = true;
          }
        }

        // Draw Hand Visuals
        const color = isRightHand ? (rightHandFist ? '#ef4444' : '#f59e0b') : '#3b82f6';
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: 'rgba(255,255,255,0.2)', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: color, lineWidth: 1, radius: 4 });

        const wrist = landmarks[0];
        const now = Date.now();
        const dt = (now - lastTimestamp.current) / 1000;

        // --- RIGHT HAND: TEMPO ---
        if (isRightHand) {
          if (lastRightHandY.current !== null && dt > 0) {
            const dy = Math.abs(wrist.y - lastRightHandY.current);
            const velocity = dy / dt;

            velocityBuffer.current.push(velocity);
            if (velocityBuffer.current.length > 10) velocityBuffer.current.shift();

            const avgVelocity = velocityBuffer.current.reduce((a, b) => a + b, 0) / velocityBuffer.current.length;
            const newTempo = Math.max(0.5, Math.min(2.0, 0.5 + avgVelocity * 1.5));
            setTempo(prev => prev * 0.9 + newTempo * 0.1);
          }
          lastRightHandY.current = wrist.y;
          lastTimestamp.current = now;
        }

        // --- LEFT HAND: DYNAMICS ---
        if (isLeftHand) {
          const newVolume = Math.max(0, Math.min(1, 1 - wrist.y));
          setVolume(prev => prev * 0.8 + newVolume * 0.2);
        }
      });
    } else {
      setTempo(prev => Math.max(0.5, prev * 0.99));
      setVolume(prev => Math.max(0.1, prev * 0.95));
    }

    setIsBassBoosted(rightHandFist);
  }, []);

  const { videoRef } = useHandTracking({ onResults });

  // Sync Audio Effects
  useEffect(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.playbackRate = tempo;
      audioRef.current.volume = volume;

      if (bassFilterRef.current) {
        const targetGain = isBassBoosted ? 15 : 0;
        bassFilterRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current!.currentTime, 0.1);
      }
    }
  }, [tempo, volume, isPlaying, isBassBoosted]);

  const togglePlay = () => {
    initAudioContext();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] overflow-hidden flex flex-col items-center justify-center font-sans text-zinc-100">
      <video ref={videoRef} className="hidden" playsInline />
      <audio
        ref={audioRef}
        src={ORCHESTRA_URL}
        loop
        crossOrigin="anonymous"
        onError={() => setIsAudioError(true)}
      />

      {/* Concert Hall Atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black pointer-events-none" />

      {/* Visualizer Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <motion.div
          animate={{ scale: 1 + volume * 0.5, opacity: 0.1 + volume * 0.4 }}
          className="w-[600px] h-[600px] border-2 border-amber-500 rounded-full"
        />
        <motion.div
          animate={{ scale: 0.8 + tempo * 0.2, opacity: 0.05 + tempo * 0.1 }}
          className="absolute w-[800px] h-[800px] border border-blue-500 rounded-full"
        />
      </div>

      {/* Main Stage */}
      <div className="relative w-full max-w-6xl aspect-video bg-zinc-900/30 rounded-3xl border border-white/5 shadow-3xl overflow-hidden backdrop-blur-sm">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-cover"
        />

        {/* HUD: Maestro Stats */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-start">
          <div className="flex flex-col gap-4">
            {isAudioError && (
              <div className="bg-red-500/20 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl flex items-center gap-4 min-w-[200px]">
                <div className="p-3 bg-red-500/20 rounded-xl">
                  <Info className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-red-500 tracking-widest">Audio Error</p>
                  <p className="text-xs text-red-200">Failed to load orchestra</p>
                </div>
              </div>
            )}
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4 min-w-[200px]">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <Gauge className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Tempo</p>
                <p className="text-2xl font-mono font-bold">{(tempo * 120).toFixed(0)} <span className="text-xs text-zinc-600">BPM</span></p>
              </div>
            </div>
            <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4 min-w-[200px]">
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Volume2 className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Dynamics</p>
                <div className="w-24 h-2 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                  <motion.div
                    animate={{ width: `${volume * 100}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {isBassBoosted && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-red-500/20 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl flex items-center gap-4 min-w-[200px]"
                >
                  <div className="p-3 bg-red-500/20 rounded-xl">
                    <Music className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-red-500 tracking-widest">Bass Boost</p>
                    <p className="text-xs font-bold text-red-200">ACTIVE</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={togglePlay}
            className="group relative w-20 h-20 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
            <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping group-hover:hidden" />
          </button>
        </div>

        {/* Maestro Guide */}
        <div className="absolute bottom-8 left-8 flex gap-6">
          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
            <div className="w-2 h-2 bg-amber-500 rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Right: Tempo</span>
          </div>
          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Right Fist: Bass</span>
          </div>
          <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Left: Dynamics</span>
          </div>
        </div>
      </div>

      {/* Intro Overlay */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-8"
          >
            <div className="max-w-xl text-center">
              <div className="inline-flex p-4 bg-amber-500/10 rounded-3xl mb-8">
                <Music className="w-12 h-12 text-amber-500" />
              </div>
              <h1 className="text-5xl font-bold mb-4 tracking-tighter italic serif">Maestro Vision</h1>
              <p className="text-zinc-400 text-lg mb-12 leading-relaxed">
                Step onto the podium. Your hands are the baton.
                Control the pulse, the intensity, and the depth of the orchestra.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-12 text-left">
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <Gauge className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">The Pulse</h3>
                  </div>
                  <p className="text-xs text-zinc-500">Move your <span className="text-amber-500 font-bold">Right Hand</span> vertically to set the tempo.</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3 mb-3">
                    <Volume2 className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">The Soul</h3>
                  </div>
                  <p className="text-xs text-zinc-500">Raise your <span className="text-blue-500 font-bold">Left Hand</span> to swell the volume.</p>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 col-span-2">
                  <div className="flex items-center gap-3 mb-3">
                    <Music className="w-5 h-5 text-red-500" />
                    <h3 className="font-bold uppercase text-xs tracking-widest">The Foundation</h3>
                  </div>
                  <p className="text-xs text-zinc-500">Make a <span className="text-red-500 font-bold">Fist</span> with your right hand to boost the <span className="text-red-500 font-bold">Basses</span> and add power to the performance.</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowIntro(false);
                  togglePlay();
                }}
                className="px-12 py-4 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors flex items-center gap-3 mx-auto"
              >
                <Play className="w-5 h-5 fill-current" />
                Begin Performance
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Branding */}
      <div className="mt-8 flex items-center gap-2 text-zinc-600">
        <Wind className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Symphony AI Engine</span>
      </div>
    </div>
  );
};

export default MaestroConductor;
