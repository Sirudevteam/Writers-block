import Link from "next/link"
import { Button } from "@/ui/components/button"
import { Film, Home } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="max-w-lg w-full text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 bg-gradient-to-r from-cinematic-orange/20 via-cinematic-blue/20 to-cinematic-orange/20 rounded-full blur-3xl opacity-30" />
          <div className="relative">
            <h1 className="text-8xl font-bold bg-gradient-to-r from-cinematic-orange via-cinematic-blue to-cinematic-orange bg-clip-text text-transparent">
              404
            </h1>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-cinematic-orange to-transparent" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">
          Scene Not Found
        </h2>
        
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
          Looks like this scene got cut from the final edit. The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="w-full sm:w-auto bg-cinematic-orange text-black hover:bg-cinematic-orange/90">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
          
          <Button
            asChild
              variant="outline" 
              className="w-full sm:w-auto border-white/20 hover:bg-white/5"
            >
            <Link href="/signup?next=/editor">
              <Film className="w-4 h-4 mr-2" />
              Start Writing
            </Link>
          </Button>
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-sm text-muted-foreground mb-4">
            Looking for something else?
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["/dashboard", "/editor", "/signin"].map((path) => (
              <Link
                key={path}
                href={path}
                className="text-sm text-cinematic-orange hover:text-cinematic-orange/80 transition-colors"
              >
                {path === "/" ? "Home" : path.replace("/", "").charAt(0).toUpperCase() + path.slice(1)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
