// Coalesce scroll, resize and visibility changes into one frame. No idle polling.
export function createStoneFrameScheduler({ request, cancel, draw, canDraw }) {
  let frame = 0;
  return {
    schedule() {
      if (frame || !canDraw()) return;
      frame = request((time) => { frame = 0; if (canDraw()) draw(time); });
    },
    stop() { if (frame) cancel(frame); frame = 0; },
    pending() { return !!frame; },
  };
}
