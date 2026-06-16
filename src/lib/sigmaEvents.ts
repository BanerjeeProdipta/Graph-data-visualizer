// Small compatibility helpers for attaching/removing camera/event listeners
export function safeOn(
  emitter: any,
  event: string,
  cb: (...args: any[]) => void,
) {
  if (!emitter) return;
  if (typeof emitter.on === "function") emitter.on(event, cb);
  else if (typeof emitter.addEventListener === "function")
    emitter.addEventListener(event as any, cb as EventListener);
}

export function safeOff(
  emitter: any,
  event: string,
  cb: (...args: any[]) => void,
) {
  if (!emitter) return;
  if (typeof emitter.off === "function") emitter.off(event, cb);
  else if (typeof emitter.removeListener === "function")
    emitter.removeListener(event, cb);
  else if (typeof emitter.removeEventListener === "function")
    emitter.removeEventListener(event as any, cb as EventListener);
}
