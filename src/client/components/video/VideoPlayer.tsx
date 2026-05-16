"use client";

import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { Button } from "@client/components/ui/button";

interface VideoPlayerProps {
  src: string;
  resolution?: string;
}

export function VideoPlayer({ src, resolution }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const is916 = resolution?.startsWith("1080x1920");

  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      void videoRef.current.play();
    }
    setPlaying(!playing);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const fullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${is916 ? "max-w-xs mx-auto" : "w-full"}`}>
      <video
        ref={videoRef}
        src={src}
        className="w-full h-auto"
        onEnded={() => setPlaying(false)}
        onClick={toggle}
        playsInline
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggle}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleMute}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={fullscreen}>
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
