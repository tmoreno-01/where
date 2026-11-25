import * as THREE from "three/webgpu";
import {Fn, attribute, triNoise3D, time, vec3, vec4, float, varying,instanceIndex,mix,normalize,cross,mat3,normalLocal,transformNormalToView,mx_hsvtorgb,mrt,uniform,select} from "three/tsl";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {conf} from "../conf.js";


export const calcLookAtMatrix = /*#__PURE__*/ Fn( ( [ target_immutable ] ) => {
    const target = vec3( target_immutable ).toVar();
    const ww = normalize(target.add(vec3(0.000001,0.000001,0.000001))).toVar();
    // Closed-form stable orthonormal basis (no nearly parallel cross-product).
    const signZ=select(ww.z.greaterThanEqual(0),float(1),float(-1));
    const a=float(-1).div(signZ.add(ww.z));
    const b=ww.x.mul(ww.y).mul(a);
    const uu=vec3(float(1).add(signZ.mul(ww.x.mul(ww.x)).mul(a)),signZ.mul(b),signZ.mul(ww.x).negate());
    const vv=vec3(b,signZ.add(ww.y.mul(ww.y).mul(a)),ww.y.negate());

    return mat3( uu, vv, ww );
} ).setLayout( {
    name: 'calcLookAtMatrix',
    type: 'mat3',
    inputs: [
        { name: 'direction', type: 'vec3' },
    ]
} );

const createRoundedBox = (width, height, depth, radius) => {
    //completely overengineered late night programming lol
    const box = new THREE.BoxGeometry(width - radius*2, height - radius*2, depth - radius*2);
    const epsilon = Math.min(width, height, depth) * 0.01;
    const positionArray = box.attributes.position.array;
    const normalArray = box.attributes.normal.array;
    const indices = [...(box.getIndex().array)];
    const vertices = [];
    const posMap = {};
    const edgeMap = {};
    for (let i=0; i<positionArray.length / 3; i++) {
        const oldPosition = new THREE.Vector3(positionArray[i*3], positionArray[i*3+1], positionArray[i*3+2]);
        positionArray[i*3+0] += normalArray[i*3+0] * radius;
        positionArray[i*3+1] += normalArray[i*3+1] * radius;
        positionArray[i*3+2] += normalArray[i*3+2] * radius;
        const vertex = new THREE.Vector3(positionArray[i*3], positionArray[i*3+1], positionArray[i*3+2]);
        vertex.normal = new THREE.Vector3(normalArray[i*3], normalArray[i*3+1], normalArray[i*3+2]);
        vertex.id = i;
        vertex.faces = [];
        vertex.posHash = oldPosition.toArray().map(v => Math.round(v / epsilon)).join("_");
        posMap[vertex.posHash] = [...(posMap[vertex.posHash] || []), vertex];
        vertices.push(vertex);
    }
    vertices.forEach(vertex => {
        const face = vertex.normal.toArray().map(v => Math.round(v)).join("_");
        vertex.face = face;
        posMap[vertex.posHash].forEach(vertex => { vertex.faces.push(face); } );
    });
    vertices.forEach(vertex => {
        const addVertexToEdgeMap = (vertex, entry) => {
            edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
        }
        vertex.faces.sort();
        const f0 = vertex.faces[0];
        const f1 = vertex.faces[1];
        const f2 = vertex.faces[2];
        const face = vertex.face;
        if (f0 === face || f1 === face) addVertexToEdgeMap(vertex, f0 + "_" + f1);
        if (f0 === face || f2 === face) addVertexToEdgeMap(vertex, f0 + "_" + f2);
        if (f1 === face || f2 === face) addVertexToEdgeMap(vertex, f1 + "_" + f2);
    });

    const addFace = (v0,v1,v2) => {
        const a = v1.clone().sub(v0);
        const b = v2.clone().sub(v0);
        if (a.cross(b).dot(v0) > 0) {
            indices.push(v0.id, v1.id, v2.id);
        } else {
            indices.push(v0.id, v2.id, v1.id);
        }
    }

    Object.keys(posMap).forEach(key => {
        addFace(...posMap[key])
    });

    Object.keys(edgeMap).forEach(key => {
        const edgeVertices = edgeMap[key];
        const v0 = edgeVertices[0];
        edgeVertices.sort((v1,v2) => v1.distanceTo(v0) - v2.distanceTo(v0));
        addFace(...edgeVertices.slice(0,3));
        addFace(...edgeVertices.slice(1,4));
    });

    box.setIndex(indices);
    return box;
}


class ParticleRenderer {
    mlsMpmSim = null;
    object = null;
    bloom = false;
    uniforms = {};

