"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Film, Sparkles } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/components/card"

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (title: string, description: string) => void
}

export function CreateProjectModal({ isOpen, onClose, onCreate }: CreateProjectModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    await onCreate(title, description)
    setIsSubmitting(false)
    setTitle("")
    setDescription("")
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
          >
            <Card
              className="w-full max-h-[min(90dvh,36rem)] max-w-md overflow-y-auto rounded-t-2xl rounded-b-none border-white/10 bg-card/95 backdrop-blur-xl sm:rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cinematic-orange/20">
                    <Film className="h-5 w-5 text-cinematic-orange" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg text-white sm:text-xl">Create new project</CardTitle>
                    <p className="text-xs text-muted-foreground">Start a new screenplay</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close"
                  className="h-11 w-11 shrink-0 text-muted-foreground hover:text-white sm:h-10 sm:w-10"
                >
                  <X className="h-5 w-5" />
                </Button>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Project Title <span className="text-red-400">*</span>
                    </label>
                    <Input
                      placeholder="Enter project title..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-background/50 border-white/10 text-white"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                      Description <span className="text-muted-foreground">(Optional)</span>
                    </label>
                    <Textarea
                      placeholder="Brief description of your project..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-background/50 border-white/10 text-white min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onClose}
                      className="h-11 min-h-[44px] flex-1 border-white/10 hover:bg-white/5 sm:h-10 sm:min-h-0"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!title.trim() || isSubmitting}
                      className="h-11 min-h-[44px] flex-1 bg-cinematic-orange text-black hover:bg-cinematic-orange/90 disabled:opacity-50 sm:h-10 sm:min-h-0"
                    >
                      {isSubmitting ? (
                        <>
                          <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Film className="w-4 h-4 mr-2" />
                          Create Project
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
