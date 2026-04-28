"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
};

/**
 * クリックで全画面オーバーレイ拡大表示する画像。
 * Esc / 背景クリック / × で閉じる。エントリーフォームの banner と注意書き画像で共用。
 */
export function ZoomableImage({ src, alt, width, height, className }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in" aria-label={`${alt} を拡大表示`}>
        <Image src={src} alt={alt} className={className} width={width} height={height} unoptimized />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} の拡大表示`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute top-4 right-4 text-white text-2xl font-bold w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            aria-label="閉じる"
          >
            ×
          </button>
          <Image
            src={src}
            alt={alt}
            width={width * 2}
            height={height * 2}
            unoptimized
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
