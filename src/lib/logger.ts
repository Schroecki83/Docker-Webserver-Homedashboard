type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, details?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  console[level](JSON.stringify(payload));
}