import React, { useRef, useState, useCallback } from 'react';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { useHandTracking } from '../hooks/useHandTracking';
import { MousePointer2, Pencil, Trash2, Camera as CameraIcon, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const VisionLab: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#10b981'); // Emerald 500
  const [showSettings, setShowSettings] = useState(false);

  const clearCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!canvas || !drawingCanvas) return;

    const ctx = canvas.getContext('2d');
    const dCtx = drawingCanvas.getContext('2d');
    if (!ctx || !dCtx) return;

    // 1. Draw Video Background
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        // 2. Draw Hand Skeleton
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: 'rgba(255,255,255,0.5)', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: brushColor, lineWidth: 1, radius: 2 });

        // 3. Gesture Logic: Pinch Detection
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const distance = Math.sqrt(
          Math.pow(thumbTip.x - indexTip.x, 2) +
          Math.pow(thumbTip.y - indexTip.y, 2),
        );

        const isPinching = distance < 0.05;
        const currentX = (1 - indexTip.x) * canvas.width;
        const currentY = indexTip.y * canvas.height;

        if (isPinching) {
          setIsDrawing(true);
          dCtx.lineWidth = 8;
          dCtx.lineCap = 'round';
          dCtx.strokeStyle = brushColor;

          dCtx.beginPath();
          dCtx.arc(currentX, currentY, 4, 0, Math.PI * 2);
          dCtx.fillStyle = brushColor;
          dCtx.fill();
        } else {
          setIsDrawing(false);
        }
      }
    }
  }, [brushColor]);

  const { videoRef } = useHandTracking({ onResults });

  return (
    <div className="relative w-full h-screen bg-zinc-950 overflow-hidden flex flex-col items-center justify-center font-sans text-zinc-100">
      {/* Hidden Video Source */}
      <video ref={videoRef} className="hidden" playsInline />

      {/* Main Viewport */}
      <div className="relative w-full max-w-5xl aspect-video bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-cover"
        />
        <canvas
          ref={drawingCanvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* HUD Overlay */}
        <div className="absolute top-6 left-6 flex items-center gap-4">
          <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isDrawing ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
            <span className="text-xs font-bold tracking-widest uppercase">
              {isDrawing ? 'Gesture Active' : 'Scanning...'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 hover:bg-white/10 rounded-xl transition-colors"
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex gap-2 px-2">
            {['#10b981', '#3b82f6', '#f59e0b', '#ef4444'].map(color => (
              <button
                key={color}
                onClick={() => setBrushColor(color)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${brushColor === color ? 'scale-110 border-white' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={clearCanvas}
            className="p-3 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 flex gap-12 text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-900 rounded-lg border border-white/5">
            <MousePointer2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-tighter">Navigation</p>
            <p className="text-[10px]">Move hand to track</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-900 rounded-lg border border-white/5">
            <Pencil className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-tighter">Interaction</p>
            <p className="text-[10px]">Pinch fingers to trigger</p>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-zinc-900 border border-white/10 p-6 rounded-3xl shadow-3xl z-50"
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <CameraIcon className="w-5 h-5 text-emerald-500" />
              Vision Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block">Detection Confidence</label>
                <input type="range" className="w-full accent-emerald-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-2 block">Smoothing</label>
                <input type="range" className="w-full accent-emerald-500" />
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors"
            >
              Apply Changes
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VisionLab;
