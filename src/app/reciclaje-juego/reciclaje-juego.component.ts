import { Component, ElementRef, AfterViewInit, ViewChild, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader, OrbitControls } from 'three-stdlib';
import { CommonModule } from '@angular/common';

type TrashType = 'organico' | 'reciclable' | 'general';

interface TrashItem {
  object: THREE.Object3D;
  type: TrashType;
  baseScale: number;   
  labelSprite?: THREE.Sprite;
}


interface Bin {
  object: THREE.Object3D;
  type: TrashType;
}

type GameState = 'playing' | 'win' | 'lose';

@Component({
  selector: 'app-reciclaje-juego',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './reciclaje-juego.component.html',
  styleUrl: './reciclaje-juego.component.css'
})
export class ReciclajeJuegoComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;

  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  player!: THREE.Object3D;
  playerMixer!: THREE.AnimationMixer;
  walkAction!: THREE.AnimationAction;
  clock = new THREE.Clock();
  loader = new GLTFLoader();
  controls!: OrbitControls;
  pickupSound = new Audio('assets/sounds/pickup.mp3');
  correctSound = new Audio('assets/sounds/correct.mp3');
  wrongSound = new Audio('assets/sounds/wrong.mp3');

  // ⭐ estado de movimiento controlado por teclado
  moveForward = 0; 
  turn = 0;  
  
  // ⭐ Basura / reciclaje
  trashItems: TrashItem[] = [];
  bins: Bin[] = [];
  carryingItem: TrashItem | null = null;

  readonly pickupDistance = 40; // distancia para recoger basura
  readonly binDistance = 70;    // distancia para reciclar en un contenedor

  recycledCount: Record<TrashType, number> = {
    organico: 0,
    reciclable: 0,
    general: 0
  };

  // ⭐ HUD y estado del juego
  score = 0;
  gameState: GameState = 'playing';
  showWinMenu = false;
  showLoseMenu = false;
  hudMessage = '';
showInstructions = false;
showSettings = false;

  private animationId = 0;
  private keyDownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyUpHandler = (e: KeyboardEvent) => this.onKeyUp(e);

  private playSound(sound: HTMLAudioElement): void {
    try {
      sound.currentTime = 0;
      sound.play();
    } catch (e) {
      console.warn('No se pudo reproducir el sonido', e);
    }
  }
toggleInstructions(): void {
  this.showInstructions = !this.showInstructions;
}

toggleSettings(): void {
  this.showSettings = !this.showSettings;
}
ngAfterViewInit(): void {
    this.initScene();
    this.loadPlayerModel();
    this.loadTrashAndBins();

    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);

    this.animate();
  }
  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
    this.renderer?.dispose();
  }

initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa0a0a0);
    this.scene.fog = new THREE.Fog(0xa0a0a0, 200, 1000);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    this.camera.position.set(0, 80, -150);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 200, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    this.scene.add(dirLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshPhongMaterial({ color: 0xC8C8C8, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(2000, 40, 0x000000, 0x000000);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material as any).opacity = 0.2;
    this.scene.add(grid);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.canvasContainer.nativeElement.appendChild(this.renderer.domElement);
    // 👉 OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 30, 0); // punto al que mira la cámara
    this.controls.update();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
 loadPlayerModel(): void {
    this.loader.load(
      'assets/hombre.glb',
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        model.scale.set(30, 30, 30);
        model.position.set(0, 0, 0);

        this.scene.add(model);
        this.player = model;

        this.playerMixer = new THREE.AnimationMixer(model);

        if (gltf.animations && gltf.animations.length > 0) {
          this.walkAction = this.playerMixer.clipAction(gltf.animations[0]);
          this.walkAction.play();
          this.walkAction.paused = true;
          this.walkAction.loop = THREE.LoopRepeat;
        } else {
          console.warn('El modelo no trae animaciones');
        }
      },
      undefined,
      (err) => {
        console.error('Error cargando el jugador:', err);
      }
    );
  }

// ⭐ Carga contenedores + objetos de basura
 loadTrashAndBins(): void {
  this.loadBins();   // Carga los 3 botes desde archivos separados
  this.loadTrash();  // Carga las basuras desde mecato.glb
  this.loadExtraTrashModels(); 
}
private loadBins(): void {
  // Archivo, tipo y posición de cada bote
  const binConfigs: { file: string; type: TrashType; position: THREE.Vector3 }[] = [
    {
      file: 'assets/green.glb',
      type: 'organico',
      position: new THREE.Vector3(-150, 0, 200)
    },
    {
      file: 'assets/black.glb',
      type: 'general',
      position: new THREE.Vector3(0, 0, 200)
    },
    {
      file: 'assets/white.glb',
      type: 'reciclable',
      position: new THREE.Vector3(150, 0, 200)
    }
  ];

  binConfigs.forEach((cfg) => {
    this.loader.load(
      cfg.file,
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Ajusta el scale si salen muy pequeños o muy grandes
        model.scale.set(30, 30, 30);
        model.position.copy(cfg.position);

        this.scene.add(model);

        this.bins.push({
          object: model,
          type: cfg.type
        });

        console.log(`Bote cargado desde ${cfg.file}`);
      },
      undefined,
      (err) => {
        console.error(`Error cargando el bote desde ${cfg.file}:`, err);
      }
    );
  });
}
private loadTrash(): void {
  this.loader.load(
    'assets/mecato.glb',
    (gltf) => {
      const root = gltf.scene;

      // Basuras que están dentro de mecato.glb
      const trashConfigs: { name: string; type: TrashType; instances: number; scale: number;  label: string; }[] = [
        { name: 'BANANA', type: 'organico',   instances: 2, scale: 0.003, label: 'Banana' },
        { name: 'BOLSA_DE_PAPAS', type: 'general',    instances: 2 ,scale: 0.1, label: 'Bolsa de Papas' },
        { name: 'BOTELLA_DE_GASEOSA', type: 'reciclable', instances: 2, scale: 0.1, label: ' Gaseosa' },
        { name: 'BOLSA_DE_CHETOS', type: 'general', instances: 2, scale: 0.1, label: 'Chetos' },
        { name: 'BOLSA_DE_CHOCLITOS', type: 'general',   instances: 2, scale: 0.1, label: 'Choclitos' },
        { name: 'BOLSA_DE_MADURITOS', type: 'general', instances: 2, scale: 0.1, label: 'Maduritos' },
        { name: 'LATA_DE_GASEOSA_000', type: 'reciclable', instances: 2, scale: 0.1, label: ' Sprite' },
        { name: 'LATA_DE_GASEOSA_001', type: 'reciclable', instances: 2, scale: 0.1, label: 'Cocacola' },
        { name: 'BOTELLA_DE_VINO', type: 'reciclable', instances: 2, scale: 0.1, label: 'Botella de Vino' },
        { name: 'CAFE', type: 'reciclable', instances: 2, scale: 0.1, label: 'Cafe' },
        { name: 'MANZANA_VERDE', type: 'organico', instances: 2, scale: 0.1, label: 'Manzana Verde' }
      ];

     const areaSize = 400;

      trashConfigs.forEach((cfg) => {
        const original = root.getObjectByName(cfg.name);
        if (!original) {
          console.warn(`No se encontró el modelo de basura "${cfg.name}" dentro de mecato.glb`);
          return;
        }

        for (let i = 0; i < cfg.instances; i++) {
         const trash = original.clone(true);
trash.traverse((child: any) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;
  }
});

// Escala específica
trash.scale.set(cfg.scale, cfg.scale, cfg.scale);

// ⬇️ NUEVO: ajustar altura para que apoye en el piso
const box = new THREE.Box3().setFromObject(trash);
const yOffset = -box.min.y;            // cuánto hay que subirla
trash.position.y += yOffset;

// Label
const labelSprite = this.createLabelSprite(cfg.label, cfg.scale);
const inv = 1 / cfg.scale;
labelSprite.scale.set(20 * inv, 8 * inv, 1);
labelSprite.position.set(0, 25 * inv, 0);
trash.add(labelSprite);

// Posición XZ aleatoria (respetamos la Y que acabamos de ajustar)
const randomX = (Math.random() - 0.5) * 2 * areaSize;
const randomZ = (Math.random() - 0.5) * 2 * areaSize;
trash.position.set(randomX, trash.position.y, randomZ);

this.scene.add(trash);

this.trashItems.push({
  object: trash,
  type: cfg.type,
  baseScale: cfg.scale,
  labelSprite
});
        }
      });
    },
    undefined,
    (err) => {
      console.error('Error cargando mecato.glb:', err);
    }
  );
}
private loadExtraTrashModels(): void {
  const areaSize = 400;

  const extraConfigs: {
    file: string;
    type: TrashType;
    label: string;
    scale: number;
    instances: number;
  }[] = [
    {
      file: 'assets/taoabocas.glb',
      type: 'general',   // (supuesto)
      label: 'Tapabocas',
      scale: 1,
      instances: 2
    },
    {
      file: 'assets/servilleta.glb',
      type: 'general',   // (supuesto)
      label: 'Servilletas',
      scale: 10,
      instances: 4
    }
  ];

 extraConfigs.forEach(cfg => {
  this.loader.load(
    cfg.file,
    (gltf) => {
      console.log('Cargado modelo extra:', cfg.label, gltf);

      const base = gltf.scene;

      // 🔴 DEBUG: forzar color llamativo y asegurarnos que haya mesh
      base.traverse((child: any) => {
        if (child.isMesh) {
          // clonar material para no afectar a otros
          const mat = new THREE.MeshStandardMaterial( { color: 0xF2F2F2  });
          child.material = mat;
        }
      });

      for (let i = 0; i < cfg.instances; i++) {
        const trash = base.clone(true);

        trash.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // ⚠️ para probar, vamos a ponerlos GRANDES
        const debugScale = 5; // prueba 1, 2, 3 si quieres
        trash.scale.set(debugScale, debugScale, debugScale);

        // Ajustar altura para que no queden enterrados
        const box = new THREE.Box3().setFromObject(trash);
        const size = new THREE.Vector3();
        box.getSize(size);
        const yOffset = -box.min.y;
        trash.position.y += yOffset + size.y * 0.05; // un poquito por encima del piso

        // Posición XZ aleatoria
        const randomX = (Math.random() - 0.5) * 2 * areaSize;
        const randomZ = (Math.random() - 0.5) * 2 * areaSize;
        trash.position.set(randomX, trash.position.y, randomZ);

        // Label
        const labelSprite = this.createLabelSprite(cfg.label, debugScale);
        const inv = 1 / debugScale;
        labelSprite.scale.set(20 * inv, 8 * inv, 1);
        labelSprite.position.set(0, 25 * inv, 0);
        trash.add(labelSprite);

        this.scene.add(trash);

        this.trashItems.push({
          object: trash,
          type: cfg.type,
          baseScale: debugScale,
          labelSprite
        });
      }
    },
    undefined,
    err => console.error(`Error cargando ${cfg.file}`, err)
  );
});

}

