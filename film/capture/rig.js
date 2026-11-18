// The film's camera operator. Runs inside the page, after Meta's IWER (an emulated Meta Quest 3) is installed, and
// drives Atrium the way a person in the headset does: turn the head to look at something (gaze), then pinch with
// the right hand (the WebXR select). Every head turn is eased, so the headset view itself is the camera move.
// It also records the headset view (canvas -> VP9 WebM) and logs every pinch, so the edit can place sound and
// focus rings on the exact frames.
window.rig = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = () => window.atrium;
  const d = () => window.__xr;
  const V = (x, y, z) => new (A().THREE.Vector3)(x, y, z);

  /** The first visible selectable whose label matches (exact string, or a predicate). */
  function find(label) {
    let hit = null;
    const { scene } = A();
    scene.updateMatrixWorld();
    scene.traverseVisible((o) => {
      const l = o.userData.label;
      if (!hit && o.userData.selectable && (typeof label === 'string' ? l === label : label(l))) hit = o;
    });
    return hit;
  }
  async function waitFor(label, ms = 90000) {
    const end = performance.now() + ms;
    for (;;) {
      const o = find(label);
      if (o) return o;
      if (performance.now() > end) throw new Error('rig: no ' + label + ' | have ' + labels().join(', ') + ' | ' + caption());
      await sleep(80);
    }
  }
  const labels = () => {
    const out = [];
    A().scene.traverseVisible((o) => o.userData.selectable && out.push(o.userData.label));
    return out;
  };
  const caption = () => {
    let s = '';
    A().scene.traverseVisible((o) => { if (o.content && o.w === 0.66) s = (o.content.title || '') + ' | ' + (o.content.body || ''); });
    return s;
  };

  const eye = () => { const p = d().position; return V(p.x, p.y, p.z); };
  const current = () => { const q = d().quaternion; return new (A().THREE.Quaternion)(q.x, q.y, q.z, q.w); };
  const facing = (target) => new (A().THREE.Quaternion)().setFromRotationMatrix(new (A().THREE.Matrix4)().lookAt(eye(), target, V(0, 1, 0)));
  /** The right hand rides low and to the right of the view, pointing where you look. */
  function setHead(q) {
    d().quaternion.set(q.x, q.y, q.z, q.w);
    const wrist = V(0.15, -0.27, -0.36).applyQuaternion(q).add(eye());
    d().hands.right.setPin({ anchor: 'wrist', target: wrist.toArray(), wristRotation: [q.x, q.y, q.z, q.w] });
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  async function turnTo(q1, ms) {
    const q0 = current(), t0 = performance.now();
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / ms);
      setHead(q0.clone().slerp(q1, ease(t)));
      if (t >= 1) return;
      await sleep(14);
    }
  }
  /** Look at a selectable (label or object), optionally a little above/below it (metres). */
  async function look(label, ms = 650, lift = 0) {
    const o = typeof label === 'object' ? label : await waitFor(label);
    const p = o.getWorldPosition(V(0, 0, 0));
    p.y += lift;
    await turnTo(facing(p), ms);
    return o;
  }
  /** Look in a direction: yaw right-positive, pitch up-positive, degrees. */
  async function lookDir(yaw, pitch, ms) {
    const T = A().THREE;
    await turnTo(new T.Quaternion().setFromEuler(new T.Euler((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0, 'YXZ')), ms);
  }
  async function pinch(label = '') {
    mark('pinch', label);
    const h = d().hands.right;
    h.updatePinchValue(1);
    await sleep(210);
    h.updatePinchValue(0);
    await sleep(140);
  }
  async function press(label, ms = 650) {
    const o = await look(label, ms);
    await sleep(200);
    await pinch(o.userData.label);
  }

  // ---- recording ----
  let rec = null, chunks = [], t0 = 0, marks = [], pump = 0;
  const mark = (kind, label = '') => rec && marks.push({ t: +((performance.now() - t0) / 1000).toFixed(3), kind, label });
  function start() {
    const c = document.querySelector('canvas');
    chunks = []; marks = [];
    // The XR session draws without the canvas noticing, so pull every frame explicitly (60 a second).
    const stream = c.captureStream(0), track = stream.getVideoTracks()[0];
    pump = setInterval(() => track.requestFrame(), 1000 / 60);
    rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 14_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(500);
    t0 = performance.now();
  }
  function stop(name) {
    return new Promise((res) => {
      clearInterval(pump);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name + '.webm';
        document.body.appendChild(a);
        a.click();
        const out = { size: blob.size, marks };
        rec = null;
        res(out);
      };
      rec.stop();
    });
  }
  return { sleep, find, waitFor, labels, caption, look, lookDir, turnTo, pinch, press, mark, start, stop };
})();
