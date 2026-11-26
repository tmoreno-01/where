# Matter — studio integration / RC 01

A continuously evolving, browser-native metallic particle sculpture. The simulation runs on the visitor's GPU. No remote simulation, paid APIs or video streams.

## Entry points
- Testing: `/matter/` (all live controls; 300,000 default desktop particles; up to 750,000).
- Presentation: `/matter/?studio=1` (clean canvas, metallic capsules, Contrast lighting, 115% brightness, fast solver, deep field shadows; 200,000 desktop / 12,000 mobile starting particles).
- Press H to reveal the lab controls; Space pauses/resumes.

## Integration
Copy the complete matter directory including LICENSE and src into the studio static site. Keep the pinned Three.js 0.176.0 import map or vendor the matching modules locally. Do not mix versions. Host over HTTPS.

Use a same-origin iframe inside an explicitly sized, overflow-hidden experiment panel. Keep the studio navigation outside the frame. Use a full-bleed stage and a descriptive iframe title. Supply a separately captured still from the approved live render as the panel background, with a text alternative for unavailable WebGPU. No prerecorded asset replaces the live experiment on supported devices.

Example:
```html
<section class="matter-panel" aria-label="Matter — living material experiment">
  <iframe id="matter" title="Matter — live particle sculpture"
    src="/matter/?studio=1" loading="lazy" allow="fullscreen"></iframe>
</section>
<style>
.matter-panel { position:relative; height: min(100svh, 900px); overflow:hidden; background:#101116; }
.matter-panel iframe { display:block; width:100%; height:100%; border:0; }
</style>
<script>
const frame=document.querySelector('#matter');
let visible=false;
const notify=()=>frame.contentWindow?.postMessage({type:'matter:visibility',visible:visible&&!document.hidden},location.origin);
const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;notify();});
observer.observe(frame);
frame.addEventListener('load',notify);
document.addEventListener('visibilitychange',notify);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==='matter:unavailable')frame.hidden=true;
});
</script>
```
On single-page navigation remove the iframe when leaving the experiment. Use same-origin messages only. Set a static poster rather than initializing WebGPU if the visitor requests reduced motion; offer an explicit Play button. If the site uses CSP, permit the pinned module CDN or self-host the dependencies.

## Release settings and verification
- Keep live interaction, autonomous formation selection, particle memory, local learning, signal propagation and irregular rare events.
- Studio mode adapts resolution, then lowers active count on sustained low FPS; testing mode leaves count under manual control.
- The visible bounds include a conservative margin for particle geometry, and soft steering/rebound prevents hard-edge packing. No intentional clipping or visible wrap.
- Verify desktop Chrome, Safari/WebGPU where supported, mobile portrait/landscape, click/drag at all corners, resize, offscreen pause, hidden tab, fallback, 10–20 minute run, and GPU device loss.
- Compare 60k, 100k, 200k, 300k and 750k on appropriate hardware. Do not treat 750k as a guaranteed real-time target. Check frame-time spikes and long-run edge behaviour, not just FPS.
- Capture a poster only after the visual result is approved. Do not publish the release to the main studio site until these checks pass.
- Keep the included software license and notices. Learning is a local contextual reward heuristic, not a neural model. Field shadows and fast pressure are approximations. No server-side learning.