private createLabelSprite(text: string, baseScale: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  // Fondo tipo nubecita / óvalo
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  const radius = 50;
  const w = canvas.width - 60;
  const h = canvas.height - 60;
  const x = 30;
  const y = 30;
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Texto centrado
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);

  return sprite;
}

// ⭐ Buscar "mano" (si existe) o usar el cuerpo como ancla
  private getHandAnchor(): THREE.Object3D {
    if (!this.player) return this.scene;

    // Intentar buscar un hueso que tenga "Hand" en el nombre (Mixamo, etc.)
    let hand: THREE.Object3D | null = null;
    this.player.traverse((child: any) => {
      if (!hand && child.name && child.name.toLowerCase().includes('hand')) {
        hand = child;
      }
    });

    return hand || this.player;
  }

  private onKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();

    // Si ya ganó o perdió, ignoramos movimiento e interacción
    if (this.gameState !== 'playing') {
      return;
    }

    switch (key) {
      case 'w':
      case 'arrowup':
        this.moveForward = 1;
        break;

      case 's':
      case 'arrowdown':
        this.moveForward = -1;
        break;

      case 'a':
      case 'arrowleft':
        this.turn = 1;
        break;

      case 'd':
      case 'arrowright':
        this.turn = -1;
        break;

      case 'e':
        this.tryInteract();
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();

    if (this.gameState !== 'playing') {
      return;
    }

    switch (key) {
      case 'w':
      case 'arrowup':
      case 's':
      case 'arrowdown':
        this.moveForward = 0;
        break;

      case 'a':
      case 'arrowleft':
      case 'd':
      case 'arrowright':
        this.turn = 0;
        break;
    }
  }

