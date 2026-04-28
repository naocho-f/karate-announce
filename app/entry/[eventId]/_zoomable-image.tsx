"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SCALE = 2.5;
const PAN_THRESHOLD_PX = 5;

/**
 * クリックで全画面オーバーレイ拡大表示する画像。オーバーレイ内では 2 本指ピンチ /
 * ダブルタップ / パン (ズーム中) で更にズーム可能。Esc / 背景クリック / × で閉じる。
 */
export function ZoomableImage({ src, alt, width, height, className }: Props) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const gesture = useRef({
    pinchStartDist: 0,
    pinchStartScale: 1,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
    panning: false,
    pinching: false,
    lastTapAt: 0,
  });

  useEffect(() => {
    stateRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  const close = useCallback(() => {
    setOpen(false);
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;

    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      const s = stateRef.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        gesture.current.pinching = true;
        gesture.current.panning = false;
        gesture.current.pinchStartDist = dist(e.touches[0], e.touches[1]);
        gesture.current.pinchStartScale = s.scale;
      } else if (e.touches.length === 1) {
        gesture.current.panStartX = e.touches[0].clientX;
        gesture.current.panStartY = e.touches[0].clientY;
        gesture.current.panOriginX = s.tx;
        gesture.current.panOriginY = s.ty;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current.pinching && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const ratio = d / gesture.current.pinchStartDist;
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, gesture.current.pinchStartScale * ratio));
        setScale(next);
      } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - gesture.current.panStartX;
        const dy = e.touches[0].clientY - gesture.current.panStartY;
        if (!gesture.current.panning && Math.hypot(dx, dy) > PAN_THRESHOLD_PX && stateRef.current.scale > 1) {
          gesture.current.panning = true;
        }
        if (gesture.current.panning) {
          e.preventDefault();
          setTx(gesture.current.panOriginX + dx);
          setTy(gesture.current.panOriginY + dy);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        const wasGesturing = gesture.current.pinching || gesture.current.panning;
        gesture.current.pinching = false;
        gesture.current.panning = false;
        if (!wasGesturing) {
          const now = Date.now();
          if (now - gesture.current.lastTapAt < DOUBLE_TAP_MS) {
            if (stateRef.current.scale > 1) {
              setScale(1);
              setTx(0);
              setTy(0);
            } else {
              setScale(DOUBLE_TAP_SCALE);
            }
            gesture.current.lastTapAt = 0;
          } else {
            gesture.current.lastTapAt = now;
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.005;
      setScale((s) => {
        const next = s + delta * s;
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in" aria-label={`${alt} を拡大表示`}>
        <Image src={src} alt={alt} className={className} width={width} height={height} unoptimized />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 animate-fade-in overflow-hidden"
          onClick={() => close()}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} の拡大表示`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="absolute top-4 right-4 text-white text-2xl font-bold w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center z-10"
            aria-label="閉じる"
          >
            ×
          </button>
          <div
            ref={containerRef}
            className="touch-none select-none"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={src}
              alt={alt}
              width={width * 2}
              height={height * 2}
              unoptimized
              className="max-w-[90vw] max-h-[85vh] w-auto h-auto object-contain pointer-events-none"
              draggable={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
