import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// KONFIGURATION & GLOBALE VARIABLEN
// ==========================================
const WORLD_SIZE = 10000; // Maximale Ausdehnung der Welt (-5000 bis +5000)
const HALF_WORLD_SIZE = WORLD_SIZE / 2;
const CHUNK_SIZE = 100;    // Größe eines quadratischen Chunks (100x100 Einheiten)
const RENDER_DISTANCE = 3; // Sichtweite in Chunks um den Spieler herum

// Performance-relevante Variablen
let scene, camera, renderer, clock;
let currentChunkX = null;
let currentChunkZ = null;

// Speicherstrukturen zur Vermeidung von Speicherlecks
const loadedChunks = new Map(); // Key: "x,z" -> Value: THREE.Group (enthält Boden + Bäume)
const chunkSeeds = new Map();  // Key: "x,z" -> Festgelegter Seed für deterministische Baumplatzierung

// Asset-Datenbank für GLB-Modelle (Einmaliges Laden, danach Klonen)
const modelPalette = {
    'baum': {
        url: 'baum.glb', // Falls lokal nicht vorhanden, greift der automatische Fallback im Code
        model: null
    }
    // Weitere Modelle können hier nach exakt demselben Schema ergänzt werden:
    // 'stein': { url: 'stein.glb', model: null }
};

// Spieler-Physikvariablen
const player = {
    height: 1.8,
    radius: 0.6,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    speed: 30.0,
    jumpStrength: 12.0,
    canJump: false,
    g: 32.0 // Schwerkraft-Beschleunigung
};

// Tastatur-Eingabestatus
const keys = { w: false, a: false, s: false, d: false, shift: false };

// UI-Doku-Elemente
const ui = {
    fps: document.getElementById('fps-val'),
    posX: document.getElementById('pos-x'),
    posY: document.getElementById('pos-y'),
    posZ: document.getElementById('pos-z'),
    chunk: document.getElementById('chunk-val'),
    loadedChunks: document.getElementById('loaded-chunks-val'),
    loadingScreen: document.getElementById('loading-screen'),
    blocker: document.getElementById('blocker')
};

// FPS-Counter Hilfsvariablen
let fpsFrameCount = 0;
let fpsLastTime = 0;

// ==========================================
// INITIALISIERUNG
// ==========================================
function init() {
    // 1. Clock für frameratenunabhängige Berechnungen
    clock = new THREE.Clock();

    // 2. Szene & Nebel (Sichtbegrenzung zur Performance-Steigerung)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7ec0ee); // Blauer Himmel
    // Nebel beginnt ab 150 Einheiten und blendet bei 300 Einheiten komplett aus
    scene.fog = new THREE.FogExp2(0x7ec0ee, 0.005);

    // 3. Kamera (FPS-Perspektive)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Startposition im Zentrum der Welt, leicht über dem Boden stehend
    camera.position.set(0, player.height, 0);

    // 4. Renderer optimiert für Chromebooks (schwache GPUs)
    renderer = new THREE.WebGLRenderer({ 
        antialias: false, // Deaktiviert für signifikanten Performance-Schub auf integrierten GPUs
        powerPreference: "high-performance",
        precision: "mediump" // Reduziert mathematische Präzision für schnellere Shader-Berechnungen
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Begrenzung auf max 2x Retinaskalierung
    
    // Performance-Flags aktivieren
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ressourcenschonende, weiche Schatten
    
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 5. Beleuchtung (Tageslicht)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(100, 200, 50);
    sunLight.castShadow = true;
    
    // Schatten-Auflösung optimiert für Mobilprozessoren/Chromebooks
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    
    // Orthografische Schattenbox eng um das Sichtfeld schnüren
    const d = 150;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // 6. Steuerung, Event-Listener & Fenstergrößenänderung
    setupControls();
    window.addEventListener('resize', onWindowResize);

    // 7. Asset-Lade-Pipeline starten
    loadAssets(() => {
        // Callback: Sobald alle Modelle bereitstehen, entfernen wir den Ladebildschirm
        ui.loadingScreen.style.opacity = 0;
        setTimeout(() => ui.loadingScreen.style.display = 'none', 500);
        
        // Erste Chunk-Berechnung initial erzwingen
        updateChunks();
        
        // Spielschleife starten
        fpsLastTime = performance.now();
        animate();
    });
}

// ==========================================
// ASSET LOADER PIPELINE (Sicheres Klonen)
// ==========================================
function loadAssets(onComplete) {
    const loader = new GLTFLoader();
    const keys = Object.keys(modelPalette);
    let loadedCount = 0;

    if (keys.length === 0) {
        onComplete();
        return;
    }

    keys.forEach(key => {
        loader.load(
            modelPalette[key].url,
            (gltf) => {
                // Erfolgreich geladen: Das Wurzelobjekt optimieren und einfrieren
                const root = gltf.scene;
                root.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        // Performance-Optimierung: Geometrien im GPU-Speicher fixieren
                        if (child.geometry) child.geometry.computeVertexNormals();
                    }
                });
                
                modelPalette[key].model = root;
                checkProgress();
            },
            undefined,
            (error) => {
                console.warn(`Modell '${modelPalette[key].url}' nicht gefunden. Generiere synthetischen Ersatzbaum...`);
                // Robustheit: Wenn die .glb Datei (noch) fehlt, bauen wir prozeduralen Ersatz
                modelPalette[key].model = createProceduralTreeFallback();
                checkProgress();
            }
        );
    });

    function checkProgress() {
        loadedCount++;
        if (loadedCount === keys.length) {
            onComplete();
        }
    }
}

