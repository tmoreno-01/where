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

        this.material = new THREE.MeshPhysicalNodeMaterial({
            metalness: 0.0, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08,
            ior: 1.52, specularIntensity: 1
        });

        this.uniforms.size = uniform(1);
        this.uniforms.chamberX = uniform(1);
        this.uniforms.chamberY = uniform(1);
        this.uniforms.finishRoughness=uniform(.15);
        this.uniforms.finishMetalness=uniform(.04);
        this.uniforms.coat=uniform(1.0);
        this.uniforms.coatRoughness=uniform(.075);
        this.uniforms.cardStrength=uniform(.82);
        this.uniforms.cardSharpness=uniform(1.0);
        const vAo = varying(0, "vAo");
        const vIllumination=varying(float(1),"vIllumination");
        const vNormal = varying(vec3(0,0,1), "vMatterNormal");
        const vPigment=varying(vec3(0),"vMatterPigment");
        const vDensity=varying(float(0),"vMatterDensity");
        const vMemory=varying(float(0),"vMatterMemory");
        const vEnergy=varying(float(0),"vMatterEnergy");
        const vSignal=varying(float(0),"vMatterSignal");

        const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
        this.material.positionNode = Fn(() => {
            const particlePosition = particle.get("position");
            const particleDensity = particle.get("density");
            const particleDirection = particle.get("direction");

            //return attribute("position").xyz.mul(10).add(vec3(32,32,0));
            //return attribute("position").xyz.mul(0.1).add(positionAttribute.mul(vec3(1,1,0.4)));
            const mat = spheres ? null : calcLookAtMatrix(particleDirection.xyz);
            const stretch=particle.get('velocity').length().mul(.28).clamp(0,1).mul(.55).add(.82);
            const localNormal=spheres||capsules?normalLocal:normalLocal.mul(vec3(1,1,float(1).div(stretch)));
            vNormal.assign(transformNormalToView(spheres?localNormal:mat.mul(localNormal)));
            vPigment.assign(particle.get('color'));
            vDensity.assign(particleDensity.div(this.mlsMpmSim.uniforms.restDensity.max(.001)).clamp(0,2));
            vMemory.assign(particle.get('memory'));
            vEnergy.assign(particle.get('velocity').length().div(this.mlsMpmSim.uniforms.speedRef.max(.25)).clamp(0,2));
            vSignal.assign(particle.get('signal'));
            const shadow=particle.get('illumination').clamp(.15,1);
            vIllumination.assign(shadow);
            vAo.assign(shadow.mul(.43).add(.57).mul(float(1).sub(particlePosition.z.div(95).pow(2).mul(.13))).clamp(.50,1));
            const speed = particle.get('velocity').length().mul(0.28).clamp(0,1);
            const local = attribute("position").xyz;
            const radius = particleDensity.div(this.mlsMpmSim.uniforms.restDensity.max(0.001)).mul(0.22).add(0.78).clamp(0.72,1.12);
            if(spheres) return local.mul(this.uniforms.size).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,this.uniforms.chamberY,0.65)));
            if(capsules) return mat.mul(local.mul(this.uniforms.size)).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,this.uniforms.chamberY,0.65)));
            return mat.mul(local.mul(vec3(1,1,speed.mul(0.55).add(0.82))).mul(this.uniforms.size)).mul(radius).add(particlePosition.mul(vec3(this.uniforms.chamberX,this.uniforms.chamberY,0.65)));
        })();
        const n=normalize(vNormal);
        const bounce=mix(vec3(.52,.65,.86),vec3(1),vIllumination);
        this.material.colorNode=vPigment.mul(bounce).mul(vIllumination.mul(.68).add(.32));
        this.material.aoNode=vAo;
        this.material.normalNode=n;
        this.material.clearcoatNormalNode=n;
        this.material.roughnessNode=this.uniforms.finishRoughness.add(vDensity.mul(.018)).sub(vMemory.mul(.018)).clamp(.065,.78);
        this.material.metalnessNode=this.uniforms.finishMetalness;
        this.material.clearcoatNode=this.uniforms.coat;
        this.material.clearcoatRoughnessNode=this.uniforms.coatRoughness;
        // Analytic reflection cards for the orthographic studio. Unlike the diffuse
        // pigment, these remain crisp on tiny sub-pixel geometry. No extra render pass.
        const reflected=vec3(0,0,-1).reflect(n);
        const card=(cx,cy,cz,sx,sy)=>{
            const dx=reflected.x.sub(cx).div(sx),dy=reflected.y.sub(cy).div(sy);
            const envelope=float(1).div(float(1).add(dx.mul(dx).add(dy.mul(dy)).mul(this.uniforms.cardSharpness).pow(2)));
            return envelope.mul(float(1).sub(reflected.z.sub(cz).abs().mul(1.25)).clamp(0,1));
        };
        const key=card(-.52,.53,.67,.12,.38);
        const strip=card(.72,.18,.67,.07,.47);
        const top=card(.04,.86,.50,.42,.085);
        const fresnel=float(.24).add(float(.76).mul(float(1).sub(n.z.abs()).pow(3)));
        const reflectedTint=mix(vec3(1),vPigment.mul(.82).add(.24),this.uniforms.finishMetalness);
        const cards=vec3(1,.93,.82).mul(key).add(vec3(.56,.75,1).mul(strip.mul(.80))).add(vec3(.83,.91,1).mul(top.mul(.50)));
        const polish=cards.mul(reflectedTint).mul(fresnel).mul(this.uniforms.cardStrength).mul(vIllumination.mul(.63).add(.37));
        this.material.emissiveNode=vPigment.mul(vEnergy.mul(.018).add(vSignal.mul(.055))).mul(vIllumination.mul(.65).add(.35)).add(polish);

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

    setFinish(finish){
        const p=finish==='metallic'?[.11,.92,.10,.10,1.55,1.1]:finish==='matte'?[.60,.02,0,.55,.025,.25]:[.15,.04,1,.075,.82,1.0];
        const keys=['finishRoughness','finishMetalness','coat','coatRoughness','cardStrength','cardSharpness'];
        keys.forEach((k,i)=>{this.uniforms[k].value=p[i];});
    }

    setChamberScale(x,y=1){this.uniforms.chamberX.value=x;this.uniforms.chamberY.value=y;this.object.position.x=-conf.gridX*x/128;this.object.position.y=.5-conf.gridY*y/128;}

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