const PREFIX = "[HFGS]";

/** True in development builds (`npm run dev`), set by webpack's DefinePlugin. */
export function isDevelopment(): boolean {
  return typeof __HFGS_DEV__ !== "undefined" && __HFGS_DEV__;
}

export class Logger {
  static debug(message: string, ...opts: unknown[]) {
    if (isDevelopment()) {
      console.log(`%c${PREFIX} DEBUG: ${message}`, "color: #87CEEB", ...opts);
    }
  }
  static log(message: string, ...opts: unknown[]) {
    console.log(`${PREFIX} ${message}`, ...opts);
  }
  static error(message: string, ...opts: unknown[]) {
    console.error(`${PREFIX} ${message}`, ...opts);
  }
  static warn(message: string, ...opts: unknown[]) {
    console.warn(`${PREFIX} ${message}`, ...opts);
  }
}