private findNearestTrash(playerPos: THREE.Vector3, maxDistance: number): TrashItem | null {
    let nearest: TrashItem | null = null;
    let minDist = maxDistance;

    for (const item of this.trashItems) {
      const itemPos = new THREE.Vector3();
      item.object.getWorldPosition(itemPos);
      const dist = itemPos.distanceTo(playerPos);

      if (dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    }

    return nearest;
  }

  private findNearestBin(playerPos: THREE.Vector3, maxDistance: number): Bin | null {
    let nearest: Bin | null = null;
    let minDist = maxDistance;

    for (const bin of this.bins) {
      const binPos = new THREE.Vector3();
      bin.object.getWorldPosition(binPos);
      const dist = binPos.distanceTo(playerPos);

      if (dist < minDist) {
        minDist = dist;
        nearest = bin;
      }
    }

    return nearest;
  }
 // ⭐ Comprobar si ganó o perdió
  private checkGameState(): void {
  if (this.gameState !== 'playing') return;

  if (this.score >= 5) {
    this.gameState = 'win';
    this.showWinMenu = true;
    this.hudMessage = '¡Excelente! Clasificaste bien la basura. 🎉';
  } else if (this.score <= -2) {
    this.gameState = 'lose';
    this.showLoseMenu = true;
    this.hudMessage = 'Has reciclado mal demasiadas veces. 😢';
  }

  // Si el juego terminó, frenamos movimiento y animación
  if (this.gameState !== 'playing') {
    this.moveForward = 0;
    this.turn = 0;

    if (this.walkAction) {
      this.walkAction.paused = true; // deja de caminar en el sitio
    }
  }
}

  // ⭐ Lógica de interactuar con E
  private tryInteract(): void {
    if (!this.player || this.gameState !== 'playing') return;

    const playerPos = new THREE.Vector3();
    this.player.getWorldPosition(playerPos);

    // 1. Si NO estamos cargando nada → recoger basura
   // 1. Si NO estamos cargando nada → recoger basura
if (!this.carryingItem) {
  const nearestTrash = this.findNearestTrash(playerPos, this.pickupDistance);

  if (nearestTrash) {
    this.carryingItem = nearestTrash;

    // Quitamos de la lista de basura en el suelo
    this.trashItems = this.trashItems.filter(t => t !== nearestTrash);

    // Ancla de la mano (o cuerpo)
    const handAnchor = this.getHandAnchor();

    // Actualizamos matrices para obtener escala mundial correcta
    handAnchor.updateWorldMatrix(true, false);

    // Calculamos la escala mundial de la mano
    const handWorldScale = new THREE.Vector3();
    handAnchor.getWorldScale(handWorldScale);

    // Queremos que el tamaño en el mundo siga siendo el baseScale
    const s = nearestTrash.baseScale;  // 👈 el 0.01, 0.1 que pusiste en trashConfigs

    // Ajustamos la escala local para compensar el scale del jugador
    nearestTrash.object.scale.set(
      s / handWorldScale.x,
      s / handWorldScale.y,
      s / handWorldScale.z
    );

    // Finalmente lo re-parent al jugador
    handAnchor.add(nearestTrash.object);
    this.playSound(this.pickupSound);


    // Posición local cerca de la mano (valores pequeños porque el jugador está a escala 30)
    nearestTrash.object.position.set(0.1, 0.3, 0.2);
    nearestTrash.object.rotation.set(0, 0, 0);

    this.hudMessage = `Recogiste basura (${nearestTrash.type}). Llévala al contenedor correcto.`;
  } else {
    this.hudMessage = 'No hay basura cerca para recoger.';
  }

  return;
}

     // 2. Si YA llevamos basura → intentar reciclar en un contenedor
    const nearestBin = this.findNearestBin(playerPos, this.binDistance);

    if (!nearestBin) {
      this.hudMessage = 'No hay ningún contenedor cerca. Acércate más.';
      return;
    }

     if (nearestBin.type === this.carryingItem.type) {
      // ✔ Correcto
      this.recycledCount[nearestBin.type]++;
      this.score++;

      // Quitamos el modelo de la mano
      this.carryingItem.object.parent?.remove(this.carryingItem.object);
      this.carryingItem = null;
      this.playSound(this.correctSound);

      this.hudMessage = `¡Bien! +1 punto. Puntos: ${this.score}`;
      this.checkGameState();
    } else {
      // ❌ Incorrecto → -1 punto
      this.score--;
      this.playSound(this.wrongSound);
      // También tiramos esa basura: la quitamos de la mano
      this.carryingItem.object.parent?.remove(this.carryingItem.object);
      this.carryingItem = null;

      this.hudMessage = `Contenedor incorrecto. -1 punto. Puntos: ${this.score}`;
      this.checkGameState();
    }

  }
  
  animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

      const delta = this.clock.getDelta();
      // 👉 Actualizar OrbitControls
    if (this.controls) {
      this.controls.update();
 }
    // Solo actualizamos la animación cuando el juego está activo
    if (this.playerMixer && this.gameState === 'playing') {
      this.playerMixer.update(delta);
    }

    if (this.player && this.gameState === 'playing') {
      const speed = 100;
      const rotationSpeed = 2.5;

      this.player.rotation.y -= this.turn * rotationSpeed * delta;

      const forward = new THREE.Vector3(0, 0, 1);
      forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotation.y);
      forward.multiplyScalar(this.moveForward * speed * delta);
      this.player.position.add(forward);

      const offset = new THREE.Vector3(0, 80, -150);
      const playerWorldPos = new THREE.Vector3();
      this.player.getWorldPosition(playerWorldPos);
      const desiredCamPos = playerWorldPos.clone().add(offset);
      this.camera.position.lerp(desiredCamPos, 0.1);
      this.camera.lookAt(playerWorldPos);

      if (this.walkAction) {
        const isMoving =
          Math.abs(this.moveForward) > 0.001 || Math.abs(this.turn) > 0.001;
        this.walkAction.paused = !isMoving;
      }
    }

    this.renderer.render(this.scene, this.camera);

  };
  restartGame(): void {
    // Reinicio sencillo: recargar la página
    window.location.reload();
  }
}