"use client"

import { useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Play, X, ExternalLink, Clock, MapPin } from "lucide-react"
import { Card } from "@/ui/components/card"

interface ReferenceSceneCardProps {
  movie: string
  scene: string
  youtubeId: string
  thumbnail: string
  description: string
  matchReason: string
  index: number
  emotion?: string
  situation?: string
  location?: string
}

export function ReferenceSceneCard({
  movie,
  scene,
  youtubeId,
  thumbnail,
  description,
  matchReason,
  index,
  emotion,
  situation,
  location,
}: ReferenceSceneCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [imageError, setImageError] = useState(false)

  const fallbackThumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`

  // Get emotion color
  const getEmotionColor = (emotion?: string) => {
    const colors: Record<string, string> = {
      tense: "bg-red-500/20 text-red-400",
      romantic: "bg-pink-500/20 text-pink-400",
      dramatic: "bg-purple-500/20 text-purple-400",
      action: "bg-orange-500/20 text-orange-400",
      horror: "bg-green-500/20 text-green-400",
      comedy: "bg-yellow-500/20 text-yellow-400",
      thriller: "bg-blue-500/20 text-blue-400",
      melancholic: "bg-slate-500/20 text-slate-400",
      intense: "bg-red-500/20 text-red-400",
    }
    return colors[emotion?.toLowerCase() || ""] || "bg-cinematic-orange/20 text-cinematic-orange"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Card className="bg-white/[0.03] border-white/10 overflow-hidden group hover:border-white/20 transition-colors">
        {/* Video Thumbnail */}
        <div className="relative aspect-video bg-black overflow-hidden">
          <AnimatePresence mode="wait">
            {!isPlaying ? (
              <motion.div
                key="thumbnail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                {/* Thumbnail Image */}
                <Image
                  src={imageError ? fallbackThumbnail : thumbnail}
                  alt={`${movie} - ${scene}`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  onError={() => setImageError(true)}
                />
                
                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                
                {/* Play Button */}
                <button
                  onClick={() => setIsPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center group/play"
                >
                  <div className="w-12 h-12 rounded-full bg-cinematic-orange/90 flex items-center justify-center transform group-hover/play:scale-110 transition-transform shadow-lg shadow-cinematic-orange/30">
                    <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                  </div>
                </button>

                {/* Duration Badge */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white/80 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Scene
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="player"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                  title={`${movie} - ${scene}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
                {/* Close Button */}
                <button
                  onClick={() => setIsPlaying(false)}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/80 rounded-full flex items-center justify-center text-white hover:bg-black transition-colors z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Content */}
        <div className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-cinematic-orange font-medium uppercase tracking-wide truncate">
                {movie}
              </p>
              <h3 className="text-sm font-semibold text-white line-clamp-1 mt-0.5">
                {scene}
              </h3>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${youtubeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>
          
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {emotion && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${getEmotionColor(emotion)}`}>
                {emotion}
              </span>
            )}
            {situation && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                {situation}
              </span>
            )}
            {location && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {location}
              </span>
            )}
          </div>

          {/* Match Reason */}
          <div className="pt-2 border-t border-white/5">
            <p className="text-[10px] leading-relaxed">
              <span className="text-cinematic-blue font-medium">Why this matches:</span>{" "}
              <span className="text-muted-foreground">{matchReason}</span>
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
