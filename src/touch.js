// Phone and tablet controls: a floating thumbstick on the left half of the
// screen, drag anywhere on the right half to look, and RUN / pause buttons.

const STICK_RADIUS = 55; // px the knob can travel from the centre

export function setupTouch(root, { onLook, onPause }) {
  const input = { f: 0, r: 0, run: false };
  const base = root.querySelector('#stick-base');
  const knob = root.querySelector('#stick-knob');
  const runBtn = root.querySelector('#run-btn');
  const pauseBtn = root.querySelector('#pause-btn');

  let stickId = null;
  let lookId = null;
  let origin = null;
  let last = null;

  function placeStick(x, y) {
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.classList.add('active');
    knob.style.transform = 'translate(-50%, -50%)';
  }

  function resetStick() {
    stickId = null;
    input.f = input.r = 0;
    base.classList.remove('active');
    base.style.left = base.style.top = '';
    knob.style.transform = 'translate(-50%, -50%)';
  }

  root.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.target === runBtn) {
          input.run = !input.run;
          runBtn.classList.toggle('on', input.run);
        } else if (t.target === pauseBtn) {
          onPause();
        } else if (t.clientX < window.innerWidth * 0.45) {
          if (stickId !== null) continue;
          stickId = t.identifier;
          origin = { x: t.clientX, y: t.clientY };
          placeStick(origin.x, origin.y);
        } else if (lookId === null) {
          lookId = t.identifier;
          last = { x: t.clientX, y: t.clientY };
        }
      }
    },
    { passive: false },
  );

  root.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - origin.x;
          let dy = t.clientY - origin.y;
          const d = Math.hypot(dx, dy);
          if (d > STICK_RADIUS) {
            dx = (dx / d) * STICK_RADIUS;
            dy = (dy / d) * STICK_RADIUS;
          }
          input.r = dx / STICK_RADIUS;
          input.f = -dy / STICK_RADIUS;
          knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === lookId) {
          onLook(t.clientX - last.x, t.clientY - last.y);
          last = { x: t.clientX, y: t.clientY };
        }
      }
    },
    { passive: false },
  );

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) resetStick();
      if (t.identifier === lookId) lookId = null;
    }
  };
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', end);

  return {
    input,
    stopRunning() {
      input.run = false;
      runBtn.classList.remove('on');
    },
    reset() {
      resetStick();
      lookId = null;
      this.stopRunning();
    },
  };
}
