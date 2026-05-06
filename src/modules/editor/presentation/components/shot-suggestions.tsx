"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Camera, X, Loader2, Film, Maximize2, Move3d, Target, Sparkles } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"
import type { ShotSuggestion } from "@/modules/editor/presentation/hooks/use-shot-suggestions"

interface ShotSuggestionsProps {
  shots: ShotSuggestion[]
  isLoading: boolean
  error: string | null
  onClose: () => void
  sceneTitle?: string
}

const shotTypeIcons: Record<string, React.ReactNode> = {
  "Wide": <Maximize2 className="w-4 h-4" />,
  "Medium": <Camera className="w-4 h-4" />,
  "Close-Up": <Target className="w-4 h-4" />,
  "Extreme Close-Up": <Target className="w-4 h-4" />,
}

export function ShotSuggestions({ 
  shots, 
  isLoading, 
  error, 
  onClose,
  sceneTitle = "Scene"
}: ShotSuggestionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] overflow-hidden"
      >
        <Card className="border-white/10 bg-card/95 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cinematic-orange/20 flex items-center justify-center">
                <Film className="w-5 h-5 text-cinematic-orange" />
              </div>
              <div>
                <CardTitle className="text-xl text-white">Cinematic Shot List</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {sceneTitle} • {shots.length} shots
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-10 h-10 text-cinematic-orange animate-spin mb-4" />
                <p className="text-muted-foreground">Analyzing scene and generating shots...</p>
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Our AI director is studying the screenplay
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-red-400 font-medium">{error}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please try again or check your scene text
                </p>
              </div>
            ) : shots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Camera className="w-10 h-10 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No shots generated yet</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto p-6 space-y-4">
                <AnimatePresence>
                  {shots.map((shot, index) => (
                    <motion.div
                      key={shot.shotNumber}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="group relative"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cinematic-orange to-cinematic-orange/30 rounded-l" />
                      
                      <div className="pl-6 py-4 border border-white/10 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                        {/* Shot Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-cinematic-orange/20 flex items-center justify-center text-cinematic-orange font-bold text-sm">
                              {shot.shotNumber}
                            </span>
                            <div>
                              <h4 className="font-semibold text-white flex items-center gap-2">
                                {shotTypeIcons[shot.shotType] || <Camera className="w-4 h-4" />}
                                {shot.shotType}
                              </h4>
                              <p className="text-xs text-muted-foreground">{shot.description}</p>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-cinematic-blue/10 text-cinematic-blue">
                            {shot.cameraAngle}
                          </span>
                        </div>

                        {/* Shot Details Grid */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2">
                            <Maximize2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-muted-foreground text-xs block">Composition</span>
                              <span className="text-white">{shot.composition}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <Move3d className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-muted-foreground text-xs block">Movement</span>
                              <span className="text-white">{shot.cameraMovement}</span>
                            </div>
                          </div>
                        </div>

                        {/* Purpose */}
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-cinematic-orange mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-muted-foreground text-xs block">Purpose</span>
                              <span className="text-white/90 text-sm">{shot.purpose}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
