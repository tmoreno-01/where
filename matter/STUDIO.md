# Ravelith — studio integration / RC 07

A continuously evolving, browser-native synthetic ecology. Branching spicule units are instanced on the visitor's GPU; regional memory steers their morphogenesis and periodic molts scatter material into new forms. No remote simulation, paid APIs or video streams.

## Entry points
- Testing: `/matter/` (monochrome studio footer including particle count; add `?lab=1` for all technical controls; 300,000 default desktop particles; up to 300,000).
- Presentation: `/matter/?studio=1` (monochrome studio footer, manually selected fixed colour studies driven by local density, branching spicules, Fossil pigment, organic-shell finish, Contrast lighting, 115% brightness, fast solver, deep field shadows; 200,000 desktop / 12,000 mobile starting particles).
- Press H to toggle the lab controls; add `&clean=1` to hide all controls; Space pauses/resumes.

## Integration
Copy the complete matter directory including LICENSE and src into the studio static site. Keep the pinned Three.js 0.176.0 import map or vendor the matching modules locally. Do not mix versions. Host over HTTPS.

Use a same-origin iframe inside an explicitly sized, overflow-hidden experiment panel. Keep the studio navigation outside the frame. Use a full-bleed stage and a descriptive iframe title. Supply a separately captured still from the approved live render as the panel background, with a text alternative for unavailable WebGPU. No prerecorded asset replaces the live experiment on supported devices.

Example:
```html
<section class="matter-panel" aria-label="Ravelith — living material experiment">
  <iframe id="matter" title="Ravelith — live particle sculpture"
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
- Keep immediate restrained click ripples, gentle drag, continuously drifting force fields, folding and breathing modes, autonomous formation selection, 64 independently adapting regions with local density, speed, signal and action-outcome feedback, particle memory, local learning (composition reward favours occupied interior tiles and penalises edge accumulation), user-selected fixed colour studies, signal propagation and irregular rare events.
- Studio mode adapts resolution, then lowers active count on sustained low FPS until the visitor manually selects a population; testing mode leaves count under manual control.
- The visible bounds include a mesh-aware margin; the shortened boundary steering zone permits closer edge contact, and a smoothed 8×8 projected density field redistributes crowded regions. No intentional clipping or visible wrap.
- Verify desktop Chrome, Safari/WebGPU where supported, mobile portrait/landscape, click/drag at all corners, resize, offscreen pause, hidden tab, fallback, 10–20 minute run, and GPU device loss.
- Compare 60k, 100k, 200k, and 300k on appropriate hardware. Do not treat 300k as a guaranteed real-time target. Check frame-time spikes and long-run edge behaviour, not just FPS.
- Capture a poster only after the visual result is approved. Do not publish the release to the main studio site until these checks pass.
- Keep the included software license and notices. Global and regional learning are bounded contextual reward heuristics, not a neural model or biological life. Regional state is session-local. Field shadows and fast pressure are approximations. No server-side learning.

The public title is Ravelith. The existing `/matter/` route is retained to avoid breaking test links. Palette changes are renderer uniforms, independent of simulation updates, and no automatic palette switching is present. The default is Fossil; density remains the default colour rule. The default geometry is a tapered, asymmetric, four-branch spicule with memory-responsive deformation and an organic-shell material finish. The footer is outside the artwork viewport.


## About copy and adaptive movement
The public interface has no studio logo. The footer uses the LifeAfterLogic monochrome typographic language and a short visible description. The About panel explains the real-time GPU field, 64 local adaptive regions, local memory, action feedback and neighbour-to-neighbour signal propagation.
The regional controller updates on fresh telemetry approximately every 1.2 seconds. Each region tracks local density, speed, stress, energy, memory and phase. It chooses between four local behaviours (restore, clockwise circulation, counter-clockwise circulation, relay), then updates its action values using the observed result. Signal activity spreads to adjacent regions and contributes to a three-dimensional movement field. This is bounded local adaptive feedback, not a neural network or biological consciousness.


## USP: an anatomy without a species
Ravelith is a synthetic ecology, not a simulation of a named organism. Each GPU particle is rendered as a tapered, asymmetric, branching spicule. Particle memory affects branch deformation, scale, pigment and surface roughness. The 64-region controller retains directional traces; differences between neighbouring traces feed back into the three-dimensional movement field.
A fifth rare event, "molt", sends memory-bearing particles into a temporary outward spiral. This sheds a local arrangement and seeds a new one. The manual "Trigger a molt" control invokes this event. The system remains a real-time GPU simulation with bounded regional feedback, not a neural network or biological consciousness.
Mesh shadows are enabled by default on desktop and mobile. Mobile uses a reduced shadow-map resolution; the performance governor may reduce render resolution and, only under sustained severe load, downgrade shadows to automatic mode.