// Generiert ein valides Drei-Körper-Mesh, falls baum.glb nicht auf dem Server liegt
function createProceduralTreeFallback() {
    const treeGroup = new THREE.Group();
    
    // Stamm
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 3, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Krone
    const leavesGeo = new THREE.ConeGeometry(1.5, 4, 5);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.6 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 4;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    treeGroup.add(leaves);

    return treeGroup;
}

// ==========================================
// CHUNK MANAGEMENT SYSTEM
// ==========================================
function updateChunks() {
    // Ermitteln, in welchem Chunk sich die Kamera aktuell befindet
    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);

    // Nur neu aufbauen, wenn der Spieler eine Chunk-Grenze überschritten hat
    if (cx !== currentChunkX || cz !== currentChunkZ) {
        currentChunkX = cx;
        currentChunkZ = cz;

        const visibleChunkKeys = new Set();

        // Alle theoretisch sichtbaren Chunks innerhalb der Render-Distanz berechnen
        for (let xOffset = -RENDER_DISTANCE; xOffset <= RENDER_DISTANCE; xOffset++) {
            for (let zOffset = -RENDER_DISTANCE; zOffset <= RENDER_DISTANCE; zOffset++) {
                const targetX = currentChunkX + xOffset;
                const targetZ = currentChunkZ + zOffset;
                
                // Weltgrenzen-Prüfung (Keine Chunks außerhalb der 10k x 10k Map erzeugen)
                const chunkMinX = targetX * CHUNK_SIZE;
                const chunkMinZ = targetZ * CHUNK_SIZE;
                if (chunkMinX < -HALF_WORLD_SIZE || chunkMinX >= HALF_WORLD_SIZE ||
                    chunkMinZ < -HALF_WORLD_SIZE || chunkMinZ >= HALF_WORLD_SIZE) {
                    continue; 
                }

                const chunkKey = `${targetX},${targetZ}`;
                visibleChunkKeys.add(chunkKey);

                // Wenn der Chunk noch nicht existiert, instanziieren wir ihn neu
                if (!loadedChunks.has(chunkKey)) {
                    buildChunk(targetX, targetZ, chunkKey);
                }
            }
        }

        // Garbage Collector: Entferne alle Chunks aus der Szene, die zu weit weg sind
        for (const [key, chunkGroup] of loadedChunks.entries()) {
            if (!visibleChunkKeys.has(key)) {
                scene.remove(chunkGroup);
                
                // Tiefenstrukturiertes Entfernen der Geometrien zur RAM-Entlastung
                chunkGroup.traverse(object => {
                    if (object.isMesh) {
                        // Da die zugrundeliegenden Geometrien des geklonten Baums im Master-Modell liegen,
                        // löschen wir hier gezielt nur die individuellen Mesh-Referenzen des Chunks.
                        if (object.geometry && object.parent.name === "boden") {
