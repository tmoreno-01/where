import * as THREE from "three/webgpu";
import {
    array,
    Fn,
    If,
    instancedArray,
    instanceIndex,
    Return,
    uniform,
    int,
    float,
    Loop,
    vec3,
    vec4,
    atomicAdd,
    uint,
    max,
    pow,
    mat3,
    clamp,
    time,
    cross, mix, mx_hsvtorgb, select, ivec3
} from "three/tsl";
import {triNoise3Dvec} from "../common/noise.js";
import {conf} from "../conf.js";
import {StructuredArray} from "./structuredArray.js";
import {hsvtorgb} from "../common/hsv.js";

class mlsMpmSimulator {
    renderer = null;
    numParticles = 0;
    gridSize = new THREE.Vector3(0,0,0);
    gridCellSize = new THREE.Vector3(0,0,0);
    uniforms = {};
    kernels = {};
    fixedPointMultiplier = 1e6;
    mousePos = new THREE.Vector3();
    mousePosArray = [];

    constructor(renderer) {
        this.renderer = renderer;
    }
    async init() {
        const {maxParticles} = conf;
        this.gridSize.set(conf.gridX,conf.gridY,conf.gridZ);

        const particleStruct =  {
            position: { type: 'vec3' },
            density: { type: 'float' },
            velocity: { type: 'vec3' },
            mass: { type: 'float' },
            C: { type: 'mat3' },
            direction: { type: 'vec3' },
            color: { type: 'vec3' },
        };
        this.particleBuffer = new StructuredArray(particleStruct, maxParticles, "particleData");

        const vec = new THREE.Vector3();
        for (let i = 0; i < maxParticles; i++) {
            let dist = 2;
            while (dist > 1) {
                vec.set(Math.random(),Math.random(),Math.random()).multiplyScalar(2.0).subScalar(1.0);
                dist = vec.length();
                vec.multiplyScalar(0.8).addScalar(1.0).divideScalar(2.0).multiply(this.gridSize);
            }
            const mass = 1.0 - Math.random() * 0.002;
            this.particleBuffer.set(i, "position", vec);
            this.particleBuffer.set(i, "mass", mass);
        }

        const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
        const cellStruct ={
            x: { type: 'int', atomic: true },
            y: { type: 'int', atomic: true },
            z: { type: 'int', atomic: true },
            mass: { type: 'int', atomic: true },
        };
        this.cellBuffer = new StructuredArray(cellStruct, cellCount, "cellData");
        this.cellBufferF = instancedArray(cellCount, 'vec4').label('cellDataF');

        this.uniforms.gravityType = uniform(0, "uint");
        this.uniforms.gravity = uniform(new THREE.Vector3());
        this.uniforms.stiffness = uniform(0);
        this.uniforms.restDensity = uniform(0);
        this.uniforms.dynamicViscosity = uniform(0);
        this.uniforms.noise = uniform(0);

        this.uniforms.gridSize = uniform(this.gridSize, "ivec3");
        this.uniforms.gridCellSize = uniform(this.gridCellSize);
        this.uniforms.dt = uniform(0.1);
        this.uniforms.numParticles = uniform(0, "uint");

        this.uniforms.mouseRayDirection = uniform(new THREE.Vector3());
        this.uniforms.mouseRayOrigin = uniform(new THREE.Vector3());
        this.uniforms.mouseForce = uniform(new THREE.Vector3());
        this.uniforms.vortexA = uniform(new THREE.Vector3(19,32,24));
        this.uniforms.vortexB = uniform(new THREE.Vector3(45,32,38));
        this.uniforms.axisA = uniform(new THREE.Vector3(0,0,1));
        this.uniforms.axisB = uniform(new THREE.Vector3(0,0,-1));
        this.uniforms.drive = uniform(0.8);
        this.uniforms.palette = uniform(0.0);
        this.uniforms.gather = uniform(0.0);
        this.uniforms.vortexC = uniform(new THREE.Vector3(12,22,28));
        this.uniforms.vortexD = uniform(new THREE.Vector3(48,42,20));
        this.uniforms.axisC = uniform(new THREE.Vector3(0,1,0));
        this.uniforms.axisD = uniform(new THREE.Vector3(1,0,0));
        this.uniforms.detailForce = uniform(0.75);
        this.uniforms.pulse = uniform(0.0);
        this.uniforms.pulseCenter = uniform(new THREE.Vector3());
        this.uniforms.speedRef = uniform(1.8);
        this.uniforms.colorMix = uniform(conf.densityOnly?0.0:1.0);
        this.uniforms.paletteMode = uniform(conf.paletteMode);
        this.uniforms.pointer = uniform(new THREE.Vector3());
        this.uniforms.pointerDelta = uniform(new THREE.Vector3());
        this.uniforms.pointerActive = uniform(0.0);
        this.uniforms.pointerPulse = uniform(0.0);
        this.uniforms.clickCenter = uniform(new THREE.Vector3());
        this.uniforms.drift = uniform(new THREE.Vector3());
        this.uniforms.screenScale = uniform(1.0);
        this.uniforms.sampleStride = uniform(1,'uint');
        this.telemetry = instancedArray(1024,'vec4').label('telemetry');

        this.kernels.clearGrid = Fn(() => {
            this.cellBuffer.setAtomic("x", false);
            this.cellBuffer.setAtomic("y", false);
            this.cellBuffer.setAtomic("z", false);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
                Return();
            });

            this.cellBuffer.element(instanceIndex).get('x').assign(0);
            this.cellBuffer.element(instanceIndex).get('y').assign(0);
            this.cellBuffer.element(instanceIndex).get('z').assign(0);
            this.cellBuffer.element(instanceIndex).get('mass').assign(0);
            this.cellBufferF.element(instanceIndex).assign(0);
        })().compute(cellCount);

        const encodeFixedPoint = (f32) => {
            return int(f32.mul(this.fixedPointMultiplier));
        }
        const decodeFixedPoint = (i32) => {
            return float(i32).div(this.fixedPointMultiplier);
        }

        const getCellPtr = (ipos) => {
            const gridSize = this.uniforms.gridSize;
            const cellPtr = int(ipos.x).mul(gridSize.y).mul(gridSize.z).add(int(ipos.y).mul(gridSize.z)).add(int(ipos.z)).toConst();
            return cellPtr;
        };
        const getCell = (ipos) => {
            return this.cellBuffer.element(getCellPtr(ipos));
        };

        this.kernels.p2g1 = Fn(() => {
            this.cellBuffer.setAtomic("x", true);
            this.cellBuffer.setAtomic("y", true);
            this.cellBuffer.setAtomic("z", true);
            this.cellBuffer.setAtomic("mass", true);

            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst("particlePosition");
            const particleVelocity = this.particleBuffer.element(instanceIndex).get('velocity').xyz.toConst("particleVelocity");

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const C = this.particleBuffer.element(instanceIndex).get('C').toConst();
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const Q = C.mul(cellDist);

                        const massContrib = weight; // assuming particle mass = 1.0
                        const velContrib = massContrib.mul(particleVelocity.add(Q)).toConst("velContrib");
                        const cell = getCell(cellX);
                        atomicAdd(cell.get('x'), encodeFixedPoint(velContrib.x));
                        atomicAdd(cell.get('y'), encodeFixedPoint(velContrib.y));
                        atomicAdd(cell.get('z'), encodeFixedPoint(velContrib.z));
                        atomicAdd(cell.get('mass'), encodeFixedPoint(massContrib));
                    });
                });
            });
        })().compute(1);


        this.kernels.p2g2 = Fn(() => {
            this.cellBuffer.setAtomic("x", true);
            this.cellBuffer.setAtomic("y", true);
            this.cellBuffer.setAtomic("z", true);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst("particlePosition");

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const density = float(0).toVar("density");
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cell = getCell(cellX);
                        density.addAssign(decodeFixedPoint(cell.get('mass')).mul(weight));
                    });
                });
            });
            const densityStore = this.particleBuffer.element(instanceIndex).get('density');
            densityStore.assign(mix(densityStore, density, 0.05));

            const volume = float(1).div(density.max(0.01));
            const pressure = max(0.0, pow(density.div(this.uniforms.restDensity), 5.0).sub(1).mul(this.uniforms.stiffness)).min(36).toConst('pressure');
            const stress = mat3(pressure.negate(), 0, 0, 0, pressure.negate(), 0, 0, 0, pressure.negate()).toVar('stress');
            const dudv = this.particleBuffer.element(instanceIndex).get('C').toConst('C');

            const strain = dudv.add(dudv.transpose());
            stress.addAssign(strain.mul(this.uniforms.dynamicViscosity));
            const eq16Term0 = volume.mul(-4).mul(stress).mul(this.uniforms.dt);

            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const cell= getCell(cellX);

                        const momentum = eq16Term0.mul(weight).mul(cellDist).toConst("momentum");
                        atomicAdd(cell.get('x'), encodeFixedPoint(momentum.x));
                        atomicAdd(cell.get('y'), encodeFixedPoint(momentum.y));
                        atomicAdd(cell.get('z'), encodeFixedPoint(momentum.z));
                    });
                });
            });
        })().compute(1);


        this.kernels.updateGrid = Fn(() => {
            this.cellBuffer.setAtomic("x", false);
            this.cellBuffer.setAtomic("y", false);
            this.cellBuffer.setAtomic("z", false);
            this.cellBuffer.setAtomic("mass", false);

            If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
                Return();
            });
            const cell = this.cellBuffer.element(instanceIndex).toConst("cell");

            const mass = decodeFixedPoint(cell.get('mass')).toConst();
            If(mass.lessThanEqual(0), () => { Return(); });

            const vx = decodeFixedPoint(cell.get('x')).div(mass).toVar();
            const vy = decodeFixedPoint(cell.get('y')).div(mass).toVar();
            const vz = decodeFixedPoint(cell.get('z')).div(mass).toVar();

            const x = int(instanceIndex).div(this.uniforms.gridSize.z).div(this.uniforms.gridSize.y);
            const y = int(instanceIndex).div(this.uniforms.gridSize.z).mod(this.uniforms.gridSize.y);
            const z = int(instanceIndex).mod(this.uniforms.gridSize.z);


            If(x.lessThan(int(2)).or(x.greaterThan(this.uniforms.gridSize.x.sub(int(2)))), () => {
                vx.assign(0);
            });
            If(y.lessThan(int(2)).or(y.greaterThan(this.uniforms.gridSize.y.sub(int(2)))), () => {
                vy.assign(0);
            });
            If(z.lessThan(int(2)).or(z.greaterThan(this.uniforms.gridSize.z.sub(int(2)))), () => {
                vz.assign(0);
            });

            this.cellBufferF.element(instanceIndex).assign(vec4(vx,vy,vz,mass));
        })().compute(cellCount);

        this.kernels.g2p = Fn(() => {
            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            const particleMass = this.particleBuffer.element(instanceIndex).get('mass').toConst("particleMass");
            const particleDensity = this.particleBuffer.element(instanceIndex).get('density').toConst("particleDensity");
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toVar("particlePosition");
            const prevVelocity = this.particleBuffer.element(instanceIndex).get('velocity').xyz.toConst("prevVelocity");
            const particleVelocity = vec3(0).toVar();
            If(this.uniforms.gravityType.equal(uint(2)), () => {
                const pn = particlePosition.div(vec3(this.uniforms.gridSize.sub(1))).sub(0.5).normalize().toConst();
                particleVelocity.subAssign(pn.mul(0.3).mul(this.uniforms.dt));
            }).Else(() => {
                particleVelocity.addAssign(this.uniforms.gravity.mul(this.uniforms.dt));
            });


            const noise = triNoise3Dvec(particlePosition.mul(0.015), time, 0.11).sub(0.285).normalize().mul(0.28).toVar();
            particleVelocity.subAssign(noise.mul(this.uniforms.noise).mul(this.uniforms.dt));
            // Independently steered, continuous force fields.
            const ra = particlePosition.sub(this.uniforms.vortexA).toConst();
            const rb = particlePosition.sub(this.uniforms.vortexB).toConst();
            const wa = float(1).div(float(1).add(ra.dot(ra).div(230))).toConst();
            const wb = float(1).div(float(1).add(rb.dot(rb).div(280))).toConst();
            const spinA = cross(this.uniforms.axisA,ra).mul(0.048).sub(ra.mul(0.008)).mul(wa);
            const spinB = cross(this.uniforms.axisB,rb).mul(0.048).sub(rb.mul(0.008)).mul(wb);
            const rc = particlePosition.sub(this.uniforms.vortexC).toConst();
            const rd = particlePosition.sub(this.uniforms.vortexD).toConst();
            const wc = float(1).div(float(1).add(rc.dot(rc).div(125))).toConst();
            const wd = float(1).div(float(1).add(rd.dot(rd).div(145))).toConst();
            const spinC = cross(this.uniforms.axisC,rc).mul(0.105).sub(rc.mul(0.012)).mul(wc);
            const spinD = cross(this.uniforms.axisD,rd).mul(0.095).sub(rd.mul(0.009)).mul(wd);
            const center = particlePosition.sub(vec3(this.uniforms.gridSize).mul(0.5));
            const restoring = center.mul(this.uniforms.gather.mul(-0.016).sub(0.002));
            const pulseR = particlePosition.sub(this.uniforms.pulseCenter);
            const impulse = pulseR.div(pulseR.length().max(2.0)).mul(this.uniforms.pulse).div(float(1).add(pulseR.dot(pulseR).div(380)));
            const filament = vec3(center.y.mul(0.14).add(center.z.mul(0.06)).add(time.mul(0.36)).sin(),center.z.mul(0.18).sub(center.x.mul(0.12)).sub(time.mul(0.24)).sin(),center.x.mul(0.12).add(center.y.mul(0.15)).add(time.mul(0.28)).sin()).mul(0.17);
            particleVelocity.addAssign(spinA.add(spinB).mul(this.uniforms.drive).add(spinC.add(spinD).mul(this.uniforms.detailForce)).add(filament).add(impulse).add(restoring).add(this.uniforms.drift).mul(this.uniforms.dt));

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");

            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const B = mat3(0).toVar("B");
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const cellPtr = getCellPtr(cellX);

                        const weightedVelocity = this.cellBufferF.element(cellPtr).xyz.mul(weight).toConst("weightedVelocity");
                        const term = mat3(
                            weightedVelocity.mul(cellDist.x),
                            weightedVelocity.mul(cellDist.y),
                            weightedVelocity.mul(cellDist.z)
                        );
                        B.addAssign(term);
                        particleVelocity.addAssign(weightedVelocity);
                    });
                });
            });

            const dist = cross(this.uniforms.mouseRayDirection, particlePosition.mul(vec3(this.uniforms.screenScale,1,0.65)).sub(this.uniforms.mouseRayOrigin)).length()
            const force = dist.mul(0.1).oneMinus().max(0.0).pow(2);
            //particleVelocity.assign(mix(particleVelocity, this.uniforms.mouseForce.mul(6), force));
            // Pointer forces operate across the visible depth, not a single surface.
            const pOffset = particlePosition.sub(this.uniforms.pointer).mul(vec3(this.uniforms.screenScale,1,0));
            const pDist = pOffset.length().max(0.18);
            const pUnit = pOffset.div(pDist).mul(vec3(float(1).div(this.uniforms.screenScale),1,0));
            const influence = float(1).sub(pDist.div(14.0)).clamp(0,1).pow(2);
            const delta = this.uniforms.pointerDelta;
            const stir = delta.mul(2.8).add(pUnit.mul(2.2)).add(vec3(pUnit.y.negate(),pUnit.x,0).mul(delta.length().mul(0.58)));
            particleVelocity.addAssign(stir.mul(influence).mul(this.uniforms.pointerActive).mul(this.uniforms.dt));
            const clickOffset = particlePosition.sub(this.uniforms.clickCenter).mul(vec3(this.uniforms.screenScale,1,0));
            const clickDist = clickOffset.length().max(0.18);
            const clickDir = clickOffset.div(clickDist).mul(vec3(float(1).div(this.uniforms.screenScale),1,0));
            const clickWeight = float(1).sub(clickDist.div(23.0)).clamp(0,1).pow(2);
            particleVelocity.addAssign(clickDir.mul(clickWeight).mul(this.uniforms.pointerPulse).mul(this.uniforms.dt));
            const edgeLow = vec3(7,7,5).sub(particlePosition).max(0);
            const edgeHigh = particlePosition.sub(vec3(this.uniforms.gridSize).sub(vec3(7,7,5))).max(0);
            particleVelocity.addAssign(edgeLow.sub(edgeHigh).mul(0.16).mul(this.uniforms.dt));
            particleVelocity.mulAssign(particleMass);
            particleVelocity.mulAssign(float(1).min(float(5.2).div(particleVelocity.length().max(0.001))));

            this.particleBuffer.element(instanceIndex).get('C').assign(B.mul(4));
            particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt));
            particlePosition.assign(clamp(particlePosition, vec3(2), this.uniforms.gridSize.sub(2)));

            const wallStiffness = 0.42;
            const xN = particlePosition.add(particleVelocity.mul(this.uniforms.dt).mul(3.0)).toConst("xN");
            const wallMin = vec3(3).toConst("wallMin");
            const wallMax = vec3(this.uniforms.gridSize).sub(3).toConst("wallMax");
            If(xN.x.lessThan(wallMin.x), () => { particleVelocity.x.addAssign(wallMin.x.sub(xN.x).mul(wallStiffness)); });
            If(xN.x.greaterThan(wallMax.x), () => { particleVelocity.x.addAssign(wallMax.x.sub(xN.x).mul(wallStiffness)); });
            If(xN.y.lessThan(wallMin.y), () => { particleVelocity.y.addAssign(wallMin.y.sub(xN.y).mul(wallStiffness)); });
            If(xN.y.greaterThan(wallMax.y), () => { particleVelocity.y.addAssign(wallMax.y.sub(xN.y).mul(wallStiffness)); });
            If(xN.z.lessThan(wallMin.z), () => { particleVelocity.z.addAssign(wallMin.z.sub(xN.z).mul(wallStiffness)); });
            If(xN.z.greaterThan(wallMax.z), () => { particleVelocity.z.addAssign(wallMax.z.sub(xN.z).mul(wallStiffness)); });

            this.particleBuffer.element(instanceIndex).get('position').assign(particlePosition)
            this.particleBuffer.element(instanceIndex).get('velocity').assign(particleVelocity)

            const direction = this.particleBuffer.element(instanceIndex).get('direction');
            direction.assign(mix(direction,particleVelocity, 0.1));

            // Soft-knee speed normalization preserves gradients even during fast impacts.
            const den = particleDensity.div(this.uniforms.restDensity).clamp(0,2.0);
            const rawSpeed = particleVelocity.length().div(this.uniforms.speedRef.max(0.25));
            const speed = rawSpeed.div(rawSpeed.add(0.58)).clamp(0,1);
            const accel = particleVelocity.sub(prevVelocity).length().mul(1.8).clamp(0,1);
            const heading = particleVelocity.x.div(particleVelocity.length().max(0.001));
            const energy = speed.mul(0.86).add(den.div(den.add(1)).mul(0.12)).add(accel.mul(0.07)).add(heading.mul(0.035));
            const densitySignal = den.div(den.add(0.50));
            const t = mix(densitySignal,energy,this.uniforms.colorMix).add(this.uniforms.palette.mul(0.028)).clamp(0,1);
            // These are bounded linear-light pigment values, not emissive whites.
            const violet = vec3(0.12,0.012,0.35);
            const blue = vec3(0.018,0.085,0.72);
            const aqua = vec3(0.006,0.44,0.56);
            const acid = vec3(0.48,0.67,0.018);
            const orange = vec3(0.82,0.125,0.012);
            const fuchsia = vec3(0.68,0.014,0.27);
            const c0 = mix(violet,blue,t.mul(5.5).clamp(0,1));
            const c1 = mix(c0,aqua,t.sub(0.18).mul(5.0).clamp(0,1));
            const c2 = mix(c1,acid,t.sub(0.38).mul(5.0).clamp(0,1));
            const c3 = mix(c2,orange,t.sub(0.58).mul(5.0).clamp(0,1));
            const spectrum = mix(c3,fuchsia,t.sub(0.78).mul(4.55).clamp(0,1));
            const acidA = mix(vec3(0.065,0.008,0.18),vec3(0.015,0.32,0.34),t.mul(2.5).clamp(0,1));
            const acidB = mix(acidA,vec3(0.50,0.68,0.012),t.sub(0.40).mul(2.9).clamp(0,1));
            const acidC = mix(acidB,vec3(0.86,0.19,0.025),t.sub(0.79).mul(4.8).clamp(0,1));
            const emberA = mix(vec3(0.035,0.018,0.24),vec3(0.39,0.015,0.35),t.mul(2.8).clamp(0,1));
            const emberB = mix(emberA,vec3(0.79,0.045,0.075),t.sub(0.35).mul(3.0).clamp(0,1));
            const emberC = mix(emberB,vec3(0.85,0.36,0.018),t.sub(0.68).mul(3.13).clamp(0,1));
            const pigment = mix(mix(spectrum,acidC,select(this.uniforms.paletteMode.equal(1),float(1),float(0))),emberC,select(this.uniforms.paletteMode.equal(2),float(1),float(0)));
            const illuminated = pigment.mul(speed.mul(0.28).add(0.80)).mul(accel.mul(0.13).add(0.94));
            const oldColor = this.particleBuffer.element(instanceIndex).get('color');
            const color = mix(oldColor,illuminated,0.16);
            this.particleBuffer.element(instanceIndex).get('color').assign(color);
        })().compute(1);
        this.kernels.sample = Fn(() => {
            const i = instanceIndex.mul(this.uniforms.sampleStride);
            const p = this.particleBuffer.element(i);
            this.telemetry.element(instanceIndex).assign(vec4(p.get('position'),p.get('density')));
            this.telemetry.element(instanceIndex.add(uint(512))).assign(vec4(p.get('velocity'),1));
        })().compute(512);
    }

    async observe() {
        await this.renderer.computeAsync(this.kernels.sample);
        const a = new Float32Array(await this.renderer.getArrayBufferAsync(this.telemetry.value));
        const mean = new THREE.Vector3(), size = this.gridSize;
        let density=0, speed=0, edge=0, spread=0, n=0;
        for(let i=0;i<512;i++){
            const j=i*4,k=(512+i)*4;
            const x=a[j]/size.x,y=a[j+1]/size.y,z=a[j+2]/size.z;
            if(!Number.isFinite(x+y+z+a[j+3]+a[k]+a[k+1]+a[k+2]))continue;
            mean.x+=x;mean.y+=y;mean.z+=z;density+=a[j+3]/Math.max(conf.restDensity,0.001);
            speed+=Math.hypot(a[k],a[k+1],a[k+2]);
            edge+=Math.min(x,1-x,y,1-y)<0.115?1:0;n++;
        }
        if(n<480)return null;
        mean.divideScalar(n);
        for(let i=0;i<512;i++){
            const j=i*4,x=a[j]/size.x,y=a[j+1]/size.y,z=a[j+2]/size.z;
            if(Number.isFinite(x+y+z))spread+=(x-mean.x)**2+(y-mean.y)**2+(z-mean.z)**2;
        }
        return {mean,density:density/n,speed:speed/n,edge:edge/n,spread:Math.sqrt(spread/n)};
    }

    setMouseRay(origin, direction, pos) {
        origin.multiplyScalar(64);
        pos.multiplyScalar(64);
        origin.add(new THREE.Vector3(this.gridSize.x*0.5*this.uniforms.screenScale.value,0,0));
        this.uniforms.mouseRayDirection.value.copy(direction.normalize());
        this.uniforms.mouseRayOrigin.value.copy(origin);
        this.mousePos.copy(pos);
    }

    async update(interval, elapsed) {
        const { particles, run, noise, dynamicViscosity, stiffness, restDensity, speed, gravity, gravitySensorReading, accelerometerReading } = conf;

        this.uniforms.noise.value = noise;
        this.uniforms.stiffness.value = stiffness;
        this.uniforms.gravityType.value = gravity;
        if (gravity === 0) {
            this.uniforms.gravity.value.set(0,0,0.10);
        } else if (gravity === 1) {
            this.uniforms.gravity.value.set(0,-0.2,0);
        } else if (gravity === 3) {
            this.uniforms.gravity.value.copy(gravitySensorReading).add(accelerometerReading);
        }
        this.uniforms.dynamicViscosity.value = dynamicViscosity;
        this.uniforms.restDensity.value = restDensity;

        if (particles !== this.numParticles) {
            this.numParticles = particles;
            this.uniforms.numParticles.value = particles;
            this.uniforms.sampleStride.value = Math.max(1,Math.floor(particles/512));
            this.kernels.p2g1.count = particles;
            this.kernels.p2g1.updateDispatchCount();
            this.kernels.p2g2.count = particles;
            this.kernels.p2g2.updateDispatchCount();
            this.kernels.g2p.count = particles;
            this.kernels.g2p.updateDispatchCount();
        }

        interval = Math.min(interval, 1/60);
        const dt = interval * 6 * speed;
        this.uniforms.dt.value = dt;

        this.mousePosArray.push(this.mousePos.clone())
        if (this.mousePosArray.length > 3) { this.mousePosArray.shift(); }
        if (this.mousePosArray.length > 1) {
            this.uniforms.mouseForce.value.copy(this.mousePosArray[this.mousePosArray.length - 1]).sub(this.mousePosArray[0]).divideScalar(this.mousePosArray.length);
            this.uniforms.mouseForce.value.x /= this.uniforms.screenScale.value;
            this.uniforms.mouseForce.value.z /= 0.65;
        }


        if (run) {
            const kernels = [this.kernels.clearGrid, this.kernels.p2g1, this.kernels.p2g2, this.kernels.updateGrid, this.kernels.g2p];
            await this.renderer.computeAsync(kernels);
        }
    }
}

export default mlsMpmSimulator;