// Shared contract for effect renderers. The caller paints a still immediately;
// `load` may dynamically import its heavy renderer only after this gate opens.
export function motionMode({ intensity, ratio, winner, ready, hidden, reduced, saveData, mobile, cores, memory }) {
  if (intensity === 'off' || !ratio || hidden) return 'paused';
  if (!winner || !ready || reduced || saveData || mobile || (cores <= 4 && memory <= 4)) return 'still';
  return 'animate';
}

export function motionBudget(intensity) {
  return intensity === 'full' ? { maxFps: 60, alphaScale: 1, densityScale: 1 }
    : intensity === 'subtle' ? { maxFps: 30, alphaScale: .7, densityScale: .7 }
    : { maxFps: 0, alphaScale: 0, densityScale: 0 };
}

export function activeAmbient(entries) {
  return entries.filter((entry) => entry.ratio > 0 && entry.intensity !== 'off')
    .sort((a, b) => b.ratio - a.ratio || a.order - b.order)[0]?.id ?? null;
}

export function createMotionCoordinator({ win = window, doc = document } = {}) {
  const entries = new Map();
  let order = 0;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = win.matchMedia('(max-width: 760px)');
  const saveData = () => !!win.navigator.connection?.saveData;
  const observer = 'IntersectionObserver' in win ? new win.IntersectionObserver((changes) => {
    for (const change of changes) {
      const entry = [...entries.values()].find((item) => item.node === change.target);
      if (entry) entry.ratio = Math.min(1, change.intersectionRect.height / Math.max(win.innerHeight, 1));
    }
    update();
  }, { threshold: [0, .25, .5, .75, 1] }) : null;
  function update() {
    const visible = [...entries.values()];
    if (!observer) for (const entry of visible) {
      const box = entry.node.getBoundingClientRect();
      entry.ratio = Math.max(0, Math.min(box.bottom, win.innerHeight) - Math.max(box.top, 0)) / Math.max(box.height, 1);
    }
    const winner = activeAmbient(visible);
    for (const entry of visible) {
      const mode = motionMode({ intensity: entry.intensity, ratio: entry.ratio, winner: winner === entry.id,
        ready: entry.ready, hidden: doc.hidden, reduced: reduced.matches, mobile: mobile.matches,
        saveData: saveData(), cores: win.navigator.hardwareConcurrency ?? Infinity,
        memory: win.navigator.deviceMemory ?? Infinity });
      if (mode !== entry.mode) { entry.mode = mode; entry.onMode(mode); }
    }
  }
  const onChange = () => update();
  doc.addEventListener('visibilitychange', onChange);
  reduced.addEventListener('change', onChange);
  mobile.addEventListener('change', onChange);
  if (!observer) win.addEventListener('scroll', onChange, { passive: true });
  function register(node, intensity, onMode) {
    const id = ++order;
    const entry = { id, order, node, intensity, onMode, ratio: 0, ready: false, mode: null };
    entries.set(id, entry);
    if (observer) observer.observe(node);
    else entry.ratio = node.getBoundingClientRect().bottom > 0 ? 1 : 0;
    // Load and an idle slot keep the effect code off the first paint path.
    let idle;
    let timer;
    const later = () => {
      if ('requestIdleCallback' in win) idle = win.requestIdleCallback(() => { entry.ready = true; update(); }, { timeout: 600 });
      else timer = win.setTimeout(() => { entry.ready = true; update(); }, 120);
    };
    if (doc.readyState === 'complete') later();
    else win.addEventListener('load', later, { once: true });
    update();
    return () => {
      entries.delete(id); observer?.unobserve(node);
      win.removeEventListener('load', later);
      if (idle != null) win.cancelIdleCallback(idle);
      if (timer != null) win.clearTimeout(timer);
      update();
    };
  }
  return { register, update, destroy() {
    observer?.disconnect();
    doc.removeEventListener('visibilitychange', onChange);
    reduced.removeEventListener('change', onChange);
    mobile.removeEventListener('change', onChange);
    if (!observer) win.removeEventListener('scroll', onChange);
    entries.clear();
  } };
}
