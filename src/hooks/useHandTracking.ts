import { useEffect, useRef, RefObject } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

interface UseHandTrackingOptions {
  onResults: (results: Results) => void;
}

interface UseHandTrackingReturn {
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function useHandTracking({ onResults }: UseHandTrackingOptions): UseHandTrackingReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  // Store the latest callback in a ref so the MediaPipe setup effect runs
  // only once, regardless of whether the caller recreates the callback.
  const onResultsRef = useRef<(results: Results) => void>(onResults);
  onResultsRef.current = onResults;

  useEffect(() => {
    if (!videoRef.current) return;

    const hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => onResultsRef.current(results));
    handsRef.current = hands;

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current });
        }
      },
      width: 1280,
      height: 720,
    });

    camera.start();
    cameraRef.current = camera;

    return () => {
      cameraRef.current?.stop();
      handsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty – camera/hands are set up once per mount

  return { videoRef };
}