    constructor(mlsMpmSim,shape=conf.shape) {
        const spheres=shape==='spheres',capsules=shape==='capsules';
        this.mlsMpmSim = mlsMpmSim;

        /*const box = new THREE.BoxGeometry(0.7, 0.7,3);
        const cone = new THREE.ConeGeometry( 0.5, 3.0, 8 );
        cone.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI* 0.5, 0, 0)))
        this.geometry =  new THREE.InstancedBufferGeometry().copy(cone);
        console.log(this.geometry);*/

        //const sphereGeometry = BufferGeometryUtils.mergeVertices(new THREE.IcosahedronGeometry(0.5, 1));
        const boxGeometry = BufferGeometryUtils.mergeVertices(new THREE.BoxGeometry(6.4, 6.4,25), 3.0);
        boxGeometry.attributes.position.array = boxGeometry.attributes.position.array.map(v => v*0.1);
        const roundedBoxGeometry = createRoundedBox(0.64,0.64,2.5,0.10); //BufferGeometryUtils.mergeVertices(new RoundedBoxGeometry(0.7,0.7,3,1,0.1));

        this.defaultIndexCount = roundedBoxGeometry.index.count;
        this.shadowIndexCount = boxGeometry.index.count;

        const mergedGeometry = capsules
            ? new THREE.CapsuleGeometry(0.23,1.90,2,conf.maxParticles>=200000?6:8,1).rotateX(Math.PI/2)
            : spheres
                ? new THREE.SphereGeometry(0.61,conf.maxParticles>=200000?7:9,conf.maxParticles>=200000?5:6)
                : BufferGeometryUtils.mergeGeometries([roundedBoxGeometry, boxGeometry]);
        if(shape!=='rods'){this.defaultIndexCount=mergedGeometry.index.count;this.shadowIndexCount=this.defaultIndexCount;}

        this.geometry = new THREE.InstancedBufferGeometry().copy(mergedGeometry);

        this.geometry.setDrawRange(0, this.defaultIndexCount);
        this.geometry.instanceCount = this.mlsMpmSim.numParticles;

        this.material = new THREE.MeshStandardNodeMaterial({
            metalness: 0.48,
            roughness: 0.30,
            //iridescence: 1.0,
        });

        this.uniforms.size = uniform(1);
        this.uniforms.chamberX = uniform(1);
        this.uniforms.finishRoughness=uniform(.14);
        this.uniforms.finishMetalness=uniform(.24);
        const vAo = varying(0, "vAo");
        const vIllumination=varying(float(1),"vIllumination");
        const vNormal = varying(vec3(0), "v_normalView");

        const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
        this.material.positionNode = Fn(() => {
            const particlePosition = particle.get("position");
            const particleDensity = particle.get("density");
            const particleDirection = particle.get("direction");

            //return attribute("position").xyz.mul(10).add(vec3(32,32,0));
            //return attribute("position").xyz.mul(0.1).add(positionAttribute.mul(vec3(1,1,0.4)));
            const mat = spheres ? null : calcLookAtMatrix(particleDirection.xyz);
            if(!spheres)vNormal.assign(transformNormalToView(mat.mul(normalLocal)));
            const shadow=particle.get('illumination').clamp(.15,1);
            vIllumination.assign(shadow);
            vAo.assign(shadow.mul(float(1).sub(particlePosition.z.div(95).pow(2).mul(.23))).clamp(.12,1));
            const speed = particle.get('velocity').length().mul(0.28).clamp(0,1);
            const local = attribute("position").xyz;
            const radius = particleDensity.div(this.mlsMpmSim.uniforms.restDensity.max(0.001)).mul(0.22).add(0.78).clamp(0.72,1.12);
            if(spheres) return local.mul(this.uniforms.size).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,1,0.65)));
            if(capsules) return mat.mul(local.mul(this.uniforms.size)).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,1,0.65)));
            return mat.mul(local.mul(vec3(1,1,speed.mul(0.55).add(0.82))).mul(this.uniforms.size)).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,1,0.65)));
        })();
        // Retain a cool coloured bounce in dark regions while reducing diffuse light.
        const bounce=mix(vec3(.40,.53,.77),vec3(1),vIllumination);
        this.material.colorNode = particle.get("color").mul(bounce).mul(vIllumination.mul(.60).add(.40));
        this.material.aoNode = vAo;
        if(!spheres)this.material.normalNode = normalize(vNormal);
        this.material.roughnessNode = this.uniforms.finishRoughness.add(particle.get('density').div(this.mlsMpmSim.uniforms.restDensity.max(0.001)).clamp(0,2).mul(0.025)).sub(particle.get('memory').mul(0.035)).clamp(0.10,0.78);
        this.material.metalnessNode=this.uniforms.finishMetalness;
        this.material.emissiveNode = particle.get('color').mul(particle.get('velocity').length().div(this.mlsMpmSim.uniforms.speedRef.max(0.25)).mul(0.035).clamp(0.0,0.055).add(particle.get('signal').mul(0.11))).mul(vIllumination.mul(.65).add(.35));

        //this.material.fragmentNode = vec4(0,0,0,1);
        //this.material.envNode = vec3(0.5);

        this.object = new THREE.Mesh(this.geometry, this.material);
        this.object.onBeforeShadow = () => { if(shape==='rods')this.geometry.setDrawRange(this.defaultIndexCount, Infinity); }
        this.object.onAfterShadow = () => { this.geometry.setDrawRange(0, this.defaultIndexCount); }


        this.object.frustumCulled = false;

        const s = (1/64);
        this.object.position.set(-conf.gridX*0.5*s,0,0);
        this.object.scale.set(s,s,s);
        this.object.castShadow = conf.quality!=='mobile';
        this.object.receiveShadow = true;
    }

    setFinish(finish){const p=finish==='metallic'?[.19,.78]:finish==='matte'?[.48,.10]:[.14,.24];this.uniforms.finishRoughness.value=p[0];this.uniforms.finishMetalness.value=p[1];}

    setChamberScale(x){this.uniforms.chamberX.value=x;this.object.position.x=-conf.gridX*x/128;}

    update() {
        const { particles, bloom, actualSize } = conf;
        this.uniforms.size.value = actualSize;
        this.geometry.instanceCount = particles;

        if (bloom !== this.bloom) {
            this.bloom = bloom;
            this.material.mrtNode = bloom ? mrt( {
                bloomIntensity: 1
            } ) : null;
        }
    }
}
export default ParticleRenderer;