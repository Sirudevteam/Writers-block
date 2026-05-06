"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Loader2, Film, Users, MapPin, Heart, FileText, Wand2 } from "lucide-react"
import { Button } from "@/ui/components/button"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/select"

const genres = [
  { value: "action", label: "Action", icon: "💥" },
  { value: "adventure", label: "Adventure", icon: "🗺️" },
  { value: "comedy", label: "Comedy", icon: "😄" },
  { value: "drama", label: "Drama", icon: "🎭" },
  { value: "horror", label: "Horror", icon: "👻" },
  { value: "romance", label: "Romance", icon: "💕" },
  { value: "scifi", label: "Sci-Fi", icon: "🚀" },
  { value: "thriller", label: "Thriller", icon: "🔪" },
  { value: "western", label: "Western", icon: "🤠" },
  { value: "noir", label: "Noir", icon: "🌃" },
]

const moods = [
  { value: "tense", label: "Tense", color: "text-red-400" },
  { value: "romantic", label: "Romantic", color: "text-pink-400" },
  { value: "suspenseful", label: "Suspenseful", color: "text-purple-400" },
  { value: "lighthearted", label: "Lighthearted", color: "text-yellow-400" },
  { value: "dark", label: "Dark", color: "text-gray-400" },
  { value: "hopeful", label: "Hopeful", color: "text-green-400" },
  { value: "melancholic", label: "Melancholic", color: "text-blue-400" },
  { value: "energetic", label: "Energetic", color: "text-orange-400" },
  { value: "mysterious", label: "Mysterious", color: "text-indigo-400" },
  { value: "comedic", label: "Comedic", color: "text-amber-400" },
]

interface SceneInputFormProps {
  onGenerate: (config: {
    genre: string
    characters: string
    location: string
    mood: string
    sceneDescription: string
  }) => void
  isGenerating: boolean
}

export function SceneInputForm({ onGenerate, isGenerating }: SceneInputFormProps) {
  const [genre, setGenre] = useState("")
  const [characters, setCharacters] = useState("")
  const [location, setLocation] = useState("")
  const [mood, setMood] = useState("")
  const [sceneDescription, setSceneDescription] = useState("")

  const handleGenerate = () => {
    if (!genre || !characters || !location || !sceneDescription) return

    onGenerate({
      genre,
      characters,
      location,
      mood: mood || "dramatic",
      sceneDescription,
    })
  }

  const isFormValid = genre && characters && location && sceneDescription
  const progress = [genre, characters, location, sceneDescription].filter(Boolean).length
  const progressPercent = (progress / 4) * 100

  return (
    <div className="space-y-5">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Form completion</span>
          <span className="text-cinematic-orange font-medium">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cinematic-orange to-amber-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Genre */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-cinematic-orange" />
          Genre
          <span className="text-cinematic-orange">*</span>
        </label>
        <Select value={genre} onValueChange={setGenre} disabled={isGenerating}>
          <SelectTrigger className="bg-white/[0.03] border-white/10 hover:border-white/20 focus:border-cinematic-orange/50 h-10">
            <SelectValue placeholder="Select a genre" />
          </SelectTrigger>
          <SelectContent className="bg-[#141414] border-white/10">
            {genres.map((g) => (
              <SelectItem key={g.value} value={g.value} className="focus:bg-white/5">
                <span className="flex items-center gap-2">
                  <span>{g.icon}</span>
                  <span>{g.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Characters */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-cinematic-orange" />
          Characters
          <span className="text-cinematic-orange">*</span>
        </label>
        <Input
          placeholder="e.g., Arjun (protagonist), Meera (friend)"
          value={characters}
          onChange={(e) => setCharacters(e.target.value)}
          disabled={isGenerating}
          className="bg-white/[0.03] border-white/10 hover:border-white/20 focus:border-cinematic-orange/50 placeholder:text-white/30 h-10"
        />
        <p className="text-[10px] text-muted-foreground">
          Add character names with brief descriptions in parentheses
        </p>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-cinematic-orange" />
          Location
          <span className="text-cinematic-orange">*</span>
        </label>
        <Input
          placeholder="e.g., Chennai coffee shop, Mumbai apartment"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={isGenerating}
          className="bg-white/[0.03] border-white/10 hover:border-white/20 focus:border-cinematic-orange/50 placeholder:text-white/30 h-10"
        />
      </div>

      {/* Mood */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-cinematic-orange" />
          Mood
          <span className="text-white/40 text-[10px] font-normal">(optional)</span>
        </label>
        <Select value={mood} onValueChange={setMood} disabled={isGenerating}>
          <SelectTrigger className="bg-white/[0.03] border-white/10 hover:border-white/20 focus:border-cinematic-orange/50 h-10">
            <SelectValue placeholder="Select mood" />
          </SelectTrigger>
          <SelectContent className="bg-[#141414] border-white/10">
            {moods.map((m) => (
              <SelectItem key={m.value} value={m.value} className="focus:bg-white/5">
                <span className={`flex items-center gap-2 ${m.color}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {m.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scene Description */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/80 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-cinematic-orange" />
          Scene Description
          <span className="text-cinematic-orange">*</span>
        </label>
        <Textarea
          placeholder="Describe what happens in this scene. Be specific about character actions, dialogue tone, and key moments..."
          value={sceneDescription}
          onChange={(e) => setSceneDescription(e.target.value)}
          disabled={isGenerating}
          className="bg-white/[0.03] border-white/10 hover:border-white/20 focus:border-cinematic-orange/50 placeholder:text-white/30 min-h-[100px] resize-none"
        />
        <p className="text-[10px] text-muted-foreground">
          Tip: The more details you provide, the better the generated scene
        </p>
      </div>

      {/* Generate Button */}
      <motion.div
        whileHover={isFormValid && !isGenerating ? { scale: 1.01 } : {}}
        whileTap={isFormValid && !isGenerating ? { scale: 0.99 } : {}}
        className="pt-2"
      >
        <Button
          onClick={handleGenerate}
          disabled={!isFormValid || isGenerating}
          className="w-full bg-cinematic-orange text-black font-semibold hover:bg-cinematic-orange/90 h-11 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              <span>Generating Scene...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              <span>Generate Scene</span>
            </>
          )}
        </Button>
      </motion.div>

      {/* Helper Text */}
      {!isFormValid && !isGenerating && (
        <p className="text-[10px] text-center text-muted-foreground">
          Fill all required fields to generate your scene
        </p>
      )}
    </div>
  )
}
