import { chromium } from "playwright";
import { server, PORT } from "./serve.mjs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on("console", m => console.log("console:", m.type(), m.text().slice(0, 500)));
p.on("pageerror", e => console.log("PAGEERROR", e.message.slice(0, 800)));
await p.goto(`http://127.0.0.1:${PORT}/?mode=view&units=20&close=200&mid=400&cam=40`, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.POC_RESULT !== undefined || window.POC_ERROR !== undefined, null, { timeout: 120000 });
await p.waitForTimeout(1500);
const d = await p.evaluate(() => {
  const h = window.POC_CROWD;
  if (!h) return { err: "no POC_CROWD" };
  const { crowd, scene, cam } = h;
  const meshes = scene.meshes.map(m => ({
    name: m.name, enabled: m.isEnabled(), verts: m.getTotalVertices(),
    idx: m.getTotalIndices(), thin: m.thinInstanceCount ?? 0,
    hasThin: !!m.hasThinInstances,
    ready: m.material ? m.material.isReady(m) : null,
    matName: m.material ? m.material.name : null,
    bb: m.getBoundingInfo ? [m.getBoundingInfo().boundingBox.minimumWorld.asArray().map(v=>+v.toFixed(2)),
                            m.getBoundingInfo().boundingBox.maximumWorld.asArray().map(v=>+v.toFixed(2))] : null,
  }));
  return {
    meshes,
    activeMeshes: scene.getActiveMeshes().length,
    activeNames: scene.getActiveMeshes().data.slice(0, 6).map(m => m && m.name),
    camPos: cam.globalPosition.asArray().map(v => +v.toFixed(2)),
    camTarget: cam.getTarget().asArray().map(v => +v.toFixed(2)),
    firstUnit: crowd.units[0],
    unitCount: crowd.units.length,
  };
});
console.log(JSON.stringify(d, null, 2).slice(0, 3500));
await b.close();
server.close();
