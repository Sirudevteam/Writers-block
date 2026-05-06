type LogContext = Record<string, unknown>

function write(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: LogContext
) {
  if (context && Object.keys(context).length > 0) {
    console[level](message, context)
    return
  }
  console[level](message)
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== "production") {
      write("debug", message, context)
    }
  },
  info(message: string, context?: LogContext) {
    write("info", message, context)
  },
  warn(message: string, context?: LogContext) {
    write("warn", message, context)
  },
  error(message: string, context?: LogContext) {
    write("error", message, context)
  },
}
