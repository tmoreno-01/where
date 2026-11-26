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
    cross, mix, mx_hsvtorgb, select, ivec3, uniformArray
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
    fixedPointMultiplier = 5e5;
    tick=0;
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
            memory: { type: 'float' },
            signal: { type: 'float' },
            refractory: { type: 'float' },
            illumination: { type: 'float' },
        };
        this.particleBuffer = new StructuredArray(particleStruct, maxParticles, "particleData");

        const vec = new THREE.Vector3();
        const initialMax=this.gridSize.clone().subScalar(2.02);
        for (let i = 0; i < maxParticles; i++) {
            // A broad, non-uniform starting field; no single central sphere.
            const x=Math.random()*.84+.08,y=Math.random()*.84+.08;
            const ridge=.5+.17*Math.sin(x*8.5+y*5.3)+.09*Math.cos(y*12-x*4);
            const z=Math.max(.12,Math.min(.88,ridge+(Math.random()-.5)*.45));
            vec.set(x,y,z).multiply(this.gridSize).clampScalar(2.02,Infinity).min(initialMax);
            const mass = 1.0 - Math.random() * 0.002;
            this.particleBuffer.set(i, "position", vec);
            this.particleBuffer.set(i, "mass", mass);
            this.particleBuffer.set(i, "direction", [0,1,0]);
            this.particleBuffer.set(i, "illumination", 1);
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
        this.lightField=instancedArray(cellCount,'float').label('lightTransmission');
        const nx=Math.ceil(conf.gridX/4),ny=Math.ceil(conf.gridY/4),nz=Math.ceil(conf.gridZ/4), nerveCount=nx*ny*nz;
        this.nerveGrid=new StructuredArray({sum:{type:'int',atomic:true},count:{type:'int',atomic:true}},nerveCount,'nerveGrid');
        this.nerveRead=instancedArray(nerveCount,'float').label('nerveRead');
        this.nerveNearby=instancedArray(nerveCount,'float').label('nerveNearby');

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

        this.uniforms.gather = uniform(0.0);
        this.uniforms.lightDirection=uniform(new THREE.Vector3(-.6,.52,-.62).normalize());
        this.uniforms.fieldShadows=uniform(1.0);
        this.uniforms.spreadForce=uniform(new THREE.Vector3(.007,.009,0));
        this.uniforms.spreadCenter=uniform(this.gridSize.clone().multiplyScalar(.5));
        this.uniforms.vortexC = uniform(new THREE.Vector3(12,22,28));
        this.uniforms.vortexD = uniform(new THREE.Vector3(48,42,20));
        this.uniforms.axisC = uniform(new THREE.Vector3(0,1,0));
        this.uniforms.axisD = uniform(new THREE.Vector3(1,0,0));
        this.uniforms.detailForce = uniform(0.75);
        this.uniforms.pulse = uniform(0.0);
        this.uniforms.pulseCenter = uniform(new THREE.Vector3());
        this.uniforms.speedRef = uniform(1.8);



        this.uniforms.edgeBias=uniform(new THREE.Vector3());
        this.compositionVectors=Array.from({length:64},()=>new THREE.Vector3());
        this.uniforms.compositionField=uniformArray(this.compositionVectors,'vec3');
        this.uniforms.edgeTargets=uniform(new THREE.Vector4(1,1,1,1));
        this.uniforms.pointer = uniform(new THREE.Vector3());
        this.uniforms.pointerPrevious = uniform(new THREE.Vector3());
        this.uniforms.pointerDrag = uniform(0.0);
        this.uniforms.clickImpulse = uniform(0.0);
        this.uniforms.rippleAge=uniform(10.0);
        this.uniforms.flowPhase=uniform(new THREE.Vector3());
        this.uniforms.flowStrength=uniform(.19);
        this.uniforms.breath=uniform(0.0);
        this.uniforms.pointerDelta = uniform(new THREE.Vector3());
        this.uniforms.pointerActive = uniform(0.0);
        this.uniforms.pointerPulse = uniform(0.0);
        this.uniforms.memoryEnabled = uniform(conf.memory?1.0:0.0);
        this.uniforms.nervesEnabled = uniform(conf.nerves?1.0:0.0);
        this.uniforms.fastPressure = uniform(conf.solver==='fast'?1.0:0.0);
        this.uniforms.nerveSource = uniform(new THREE.Vector3());
        this.uniforms.nerveStrength = uniform(0.0);
        this.uniforms.rareKind = uniform(0.0);
        this.uniforms.rareStrength = uniform(0.0);
        this.uniforms.rareCenter = uniform(new THREE.Vector3());
        this.uniforms.rareAxis = uniform(new THREE.Vector3(1,0,0));
        this.uniforms.tideAxis = uniform(new THREE.Vector3(1,0,0));
        this.uniforms.tidePhase = uniform(0.0);
        this.uniforms.tideAmount = uniform(0.0);
        this.uniforms.clickCenter = uniform(new THREE.Vector3());
        this.uniforms.drift = uniform(new THREE.Vector3());
        this.uniforms.screenScale = uniform(1.0);
        this.uniforms.screenScaleY=uniform(1.0);
        this.uniforms.visibleMin=uniform(new THREE.Vector3(2.04,2.04,2.04));
        this.uniforms.visibleMax=uniform(this.gridSize.clone().subScalar(2.04));
        this.uniforms.sampleStride = uniform(1,'uint');
        this.uniforms.sampleOffset=uniform(0,'uint');
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
            // updateGrid writes every cell, including empty cells.
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

        const nervePos = p => ivec3(p.div(4)).max(ivec3(0)).min(ivec3(nx-1,ny-1,nz-1));
        const nerveIndex = p => uint(p.x.mul(ny*nz).add(p.y.mul(nz)).add(p.z));
        const neighbor = (p,dx,dy,dz) => this.nerveRead.element(nerveIndex(p.add(ivec3(dx,dy,dz)).max(ivec3(0)).min(ivec3(nx-1,ny-1,nz-1))));
        this.kernels.nerveClear = Fn(() => {
            this.nerveGrid.setAtomic('sum',false);this.nerveGrid.setAtomic('count',false);
            If(instanceIndex.greaterThanEqual(uint(nerveCount)),()=>{Return();});
            this.nerveGrid.element(instanceIndex).get('sum').assign(0);
            this.nerveGrid.element(instanceIndex).get('count').assign(0);
        })().compute(nerveCount);
        this.kernels.nerveDeposit = Fn(() => {
            this.nerveGrid.setAtomic('sum',true);this.nerveGrid.setAtomic('count',true);
            If(instanceIndex.greaterThanEqual(this.uniforms.numParticles),()=>{Return();});
            const p=this.particleBuffer.element(instanceIndex);
            const cell=this.nerveGrid.element(nerveIndex(nervePos(p.get('position'))));
            atomicAdd(cell.get('sum'),int(p.get('signal').clamp(0,1).mul(1000)));
            atomicAdd(cell.get('count'),int(1));
        })().compute(1);
        this.kernels.nerveResolve = Fn(() => {
            this.nerveGrid.setAtomic('sum',false);this.nerveGrid.setAtomic('count',false);
            If(instanceIndex.greaterThanEqual(uint(nerveCount)),()=>{Return();});
            const cell=this.nerveGrid.element(instanceIndex);
            this.nerveRead.element(instanceIndex).assign(float(cell.get('sum')).div(float(cell.get('count')).max(1).mul(1000)));
        })().compute(nerveCount);
        this.kernels.nerveSpread=Fn(()=>{
            If(instanceIndex.greaterThanEqual(uint(nerveCount)),()=>{Return();});
            const p=ivec3(int(instanceIndex).div(ny*nz),int(instanceIndex).div(nz).mod(ny),int(instanceIndex).mod(nz));
            const n=neighbor(p,0,0,0).mul(0.65).max(neighbor(p,1,0,0)).max(neighbor(p,-1,0,0)).max(neighbor(p,0,1,0)).max(neighbor(p,0,-1,0)).max(neighbor(p,0,0,1)).max(neighbor(p,0,0,-1));
            this.nerveNearby.element(instanceIndex).assign(n);
        })().compute(nerveCount);
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
            If(mass.lessThanEqual(0), () => { this.cellBufferF.element(instanceIndex).assign(vec4(0));Return(); });

            const vx = decodeFixedPoint(cell.get('x')).div(mass).toVar();
            const vy = decodeFixedPoint(cell.get('y')).div(mass).toVar();
            const vz = decodeFixedPoint(cell.get('z')).div(mass).toVar();

            const x = int(instanceIndex).div(this.uniforms.gridSize.z).div(this.uniforms.gridSize.y);
            const y = int(instanceIndex).div(this.uniforms.gridSize.z).mod(this.uniforms.gridSize.y);
            const z = int(instanceIndex).mod(this.uniforms.gridSize.z);
            If(this.uniforms.fastPressure.greaterThan(0.5),()=>{
                const p=ivec3(x,y,z),size=this.uniforms.gridSize.sub(ivec3(1));
                const pressureAt=(dx,dy,dz)=>{
                    const q=p.add(ivec3(dx,dy,dz)).max(ivec3(0)).min(size);
                    const m=decodeFixedPoint(getCell(q).get('mass'));
                    const d=m.div(this.uniforms.restDensity.max(0.001)).sub(1).max(0);
                    return d.mul(d).mul(this.uniforms.stiffness).min(24);
                };
                const grad=vec3(pressureAt(1,0,0).sub(pressureAt(-1,0,0)),pressureAt(0,1,0).sub(pressureAt(0,-1,0)),pressureAt(0,0,1).sub(pressureAt(0,0,-1))).mul(0.5);
                const acc=grad.mul(this.uniforms.dt).div(mass.max(0.25)).mul(0.85).clamp(-0.65,0.65);
                vx.subAssign(acc.x);vy.subAssign(acc.y);vz.subAssign(acc.z);
            });


            If(x.lessThan(int(3)),()=>{vx.assign(vx.max(0));});
            If(x.greaterThanEqual(this.uniforms.gridSize.x.sub(int(3))),()=>{vx.assign(vx.min(0));});
            If(y.lessThan(int(3)),()=>{vy.assign(vy.max(0));});
            If(y.greaterThanEqual(this.uniforms.gridSize.y.sub(int(3))),()=>{vy.assign(vy.min(0));});
            If(z.lessThan(int(3)),()=>{vz.assign(vz.max(0));});
            If(z.greaterThanEqual(this.uniforms.gridSize.z.sub(int(3))),()=>{vz.assign(vz.min(0));});

            this.cellBufferF.element(instanceIndex).assign(vec4(vx,vy,vz,mass));
        })().compute(cellCount);

        // Approximate directional transmittance through the occupied simulation grid.
        // Compute once per grid cell, instead of tracing individual capsule meshes.
        this.kernels.lightField=Fn(()=>{
            If(instanceIndex.greaterThanEqual(uint(cellCount)),()=>{Return();});
            const size=this.uniforms.gridSize;
            const p=ivec3(int(instanceIndex).div(size.y.mul(size.z)),int(instanceIndex).div(size.z).mod(size.y),int(instanceIndex).mod(size.z)).toConst('lightCell');
            const density=this.cellBufferF.element(instanceIndex).w;
            If(density.lessThan(0.01),()=>{this.lightField.element(instanceIndex).assign(1);Return();});
            const opticalDepth=float(0).toVar('opticalDepth');
            const scale=this.uniforms.restDensity.max(0.001);
            for(const [distance,weight] of [[1.5,.17],[3.5,.22],[6.5,.26],[10.5,.25],[16,.20],[24,.15]]){
                const q=ivec3(vec3(p).add(this.uniforms.lightDirection.mul(distance))).toConst();
                const inside=q.x.greaterThanEqual(0).and(q.y.greaterThanEqual(0)).and(q.z.greaterThanEqual(0)).and(q.x.lessThan(size.x)).and(q.y.lessThan(size.y)).and(q.z.lessThan(size.z));
                If(inside,()=>{
                    const mass=this.cellBufferF.element(getCellPtr(q)).w;
                    opticalDepth.addAssign(mass.div(scale).clamp(0,3).mul(weight));
                });
            }
            const local=density.div(scale).clamp(0,3).mul(.15);
            const extinction=opticalDepth.add(local);
            const transmission=float(1).div(float(1).add(extinction.mul(1.65)).add(extinction.mul(extinction).mul(.8))).clamp(.15,1);
            this.lightField.element(instanceIndex).assign(transmission);
        })().compute(cellCount);
        this.kernels.g2p = Fn(() => {
            If(instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)), () => {
                Return();
            });
            const particleMass = this.particleBuffer.element(instanceIndex).get('mass').toConst("particleMass");
            const densitySlot=this.particleBuffer.element(instanceIndex).get('density');
            const particleDensity = densitySlot.toVar("particleDensity");
            const particlePosition = this.particleBuffer.element(instanceIndex).get('position').xyz.toVar("particlePosition");
            const prevVelocity = this.particleBuffer.element(instanceIndex).get('velocity').xyz.toConst("prevVelocity");
            const memoryNode = this.particleBuffer.element(instanceIndex).get('memory');
            const oldMemory = memoryNode.toConst("oldMemory");
            const nerve = this.particleBuffer.element(instanceIndex).get('signal');
            const refractory = this.particleBuffer.element(instanceIndex).get('refractory');
            const oldSignal=nerve.toConst('oldSignal');
            const oldRecovery=refractory.toConst('oldRecovery');
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
            const spinA = cross(this.uniforms.axisA,ra).mul(0.048).sub(ra.mul(0.0018)).mul(wa);
            const spinB = cross(this.uniforms.axisB,rb).mul(0.048).sub(rb.mul(0.0018)).mul(wb);
            const rc = particlePosition.sub(this.uniforms.vortexC).toConst();
            const rd = particlePosition.sub(this.uniforms.vortexD).toConst();
            const wc = float(1).div(float(1).add(rc.dot(rc).div(125))).toConst();
            const wd = float(1).div(float(1).add(rd.dot(rd).div(145))).toConst();
            const spinC = cross(this.uniforms.axisC,rc).mul(0.105).sub(rc.mul(0.003)).mul(wc);
            const spinD = cross(this.uniforms.axisD,rd).mul(0.095).sub(rd.mul(0.003)).mul(wd);
            const center = particlePosition.sub(vec3(this.uniforms.gridSize).mul(0.5));
            // Broad screen-space expansion; keep depth coherent while permitting brief compression.
            const restoring = center.mul(vec3(this.uniforms.gather.mul(-0.0018),this.uniforms.gather.mul(-0.0018),this.uniforms.gather.mul(-0.004).sub(0.004)));
            const boundaryDistance=particlePosition.sub(this.uniforms.visibleMin).min(this.uniforms.visibleMax.sub(particlePosition));
            const spreadFade=boundaryDistance.div(1.8).clamp(0,1);
            const spreadPush=particlePosition.sub(this.uniforms.spreadCenter).mul(this.uniforms.spreadForce).clamp(-0.22,0.22).mul(spreadFade);
            const uv=particlePosition.sub(this.uniforms.visibleMin).div(this.uniforms.visibleMax.sub(this.uniforms.visibleMin).max(.001)).clamp(0,1);
            const tile=uv.mul(7).toConst('compositionTile');
            const ix=int(tile.x.floor()),iy=int(tile.y.floor());
            const ix1=ix.add(1).min(7),iy1=iy.add(1).min(7);
            const lookup=(x,y)=>this.uniforms.compositionField.element(uint(y.mul(8).add(x)));
            const balanceForce=mix(mix(lookup(ix,iy),lookup(ix1,iy),tile.x.fract()),mix(lookup(ix,iy1),lookup(ix1,iy1),tile.x.fract()),tile.y.fract()).toConst('balanceForce');
            const pulseR = particlePosition.sub(this.uniforms.pulseCenter);
            const impulse = pulseR.div(pulseR.length().max(2.0)).mul(this.uniforms.pulse).div(float(1).add(pulseR.dot(pulseR).div(380)));
            const normalizedPosition = particlePosition.div(vec3(this.uniforms.gridSize)).sub(0.5);
            const tideCoord = normalizedPosition.dot(this.uniforms.tideAxis).sub(this.uniforms.tidePhase);
            const tideBand = float(1).sub(tideCoord.abs().mul(5.5)).clamp(0,1).pow(2);
            const tideForce = this.uniforms.tideAxis.mul(tideBand).mul(this.uniforms.tideAmount);
            const phase=this.uniforms.flowPhase;
            // A slowly changing cross-axis flow field. Each component depends on
            // the other two coordinates, avoiding global convergence into a point.
            const filament = vec3(center.y.mul(.14).add(center.z.mul(.09)).add(phase.x).sin(),center.z.mul(.18).sub(center.x.mul(.11)).sub(phase.y).sin(),center.x.mul(.12).add(center.y.mul(.15)).add(phase.z).sin()).mul(this.uniforms.flowStrength);
            const depthBreath=vec3(0,0,center.z.mul(.012).mul(this.uniforms.breath)).mul(spreadFade.z);
            particleVelocity.addAssign(spinA.add(spinB).mul(this.uniforms.drive).add(spinC.add(spinD).mul(this.uniforms.detailForce)).add(filament).add(depthBreath).add(impulse).add(tideForce).add(restoring).add(spreadPush).add(this.uniforms.drift).add(balanceForce).mul(this.uniforms.dt));

            const cellIndex =  ivec3(particlePosition).sub(1).toConst("cellIndex");
            const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");

            const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
            const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
            const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
            const weights = array([w0,w1,w2]).toConst("weights");

            const B = mat3(0).toVar("B");
            const sampledDensity=float(0).toVar('sampledDensity');
            const sampledLight=float(0).toVar('sampledLight');
            Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({gx}) => {
                Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({gy}) => {
                    Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({gz}) => {
                        const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
                        const cellX = cellIndex.add(ivec3(gx,gy,gz)).toConst();
                        const cellDist = vec3(cellX).add(0.5).sub(particlePosition).toConst("cellDist");
                        const cellPtr = getCellPtr(cellX);

                        const gv=this.cellBufferF.element(cellPtr).toConst('gridSample');
                        const weightedVelocity = gv.xyz.mul(weight).toConst("weightedVelocity");
                        sampledDensity.addAssign(gv.w.mul(weight));
                        If(this.uniforms.fieldShadows.greaterThan(0.01),()=>{
                            sampledLight.addAssign(this.lightField.element(cellPtr).mul(weight));
                        });
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

            If(this.uniforms.fastPressure.greaterThan(0.5),()=>{
                particleDensity.assign(mix(particleDensity,sampledDensity,0.09));
                densitySlot.assign(particleDensity);
            });
            const illumination=this.particleBuffer.element(instanceIndex).get('illumination');
            const shaded=mix(float(1),sampledLight.clamp(.15,1),this.uniforms.fieldShadows);
            illumination.assign(mix(illumination,shaded,.16));
            const dist = cross(this.uniforms.mouseRayDirection, particlePosition.mul(vec3(this.uniforms.screenScale,1,0.65)).sub(this.uniforms.mouseRayOrigin)).length()
            const force = dist.mul(0.1).oneMinus().max(0.0).pow(2);
            //particleVelocity.assign(mix(particleVelocity, this.uniforms.mouseForce.mul(6), force));
            // Pointer forces operate across the visible depth, not a single surface.
            const screenUnits=vec3(this.uniforms.screenScale,this.uniforms.screenScaleY,0);
            const segment=this.uniforms.pointer.sub(this.uniforms.pointerPrevious).mul(screenUnits);
            const fromStart=particlePosition.sub(this.uniforms.pointerPrevious).mul(screenUnits);
            const along=fromStart.dot(segment).div(segment.dot(segment).max(0.001)).clamp(0,1);
            const pOffset=fromStart.sub(segment.mul(along));
            const pDist = pOffset.length().max(0.18);
            const pUnit = pOffset.div(pDist).mul(vec3(float(1).div(this.uniforms.screenScale),float(1).div(this.uniforms.screenScaleY),0));
            const influence = float(1).sub(pDist.div(11.5).pow(2)).clamp(0,1).pow(2);
            const delta = this.uniforms.pointerDelta;
            const dragLength=segment.length().toConst('dragLength');
            const dragUnit=segment.div(dragLength.max(0.001)).mul(vec3(float(1).div(this.uniforms.screenScale),float(1).div(this.uniforms.screenScaleY),0));
            const tangent=vec3(pUnit.y.negate(),pUnit.x,0);
            const dragAmount=dragLength.mul(0.26).clamp(0,.88);
            const dragKick=dragUnit.mul(.94).add(pUnit.mul(.48)).add(tangent.mul(.23)).mul(influence).mul(dragAmount).mul(this.uniforms.pointerDrag).toConst('dragKick');
            particleVelocity.addAssign(dragKick);
            particleVelocity.addAssign(pUnit.mul(influence).mul(this.uniforms.pointerActive).mul(this.uniforms.dt).mul(0.18));
            const clickOffset = particlePosition.sub(this.uniforms.clickCenter).mul(vec3(this.uniforms.screenScale,this.uniforms.screenScaleY,0));
            const clickDist = clickOffset.length().max(0.18);
            const clickDir = clickOffset.div(clickDist).mul(vec3(float(1).div(this.uniforms.screenScale),float(1).div(this.uniforms.screenScaleY),0));
            const clickWeight = float(1).sub(clickDist.div(11.5).pow(2)).clamp(0,1).pow(2);
            const clickKick=clickDir.mul(clickWeight).mul(this.uniforms.clickImpulse).toConst('clickKick');
            particleVelocity.addAssign(clickKick.mul(1.05));
            // Apply a bounded positional impulse as well as momentum. This makes
            // the first rendered frame visibly respond even at a slow solver dt.
            const directOffset=clickKick.mul(1.15).add(dragKick.mul(.65)).toConst('directOffset');
            // Immediate small displacement followed by a short, travelling pressure
            // ripple; no prolonged pushing of the whole field.
            const rippleAge=this.uniforms.rippleAge;
            const rippleLife=float(1).sub(rippleAge.div(1.35)).clamp(0,1);
            const rippleRadius=rippleAge.mul(10.5).add(1.0);
            const rippleBand=float(1).sub(clickDist.sub(rippleRadius).abs().div(3.2)).clamp(0,1).pow(2);
            const rippleForce=clickDir.mul(rippleBand.mul(rippleLife).mul(.42));
            particleVelocity.addAssign(rippleForce.mul(this.uniforms.dt));
            const np=nervePos(particlePosition).toConst('nerveCell');
            const incoming=this.nerveNearby.element(nerveIndex(np)).toConst('incomingSignal');
            const sourceR=particlePosition.sub(this.uniforms.nerveSource);
            const source=float(1).sub(sourceR.length().div(10)).clamp(0,1).mul(this.uniforms.nerveStrength);
            const contactSignal=influence.mul(this.uniforms.pointerActive).mul(.38).add(clickWeight.mul(this.uniforms.pointerPulse).mul(.24)).add(rippleBand.mul(rippleLife).mul(.12));
            const rareR=particlePosition.sub(this.uniforms.rareCenter);
            const rareDir=rareR.div(rareR.length().max(2));
            const rareWeight=float(1).div(float(1).add(rareR.dot(rareR).div(560)));
            const kind=this.uniforms.rareKind, rare=this.uniforms.rareStrength;
            const resonance=select(kind.equal(1),rare.mul(rareWeight),select(kind.equal(4),rare.mul(oldMemory).mul(rareWeight),float(0)));
            const trigger=incoming.sub(0.14).mul(6.0).clamp(0,1).max(source).max(contactSignal).max(resonance).clamp(0,1).mul(float(1).sub(oldRecovery.mul(1.8)).clamp(0,1));
            const signal=oldSignal.add(trigger.mul(3.4).mul(float(1).sub(oldSignal)).sub(oldSignal.mul(0.83)).mul(this.uniforms.dt)).clamp(0,1).mul(this.uniforms.nervesEnabled);
            const recovery=oldRecovery.add(oldSignal.mul(0.65).sub(oldRecovery.mul(0.12)).mul(this.uniforms.dt)).clamp(0,1).mul(this.uniforms.nervesEnabled);
            nerve.assign(signal);refractory.assign(recovery);
            const twitch=cross(this.uniforms.axisC,sourceR.div(sourceR.length().max(2))).mul(signal.sub(oldSignal).max(0).mul(1.8));
            const lens=rareDir.mul(-0.95).mul(rareWeight);
            const split=this.uniforms.rareAxis.mul(rareR.dot(this.uniforms.rareAxis).mul(0.16).clamp(-1,1)).mul(0.9);
            // Palimpsest: only particles carrying a history are pulled into a brief spiralling recall.
            const echoTangent=cross(this.uniforms.rareAxis,rareDir).mul(.48);
            const echo=rareDir.mul(-.72).add(echoTangent).mul(oldMemory.mul(1.25)).mul(rareWeight);
            const rareForce=select(kind.equal(4),echo,select(kind.equal(2),lens,select(kind.equal(3),split,vec3(0)))).mul(rare);
            particleVelocity.addAssign(twitch.add(rareForce).mul(this.uniforms.dt));
            // A broad soft collision layer prevents planar accumulation.
            const margin=vec3(3.0,3.0,4.0);
            const edgeLow=this.uniforms.visibleMin.add(margin).sub(particlePosition).div(margin).clamp(0,1);
            const edgeHigh=particlePosition.sub(this.uniforms.visibleMax.sub(margin)).div(margin).clamp(0,1);
            const edgeNormal=edgeLow.mul(edgeLow).sub(edgeHigh.mul(edgeHigh));
            particleVelocity.addAssign(edgeNormal.mul(2.4).mul(this.uniforms.dt));
            const outwardLow=particleVelocity.min(0).mul(edgeLow.mul(edgeLow));
            const outwardHigh=particleVelocity.max(0).mul(edgeHigh.mul(edgeHigh));
            particleVelocity.subAssign(outwardLow.add(outwardHigh).mul(.09));
            const boundaryCurl=vec3(edgeNormal.y.mul(particlePosition.z.mul(.16).add(time.mul(.12)).sin()),edgeNormal.x.mul(particlePosition.z.mul(.18).sub(time.mul(.13)).cos()),edgeNormal.x.add(edgeNormal.y).mul(particlePosition.y.mul(.12).sin())).mul(.31);
            particleVelocity.addAssign(boundaryCurl.mul(this.uniforms.dt));
            // Recent disturbance slightly changes local mobility; slowly relaxes back.
            particleVelocity.mulAssign(float(0.994).add(oldMemory.mul(0.004).mul(this.uniforms.memoryEnabled)));
            particleVelocity.mulAssign(particleMass);
            particleVelocity.mulAssign(float(1).min(float(5.2).div(particleVelocity.length().max(0.001))));

            this.particleBuffer.element(instanceIndex).get('C').assign(B.mul(4));
            particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt).add(directOffset));
            // Reflect overshoot instead of projecting multiple particles onto one plane.
            const wallMin=this.uniforms.visibleMin,wallMax=this.uniforms.visibleMax;
            const lo=wallMin.sub(particlePosition).max(0).toConst('wallLo');
            const hi=particlePosition.sub(wallMax).max(0).toConst('wallHi');
            particlePosition.addAssign(lo.sub(hi).mul(1.65));
            If(lo.x.greaterThan(0),()=>{particleVelocity.x.assign(particleVelocity.x.abs().mul(.72).max(.55));});
            If(hi.x.greaterThan(0),()=>{particleVelocity.x.assign(particleVelocity.x.abs().mul(-.72).min(-.55));});
            If(lo.y.greaterThan(0),()=>{particleVelocity.y.assign(particleVelocity.y.abs().mul(.72).max(.55));});
            If(hi.y.greaterThan(0),()=>{particleVelocity.y.assign(particleVelocity.y.abs().mul(-.72).min(-.55));});
            If(lo.z.greaterThan(0),()=>{particleVelocity.z.assign(particleVelocity.z.abs().mul(.72).max(.55));});
            If(hi.z.greaterThan(0),()=>{particleVelocity.z.assign(particleVelocity.z.abs().mul(-.72).min(-.55));});
            particlePosition.assign(clamp(particlePosition,wallMin,wallMax));

            this.particleBuffer.element(instanceIndex).get('position').assign(particlePosition)
            this.particleBuffer.element(instanceIndex).get('velocity').assign(particleVelocity)

            const direction = this.particleBuffer.element(instanceIndex).get('direction');
            // Capsules are unoriented axes: +v and -v are visually identical. Keep
            // the existing hemisphere and freeze orientation when almost stationary.
            const priorAxis=direction.toConst('priorAxis');
            const mag=particleVelocity.length().toConst('axisSpeed');
            If(mag.greaterThan(0.12),()=>{
                const nextAxis=particleVelocity.div(mag.max(0.001));
                const aligned=select(priorAxis.dot(nextAxis).lessThan(0),nextAxis.negate(),nextAxis);
                const rate=mag.sub(0.12).div(0.8).clamp(0,1).mul(0.12).add(0.025);
                const smoothed=mix(priorAxis,aligned,rate);
                direction.assign(smoothed.div(smoothed.length().max(0.001)));
            });

            // Soft-knee speed normalization preserves gradients even during fast impacts.
            const den = particleDensity.div(this.uniforms.restDensity).clamp(0,2.0);
            const rawSpeed = particleVelocity.length().div(this.uniforms.speedRef.max(0.25));
            const speed = rawSpeed.div(rawSpeed.add(0.58)).clamp(0,1);
            const accel = particleVelocity.sub(prevVelocity).length().mul(1.8).clamp(0,1);
            const heading = particleVelocity.x.div(particleVelocity.length().max(0.001));
            const contact = influence.mul(this.uniforms.pointerActive).mul(.45).add(clickWeight.mul(this.uniforms.pointerPulse).mul(.10));
            const excitation = accel.mul(0.22).add(contact).add(tideBand.mul(this.uniforms.tideAmount.abs()).mul(0.15)).clamp(0,1);
            const retained=oldMemory.mul(float(1).sub(this.uniforms.dt.mul(0.004))).clamp(0,1);
            const memory=retained.add(excitation.mul(this.uniforms.dt).mul(0.08).mul(float(1).sub(retained))).clamp(0,1).mul(this.uniforms.memoryEnabled);
            memoryNode.assign(memory);
        })().compute(1);
        this.kernels.sample = Fn(() => {
            const i = instanceIndex.mul(this.uniforms.sampleStride).add(this.uniforms.sampleOffset);
            const p = this.particleBuffer.element(i);
            this.telemetry.element(instanceIndex).assign(vec4(p.get('position'),p.get('density')));
            this.telemetry.element(instanceIndex.add(uint(512))).assign(vec4(p.get('velocity'),p.get('signal')));
        })().compute(512);
    }

    async observe() {
        this.uniforms.sampleOffset.value=Math.floor(Math.random()*Math.max(1,this.uniforms.sampleStride.value));
        await this.renderer.computeAsync(this.kernels.sample);
        const a = new Float32Array(await this.renderer.getArrayBufferAsync(this.telemetry.value));
        const mean = new THREE.Vector3(), size = this.gridSize;
        let density=0, density2=0, speed=0, speed2=0, edge=0, spread=0, signal=0, n=0; const hist=new Array(64).fill(0),sides=[0,0,0,0],regions=Array.from({length:64},()=>({speed:0,signal:0,vx:0,vy:0}));
        const lo=this.uniforms.visibleMin.value,hi=this.uniforms.visibleMax.value;
        for(let i=0;i<512;i++){
            const j=i*4,k=(512+i)*4;
            const x=a[j]/size.x,y=a[j+1]/size.y,z=a[j+2]/size.z;
            if(!Number.isFinite(x+y+z+a[j+3]+a[k]+a[k+1]+a[k+2]))continue;
            mean.x+=x;mean.y+=y;mean.z+=z;
            const d=a[j+3]/Math.max(conf.restDensity,0.001),s=Math.hypot(a[k],a[k+1],a[k+2]);
            density+=d;density2+=d*d;speed+=s;speed2+=s*s;signal+=a[k+3];
            const xx=(a[j]-lo.x)/Math.max(.001,hi.x-lo.x),yy=(a[j+1]-lo.y)/Math.max(.001,hi.y-lo.y);
            const bx=Math.min(7,Math.max(0,Math.floor(xx*8))),by=Math.min(7,Math.max(0,Math.floor(yy*8)));const tileIndex=by*8+bx;hist[tileIndex]++;const region=regions[tileIndex];region.speed+=s;region.signal+=a[k+3];region.vx+=a[k];region.vy+=a[k+1];
            if(xx<.085)sides[0]++;if(xx>.915)sides[1]++;if(yy<.085)sides[2]++;if(yy>.915)sides[3]++;
            edge+=Math.min(xx,1-xx,yy,1-yy)<.085?1:0;n++;
        }
        if(n<480)return null;
        mean.divideScalar(n);
        let spreadX=0,spreadY=0,spreadZ=0;
        for(let i=0;i<512;i++){
            const j=i*4,x=a[j]/size.x,y=a[j+1]/size.y,z=a[j+2]/size.z;
            if(Number.isFinite(x+y+z)){spreadX+=(x-mean.x)**2;spreadY+=(y-mean.y)**2;spreadZ+=(z-mean.z)**2;spread+=(x-mean.x)**2+(y-mean.y)**2+(z-mean.z)**2;}
        }
        for(let i=0;i<64;i++){const count=Math.max(1,hist[i]);for(const k of ['speed','signal','vx','vy'])regions[i][k]/=count;}
        const distribution=hist.map(x=>x/n);
        const entropy=-distribution.reduce((sum,p)=>sum+(p>0?p*Math.log(p):0),0)/Math.log(64);
        return {mean,density:density/n,speed:speed/n,edge:edge/n,spread:Math.sqrt(spread/n),spreadX:Math.sqrt(spreadX/n),spreadY:Math.sqrt(spreadY/n),spreadZ:Math.sqrt(spreadZ/n),coverage:hist.filter(x=>x>=3).length/64,sides:sides.map(x=>x/n),densityContrast:Math.sqrt(Math.max(0,density2/n-(density/n)**2)),speedContrast:Math.sqrt(Math.max(0,speed2/n-(speed/n)**2)),signal:signal/n,entropy,distribution,regions};
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
        this.uniforms.fastPressure.value=conf.solver==='fast'?1:0;
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
            this.kernels.nerveDeposit.count = particles;
            this.kernels.nerveDeposit.updateDispatchCount();
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
            const kernels=[];
            if(conf.nerves && this.tick%2===0)kernels.push(this.kernels.nerveClear,this.kernels.nerveDeposit,this.kernels.nerveResolve,this.kernels.nerveSpread);
            kernels.push(this.kernels.clearGrid,this.kernels.p2g1);
            if(conf.solver==='classic')kernels.push(this.kernels.p2g2);
            kernels.push(this.kernels.updateGrid);
            if(this.uniforms.fieldShadows.value>0.01 && this.tick%2===0)kernels.push(this.kernels.lightField);
            kernels.push(this.kernels.g2p);this.tick++;
            await this.renderer.computeAsync(kernels);
        }
    }
}

export default mlsMpmSimulator;