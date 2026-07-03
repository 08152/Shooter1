// ================= SCENE =================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87cfff);
scene.fog = new THREE.Fog(0x87cfff,40,200);

// CAMERA
const camera = new THREE.PerspectiveCamera(
75,
innerWidth/innerHeight,
0.1,
5000
);

// RENDERER
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHT
scene.add(new THREE.AmbientLight(0xffffff,1.2));

const sun=new THREE.DirectionalLight(0xffffff,1.2);
sun.position.set(20,40,10);
scene.add(sun);

// ================= GROUND =================
const ground=new THREE.Mesh(
new THREE.PlaneGeometry(10000,10000),
new THREE.MeshStandardMaterial({color:0x3fa34d})
);

ground.rotation.x=-Math.PI/2;
scene.add(ground);

// ================= PLAYER =================
const player=new THREE.Object3D();
scene.add(player);

player.add(camera);
camera.position.set(0,2.2,0);

// ================= INPUT =================
const keys={};

document.addEventListener("keydown",e=>{
keys[e.key.toLowerCase()]=true;
});

document.addEventListener("keyup",e=>{
keys[e.key.toLowerCase()]=false;
});

// ================= LOOK =================
let yaw=0;
let pitch=0;

document.addEventListener("mousemove",e=>{

if(document.pointerLockElement!==document.body)return;

yaw-=e.movementX*0.002;
pitch-=e.movementY*0.002;

pitch=Math.max(-1.2,Math.min(1.2,pitch));

player.rotation.y=yaw;
camera.rotation.x=pitch;

});

document.body.addEventListener("click",()=>{
document.body.requestPointerLock();
});

// ================= PHYSICS =================
let velY=0;
let onGround=true;

// ================= MOVE =================
function move(){

const speed=0.18;

let dir=new THREE.Vector3();

if(keys.w)dir.z--;
if(keys.s)dir.z++;
if(keys.a)dir.x--;
if(keys.d)dir.x++;

dir.normalize();

const forward=new THREE.Vector3(0,0,-1).applyEuler(player.rotation);
forward.y=0;
forward.normalize();

const right=new THREE.Vector3()
.crossVectors(forward,new THREE.Vector3(0,1,0))
.negate();

player.position.addScaledVector(forward,dir.z*speed);
player.position.addScaledVector(right,dir.x*speed);

}

// ================= GRAVITY =================
window.addEventListener("keydown",e=>{

if(e.code==="Space" && onGround){

velY=0.25;
onGround=false;

}

});

function gravity(){

velY-=0.015;
player.position.y+=velY;

if(player.position.y<=0){

player.position.y=0;
velY=0;
onGround=true;

}

}

// ================= GLB LOADER =================
const loader=new THREE.GLTFLoader();
let collidables=[];

function addModel(url,x,y,z,scale=1){

loader.load(url,gltf=>{

const obj=gltf.scene;

obj.scale.set(scale,scale,scale);
obj.position.set(x,y,z);

obj.userData.box=new THREE.Box3();

scene.add(obj);

collidables.push(obj);

});

}

// ================= COLLISION =================
function getBox(pos){

return new THREE.Box3().setFromCenterAndSize(
new THREE.Vector3(pos.x,pos.y+1,pos.z),
new THREE.Vector3(.6,1.8,.6)
);

}

function collision(){

const speed=.18;

let dir=new THREE.Vector3();

if(keys.w)dir.z--;
if(keys.s)dir.z++;
if(keys.a)dir.x--;
if(keys.d)dir.x++;

dir.normalize();

const forward=new THREE.Vector3(0,0,-1).applyEuler(player.rotation);
forward.y=0;
forward.normalize();

const right=new THREE.Vector3()
.crossVectors(forward,new THREE.Vector3(0,1,0))
.negate();

const move=new THREE.Vector3();

move.addScaledVector(forward,dir.z*speed);
move.addScaledVector(right,dir.x*speed);

const next=player.position.clone().add(move);

const box=getBox(next);

let blocked=false;

for(const obj of collidables){

obj.userData.box.setFromObject(obj);

if(box.intersectsBox(obj.userData.box)){

blocked=true;
break;

}

}

if(!blocked)
player.position.copy(next);

}

// ================= CHUNKS =================
const CHUNK=200;
const DIST=3;

const chunks=new Map();

function key(x,z){
return x+","+z;
}

function spawnChunk(cx,cz){

const k=key(cx,cz);

if(chunks.has(k))return;

const group=new THREE.Group();

for(let i=0;i<6;i++){

const x=cx*CHUNK+(Math.random()-.5)*CHUNK;
const z=cz*CHUNK+(Math.random()-.5)*CHUNK;

addModel("baum.glb",x,0,z,1.5);

}

scene.add(group);

chunks.set(k,group);

}

function updateChunks(){

const cx=Math.floor(player.position.x/CHUNK);
const cz=Math.floor(player.position.z/CHUNK);

const active=new Set();

for(let x=cx-DIST;x<=cx+DIST;x++){

for(let z=cz-DIST;z<=cz+DIST;z++){

active.add(key(x,z));
spawnChunk(x,z);

}

}

for(const k of chunks.keys()){

if(!active.has(k)){

chunks.delete(k);

}

}

}

// ================= OBJECTS =================
addModel("barrier.glb",0,-50,0,1);
addModel("tree.glb",-10,0,-10,1);
addModel("tree.glb",10,0,10,1);
addModel("bush.glb",20,0,5,1);

// ================= LOOP =================
function animate(){

requestAnimationFrame(animate);

move();
collision();
gravity();
updateChunks();

document.getElementById("coords").innerText=
`X:${player.position.x.toFixed(2)}
Y:${player.position.y.toFixed(2)}
Z:${player.position.z.toFixed(2)}`;

renderer.render(scene,camera);

}

animate();

// ================= RESIZE =================
window.addEventListener("resize",()=>{

camera.aspect=innerWidth/innerHeight;
camera.updateProjectionMatrix();

renderer.setSize(innerWidth,innerHeight);

});
