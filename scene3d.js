/* The Quiet Grid — local, dependency-free-at-runtime Three.js scene.
 * Rendering reads observations from the game client; it never changes game rules.
 */
class QuietGrid3D {
    constructor(canvas) {
        const T = THREE;
        this.canvas = canvas;
        this.renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFShadowMap;
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.scene = new T.Scene();
        this.scene.background = new T.Color('#a5b4bf');
        this.scene.fog = new T.Fog('#a5b4bf', 38, 76);
        this.mapCamera = new T.OrthographicCamera(-10, 10, 6, -6, .1, 120);
        this.eyeCamera = new T.PerspectiveCamera(72, 1, .025, 12);
        this.camera = this.mapCamera;
        this.focus = new T.Vector3(7.1, 0, 6.8);
        this.azimuth = this.targetAzimuth = Math.PI / 4;
        this.elevation = .87;
        this.span = 9.3;
        this.preview = true;
        this.overview = false;
        this.autoFit = false;
        this.time = 0;
        this.lastSync = '';
        this.levelGeometries = [];
        this.levelMaterials = [];
        this.raycaster = new T.Raycaster();
        this.raycaster.layers.enable(1);
        this.pointer = new T.Vector2();
        this.floorPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
        this.hit = new T.Vector3();
        this.world = new T.Group();
        this.cutawayLayer = new T.Group();
        this.cutawayPool = [];
        this.cutWalls = new Set();
        this.cutRay = new T.Ray();
        this.cutBounds = new T.Box3();
        this.scene.add(this.world, this.cutawayLayer);
        this.scene.add(new T.HemisphereLight('#e9f5ff', '#81929f', 1.45));
        this.sun = new T.DirectionalLight('#fff3dc', 2.0);
        this.sun.position.set(-9, 19, -5);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, {left:-23, right:23, top:23, bottom:-23, near:1, far:65});
        this.sun.shadow.bias = -.00035;
        this.sun.shadow.normalBias = .029;
        this.sun.shadow.radius = 2.7;
        this.scene.add(this.sun, this.sun.target);
        const fill = new T.DirectionalLight('#cedfff', .62);
        fill.position.set(12, 8, 12);
        this.scene.add(fill);
        this._createResources();
        const backdrop = new T.Mesh(new T.PlaneGeometry(120, 120), this.material.backdrop);
        backdrop.rotation.x = -Math.PI / 2;
        backdrop.position.y = -.65;
        this.scene.add(backdrop);
        const grid = new T.GridHelper(112,56,'#899eae','#899eae');
        grid.position.y = -.64;
        Object.assign(grid.material,{transparent:true,opacity:.28,depthWrite:false,toneMapped:false});
        this.scene.add(grid);
        this.backdropGrid=grid;
        this._createActors();
        this.tacticalLayer=new T.Group();this.scene.add(this.tacticalLayer);
        this.sectorLayer=new T.Group();this.scene.add(this.sectorLayer);
        this.stencilTextures=new Map();
        this.terrainBatches=[];
        this.guardVisuals=[];this.tacticalResources=[];
        this._bindCamera();
        this._createCompass();
        this.previewState = this._makePreview();
        this.setLevel(this.previewState, true);
        this.resize();
        canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            window.quietGrid?.setView('2d');
            window.quietGrid?._showToast('3D көрінісі уақытша қолжетімсіз. Ойын үстінен қарау режимінде жалғасады.');
        });
        canvas.addEventListener('webglcontextrestored', () => {
            if (this.activeState) this.setLevel(this.activeState, this.preview, this.overview, this.firstPerson);
        });
    }

    _material(color, extra = {}) {
        return new THREE.MeshStandardMaterial({color, roughness:.72, metalness:.05, ...extra});
    }

    _createResources() {
        const T = THREE;
        const panels = this._panelTexture();
        this.geo = {
            floor:new T.BoxGeometry(.99, .07, .99), wall:this._wallGeometry(),
            deck:new T.BoxGeometry(1, .22, 1),
            plinth:new T.BoxGeometry(1.024, .057, 1.024), tile:new T.PlaneGeometry(.92, .92),
            grate:new T.PlaneGeometry(.76, .76), ring:new T.TorusGeometry(.39, .016, 6, 48)
        };
        this.material = {
            backdrop:new T.MeshBasicMaterial({color:'#a5b4bf',toneMapped:false}),
            visible:this._material('#85949e',{map:panels}), memory:this._material('#677984',{map:panels}),
            unknown:this._material('#4d606e',{map:panels}), wallSide:this._material('#70838e'),
            wallMemory:this._material('#8798a3',{vertexColors:true}),
            plinth:this._material('#778991'), base:this._material('#536779'),
            signal:new T.MeshBasicMaterial({color:'#b7f96a',toneMapped:false}),
            terminal:new T.MeshBasicMaterial({color:'#7eeaff',toneMapped:false}),
            fixture:this._material('#526b7c'),
            guard:this._material('#a9ce64',{emissive:'#789325',emissiveIntensity:.52,flatShading:true}),
            teal:this._material('#19585d', {metalness:.12, roughness:.5, emissive:'#087982', emissiveIntensity:.3,flatShading:true}),
            red:this._material('#eb5264', {metalness:.35, roughness:.3}), dark:this._material('#29374a', {metalness:.6, roughness:.3}),
            gold:this._material('#f7c451', {metalness:.6, roughness:.24, emissive:'#bb7620', emissiveIntensity:.12}),
            white:this._material('#a6c0dc', {roughness:.25}), blue:this._material('#71d6ff', {emissive:'#12b5f1', emissiveIntensity:.65})
        };
        this.floorVariants=['#81929c','#8999a2','#7c8f9c','#8797a0','#82959e'].map(color=>this._material(color,{map:panels}));
        this.scanTexture = this._scanTexture();
        this.wallMaterials = this._material('#c3cdd4',{vertexColors:true});
        this.corridorMaterial=this._material('#d2dddf',{map:this._corridorTexture()});
        this.ceilingMaterial=new T.MeshBasicMaterial({map:this._ceilingTexture()});
        this.cutawayMaterial = this.wallMaterials.clone();
        Object.assign(this.cutawayMaterial,{transparent:true,opacity:.28,depthWrite:false});
        this.cutEdges = new T.EdgesGeometry(this.geo.wall, 28);
        this.cutLineMaterial = new T.LineBasicMaterial({color:'#597990',transparent:true,opacity:.56,depthWrite:false,toneMapped:false});
        this.markerTexture = this._markerTexture();
        this.geo.crystal = new T.OctahedronGeometry(.23);
        this.geo.cradle = new T.CylinderGeometry(.25,.3,.12,6);
        this.geo.rackTop = new T.BoxGeometry(.76,.095,.76);
        this.geo.rackVent = new T.BoxGeometry(.52,.025,.07);
        this.geo.coolantCap=new T.CylinderGeometry(.30,.36,.17,12);
        this.geo.fins=new T.BoxGeometry(.10,.21,.67);
        this.geo.threshold = new T.BoxGeometry(1,.018,.11);
        this.geo.sectorFloor=new T.BoxGeometry(1,.07,1);
        this.geo.sectorWall=new T.BoxGeometry(1,1.15,1);
        const normals=this.geo.sectorWall.attributes.normal,shades=[];
        for(let i=0;i<normals.count;i++){
            const shade=normals.getY(i)>.5 ? 1 : Math.abs(normals.getX(i))>.5 ? .56 : .76;
            shades.push(shade,shade,shade);
        }
        this.geo.sectorWall.setAttribute('color',new T.Float32BufferAttribute(shades,3));
        this.material.crystal = this._material('#b9f986',{emissive:'#83ca35',emissiveIntensity:.78,flatShading:true});
        this.material.rack = this._material('#556f80',{metalness:.33});
        this.batchFloorMaterial = this._material('#ffffff',{map:this._panelTexture(true)});
        this.heatMaterials = Array.from({length:32}, (_, i) => {
            const color = new T.Color('#1bafc1').lerp(new T.Color('#ff715a'), i/31);
            return new T.MeshBasicMaterial({color, transparent:true, opacity:.1+i/31*.65, depthWrite:false});
        });
        this.targetMaterial = new T.MeshBasicMaterial({color:'#45cfba', transparent:true, opacity:.24, depthWrite:false});
        this.hoverMaterial = new T.MeshBasicMaterial({color:'#16a697', transparent:true, opacity:.7, depthWrite:false});
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = textureCanvas.height = 128;
        const context = textureCanvas.getContext('2d');
        context.strokeStyle = '#708398'; context.lineWidth = 3;
        context.strokeRect(4,4,120,120);
        for (let n=14; n<125; n+=12) { context.beginPath();context.moveTo(6,n);context.lineTo(122,n);context.stroke(); }
        context.lineWidth=2;
        for (const x of [25,64,103]) { context.beginPath();context.moveTo(x,5);context.lineTo(x,123);context.stroke(); }
        this.grateMaterial = new T.MeshStandardMaterial({map:new T.CanvasTexture(textureCanvas), transparent:true, opacity:.65, roughness:.8});
        this.glowTexture = this._glowTexture('#26e4d0');
        this.terminalGlowMaterial = new T.MeshBasicMaterial({
            map:this._glowTexture('#ffffff'),color:'#10c5ff',transparent:true,depthWrite:false,toneMapped:false
        });
        this.crystalGlowMaterial=this.terminalGlowMaterial.clone();
        this.glowPlane = new T.PlaneGeometry(1.6, 1.6);
        this.redGlowTexture = this._glowTexture('#ff465d');
    }

    _wallGeometry() {
        const T = THREE, edge = .48;
        const shape = new T.Shape();
        shape.moveTo(-edge,-edge);
        shape.lineTo(edge,-edge);shape.lineTo(edge,edge);shape.lineTo(-edge,edge);
        shape.closePath();
        const geometry = new T.ExtrudeGeometry(shape,{
            depth:1.04,bevelEnabled:true,bevelThickness:.055,bevelSize:.019,bevelSegments:1,steps:1
        });
        geometry.rotateX(-Math.PI/2);
        geometry.translate(0,-.52,0);
        const normals = geometry.getAttribute('normal'), colors = [];
        for (let i=0;i<normals.count;i++) {
            const x=normals.getX(i), y=normals.getY(i), z=normals.getZ(i);
            const face=Math.abs(x)>Math.abs(z) ? .55 : .74;
            const light=y>.99 ? 1 : y>.1 ? .87 : face;
            colors.push(light,light,light);
        }
        geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
        geometry.clearGroups();
        return geometry;
    }

    _corridorTexture(){
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=256;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#344951';ctx.fillRect(0,0,256,256);
        ctx.fillStyle='#7e9196';ctx.fillRect(3,5,250,213);
        ctx.fillStyle='#6c8086';ctx.fillRect(9,12,238,194);
        ctx.fillStyle='#465c64';ctx.fillRect(14,27,228,8);
        ctx.fillStyle='#a7d8ce';ctx.fillRect(21,29,80,3);
        ctx.fillStyle='#536971';ctx.fillRect(3,221,250,26);
        for(const x of [16,235])for(const y of [17,197]){
            ctx.fillStyle='#455a60';ctx.fillRect(x,y,4,4);
        }
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;
        return texture;
    }

    _ceilingTexture(){
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#202d34';ctx.fillRect(0,0,128,128);
        ctx.fillStyle='#34434b';ctx.fillRect(2,2,124,124);
        ctx.fillStyle='#293840';ctx.fillRect(6,6,116,116);
        ctx.fillStyle='#5b797c';ctx.fillRect(36,54,56,12);
        ctx.fillStyle='#cae7dc';ctx.fillRect(39,57,50,6);
        const texture=new THREE.CanvasTexture(canvas);
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.colorSpace=THREE.SRGBColorSpace;
        return texture;
    }

    _panelTexture(continuous=false) {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='#e3e9ec';
        ctx.fillRect(0,0,128,128);
        ctx.beginPath();
        ctx.moveTo(1,1);ctx.lineTo(127,1);ctx.lineTo(1,127);
        ctx.fillStyle=continuous?'#e9edef':'#f7f9fa';ctx.fill();
        if(!continuous){
            ctx.strokeStyle='#aab9c3';ctx.lineWidth=2.4;
            ctx.strokeRect(1,1,126,126);
        }
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;
        return texture;
    }

    _scanTexture() {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=64;
        const ctx=canvas.getContext('2d');
        const pixels=ctx.createImageData(64,64);
        for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
            const i=(y*64+x)*4;
            pixels.data.set([255,255,255,(x+y)%64 < 25 ? 255 : 28],i);
        }
        ctx.putImageData(pixels,0,0);
        const texture=new THREE.CanvasTexture(canvas);
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        return texture;
    }

    _markerTexture() {
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=96;
        const ctx=canvas.getContext('2d');
        const diamond = size => {
            ctx.beginPath();
            ctx.moveTo(48,48-size);ctx.lineTo(48+size,48);
            ctx.lineTo(48,48+size);ctx.lineTo(48-size,48);
            ctx.closePath();
        };
        diamond(31);
        ctx.fillStyle='#213543';ctx.fill();
        ctx.strokeStyle='#253946';ctx.lineWidth=12;ctx.stroke();
        ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.stroke();
        diamond(10);ctx.fillStyle='#fff';ctx.fill();
        const texture=new THREE.CanvasTexture(canvas);
        texture.colorSpace=THREE.SRGBColorSpace;
        return texture;
    }

    _marker(parent, y, size, color) {
        const material=new THREE.SpriteMaterial({
            map:this.markerTexture,color,transparent:true,depthTest:false,depthWrite:false,toneMapped:false
        });
        const marker=new THREE.Sprite(material);
        marker.position.y=y;marker.scale.set(size,size,1);marker.renderOrder=9;
        parent.add(marker);
        return marker;
    }

    _glowTexture(color) {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');
        const gradient=ctx.createRadialGradient(64,64,2,64,64,64);
        gradient.addColorStop(0,color+'88');gradient.addColorStop(.55,color+'38');gradient.addColorStop(1,color+'00');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
        return new THREE.CanvasTexture(canvas);
    }

    _mesh(geometry, material, parent, x=0, y=0, z=0) {
        const mesh=new THREE.Mesh(geometry,material);
        mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
        parent.add(mesh);return mesh;
    }

    _createActors() {
        const T=THREE, m=this.material;
        this.actors=new T.Group();this.scene.add(this.actors);
        this.player=new T.Group();this.actors.add(this.player);
        this.orb=this._mesh(new T.SphereGeometry(.12,8,6),m.teal,this.player,0,.68,0);
        this._mesh(new T.CylinderGeometry(.13,.18,.3,5),m.teal,this.player,0,.43,0);
        this._mesh(new T.BoxGeometry(.17,.045,.07),m.dark,this.player,0,.69,.1);
        this._mesh(new T.BoxGeometry(.13,.018,.02),new T.MeshBasicMaterial({color:'#b9f5e6'}),this.player,0,.69,.14);
        this.agentLegs=[];
        for(const x of [-.09,.09]){
            this.agentLegs.push(this._mesh(new T.CapsuleGeometry(.055,.15,3,6),m.teal,this.player,x,.18,0));
            this._mesh(new T.CapsuleGeometry(.04,.16,3,6),m.teal,this.player,x*2.1,.43,.01);
        }
        const ring=this._mesh(this.geo.ring,new T.MeshBasicMaterial({color:'#28c9b7',transparent:true,opacity:.5}),this.player,0,.025,0);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
        this.playerGlow=this._mesh(new T.PlaneGeometry(3,3),new T.MeshBasicMaterial({map:this.glowTexture,transparent:true,depthWrite:false,opacity:.42}),this.actors,0,.012,0);this.playerGlow.rotation.x=-Math.PI/2;this.playerGlow.castShadow=false;
        this.playerLight=new T.PointLight('#71b6a4',.6,3,2);this.playerLight.position.y=.8;this.player.add(this.playerLight);
        this.guardModel=new T.Group();
        // A low twin-track chassis carries a raised directional optical head.
        for(const side of [-1,1]){
            this._mesh(new T.BoxGeometry(.12,.20,.42),m.dark,this.guardModel,side*.20,.14,0);
            this._mesh(new T.BoxGeometry(.13,.055,.31),m.guard,this.guardModel,side*.20,.26,0);
        }
        this._mesh(new T.CylinderGeometry(.22,.18,.21,6),m.guard,this.guardModel,0,.30,0);
        this._mesh(new T.CylinderGeometry(.07,.10,.23,8),m.dark,this.guardModel,0,.50,0);
        const sensor=new T.Group();sensor.name='sensor';this.guardModel.add(sensor);
        this._mesh(new T.BoxGeometry(.37,.23,.30),m.guard,sensor,0,.69,.02);
        this._mesh(new T.BoxGeometry(.29,.12,.025),m.dark,sensor,0,.69,.18);
        this._mesh(new T.BoxGeometry(.19,.045,.03),m.signal,sensor,.025,.69,.20);
        this._marker(this.player,1.03,.45,'#67ffe1');
        this.drone=new T.Group();this.actors.add(this.drone);
        const body=this._mesh(new T.CapsuleGeometry(.16,.38,5,12),m.red,this.drone,0,.48,0);body.rotation.x=Math.PI/2;
        this._mesh(new T.BoxGeometry(.28,.06,.4),m.red,this.drone,0,.64,-.025);
        for(const x of [-.24,.24]){
            const thruster=this._mesh(new T.CylinderGeometry(.07,.07,.35,12),m.red,this.drone,x,.42,-.02);thruster.rotation.x=Math.PI/2;
            this._mesh(new T.BoxGeometry(.16,.035,.2),m.red,this.drone,x,.51,-.1);
        }
        const lens=this._mesh(new T.CylinderGeometry(.105,.105,.06,24),m.dark,this.drone,0,.49,.31);lens.rotation.x=Math.PI/2;
        this._mesh(new T.SphereGeometry(.065,16,12),new T.MeshStandardMaterial({color:'#ff9a9c',emissive:'#ff5362',emissiveIntensity:.6}),this.drone,0,.49,.36);
        this.droneGlow=this._mesh(new T.PlaneGeometry(3.6,3.6),new T.MeshBasicMaterial({map:this.redGlowTexture,transparent:true,depthWrite:false,opacity:.5}),this.actors,0,.014,0);this.droneGlow.rotation.x=-Math.PI/2;this.droneGlow.castShadow=false;
        const sector=new T.CircleGeometry(2.2,48,Math.PI*.25,Math.PI*.5);
        const points=[], positions=sector.getAttribute('position'), uv=sector.getAttribute('uv');
        for(let i=0;i<positions.count;i++){
            const x=positions.getX(i),y=positions.getY(i);
            uv.setXY(i,x*2.1,y*2.1);
            points.push(new T.Vector3(x,y,.002));
        }
        this.droneCone=this._mesh(sector,new T.MeshBasicMaterial({
            color:'#daf76c',map:this.scanTexture,transparent:true,opacity:.48,depthWrite:false,side:T.DoubleSide,toneMapped:false
        }),this.actors,0,.018,0);
        this.droneCone.rotation.x=-Math.PI/2;this.droneCone.castShadow=false;
        this.droneCone.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(points),
            new T.LineBasicMaterial({color:'#5e7519',toneMapped:false})));
        this._marker(this.drone,.98,.43,'#ffd473');
        this.key=new T.Group();this.actors.add(this.key);
        this._mesh(new T.TorusGeometry(.17,.046,10,32),m.gold,this.key,0,.18,0);
        this._mesh(new T.BoxGeometry(.075,.4,.075),m.gold,this.key,0,-.1,0);
        this._mesh(new T.BoxGeometry(.17,.065,.075),m.gold,this.key,.065,-.27,0);
        this._mesh(new T.BoxGeometry(.13,.065,.075),m.gold,this.key,.045,-.16,0);
        this._marker(this.key,.54,.46,'#ffda83');
        this.exit=new T.Group();this.actors.add(this.exit);
        this._mesh(new T.BoxGeometry(.9,.08,.9),m.wallSide,this.exit,0,.02,0);
        this._mesh(new T.BoxGeometry(.77,.025,.77),this._material('#254a5d',{metalness:.25}),this.exit,0,.075,0);
        const square=new T.BufferGeometry().setFromPoints([[-.33,.095,-.33],[.33,.095,-.33],[.33,.095,.33],[-.33,.095,.33],[-.33,.095,-.33]].map(p=>new T.Vector3(...p)));
        this.exitFrame=new T.Line(square,new T.LineBasicMaterial({color:'#dcfba0'}));
        this.exit.add(this.exitFrame);
        this.exitCore=this._mesh(new T.OctahedronGeometry(.14),m.blue.clone(),this.exit,0,.32,0);
        this.exitLight=new T.PointLight('#36b2e0',1.3,3,2);this.exitLight.position.y=.4;this.exit.add(this.exitLight);
        this.exitMarker=this._marker(this.exit,.88,.65,'#8aeaff');
        this.hover=this._mesh(this.geo.tile,this.hoverMaterial,this.actors);this.hover.rotation.x=-Math.PI/2;this.hover.position.y=.027;this.hover.visible=false;this.hover.castShadow=false;
        this.pulseRings=[];
    }

    _makePreview() {
        const rows=[
            '###############', '#.....#.......#', '#.....#.......#', '#.##..#..###..#',
            '#..#..........#', '#..#..####....#', '#..#.....#....#', '#..###...#....#',
            '#........#....#', '#....##.......#', '#....#...###..#', '#....#........#',
            '#.............#', '#.............#', '###############'
        ];
        const grid=rows.map(r=>[...r].map(c=>c==='#'?1:0));
        for(const [x,y] of [[3,6],[10,8],[11,8],[7,3],[4,11],[8,12]])grid[y][x]=2;
        return {width:15,height:15,grid,player:[4,8],monster:[10,6],key_pos:[2,5],exit_pos:[11,2],key_collected:false,belief:{},turn:0,player_vision_radius:3,ai_status:'PATROL'};
    }

    setLevel(state, preview=false, fullMap=true, firstPerson=false) {
        this.preview=preview;this.activeState=state;this.lastSync='';
        this._applyDesign(state.design);
        this.firstPerson=firstPerson;
        this.camera=firstPerson?this.eyeCamera:this.mapCamera;
        this.overview=!firstPerson && fullMap && (!preview || state.mode==='campaign');
        this.autoFit=this.overview;
        this.player.visible=this.playerGlow.visible=!firstPerson;
        for(const actor of [this.drone,this.key,this.exit]){
            for(const part of actor.children)if(part.isSprite)part.visible=!firstPerson;
        }
        const mazeDepth=Math.hypot(state.width,state.height);
        this.scene.fog.near=firstPerson?mazeDepth*.4:38;
        this.scene.fog.far=firstPerson?mazeDepth*1.5:76;
        this.sun.castShadow=!firstPerson;
        this.backdropGrid.visible=!firstPerson;
        if(firstPerson){
            this.eyeCamera.far=mazeDepth+2;
            this.scene.fog.color.set('#354851');
            this.scene.background.copy(this.scene.fog.color);
        }
        this.world.clear();
        this.cutWalls.clear();
        for(const mesh of this.cutawayPool)mesh.visible=false;
        for(const ring of this.pulseRings)ring.visible=false;
        this.sectorLayer.clear();
        this.sectorDeck?.dispose();
        this.sectorDeck=null;
        for(const batch of this.terrainBatches)batch.dispose();
        this.terrainBatches=[];
        this.terrainMatricesReady=false;
        for(const geometry of this.levelGeometries)geometry.dispose();
        for(const material of this.levelMaterials)material.dispose();
        this.levelMaterials=[];
        this.levelGeometries=[];this.tiles=[];
        this.tileGrid=Array.from({length:state.height},()=>Array(state.width));
        if(!state.footprint){
            const baseGeo=new THREE.BoxGeometry(state.width+.2,.22,state.height+.2);
            this.levelGeometries.push(baseGeo);
            this._mesh(baseGeo,this.material.base,this.world,state.width/2,-.19,state.height/2);
        }
        if(firstPerson){
            const roof=new THREE.PlaneGeometry(state.width,state.height);
            this.ceilingMaterial.map.repeat.set(state.width,state.height);
            this.levelGeometries.push(roof);
            const ceiling=this._mesh(roof,this.ceilingMaterial,this.world,state.width/2,1.15,state.height/2);
            ceiling.rotation.x=Math.PI/2;
            ceiling.castShadow=false;
        }
        for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){
            if(state.footprint && !state.footprint[y][x])continue;
            const floor=this._mesh(this.geo.floor,this.material.visible,this.world,x+.5,-.035,y+.5);
            const tile={x,y,floor};
            floor.userData.cell = [x,y];
            if(state.grid[y][x]===1){
                const height=state.mode==='campaign'?1.12:1;
                tile.wall=this._mesh(firstPerson?this.geo.sectorWall:this.geo.wall,firstPerson?this.corridorMaterial:this.wallMaterials,this.world,x+.5,.575*height,y+.5);
                tile.wall.scale.y=height;
                tile.plinth=this._mesh(this.geo.plinth,this.material.plinth,this.world,x+.5,.025,y+.5);
                if (state.mode==='campaign') this._decorateWall(state,tile);
            }else{
                tile.heat=this._mesh(this.geo.tile,this.heatMaterials[0],this.world,x+.5,.012,y+.5);tile.heat.rotation.x=-Math.PI/2;tile.heat.castShadow=false;tile.heat.visible=false;
                tile.target=this._mesh(this.geo.tile,this.targetMaterial,this.world,x+.5,.02,y+.5);tile.target.rotation.x=-Math.PI/2;tile.target.castShadow=false;tile.target.visible=false;
                tile.heat.userData.cell = tile.target.userData.cell = [x,y];
                if(state.grid[y][x]===2){tile.grate=this._mesh(this.geo.grate,this.grateMaterial,this.world,x+.5,.009,y+.5);tile.grate.rotation.x=-Math.PI/2;tile.grate.castShadow=false;}
                if(tile.grate)tile.grate.userData.cell = [x,y];
            }
            this.tiles.push(tile);
            this.tileGrid[y][x]=tile;
        }
        this.player.position.set(state.player[0]+.5,0,state.player[1]+.5);
        this.drone.position.set(state.monster[0]+.5,0,state.monster[1]+.5);
        this.drone.rotation.y=-Math.PI/2;
        this.key.position.set(state.key_pos[0]+.5,.68,state.key_pos[1]+.5);
        this.exit.position.set(state.exit_pos[0]+.5,0,state.exit_pos[1]+.5);
        this.focus.set(this.overview?state.width/2:preview?7.1:state.player[0]+.5,0,this.overview?state.height/2:preview?6.8:state.player[1]+.5);
        this.sun.position.set(state.width/2-10,19,state.height/2-7);
        this.sun.target.position.set(state.width/2,0,state.height/2);
        this.span=preview?9.3:8.8;
        this.defaultAzimuth=state.live ? -.16 : state.mode==='campaign' ? -.29 : Math.PI/4;
        if(firstPerson){
            this.defaultAzimuth=this._startingHeading(state);
            this.pitch=-.08;
        }
        this.azimuth=this.targetAzimuth=this.defaultAzimuth;
        this.elevation=state.live ? 1.0 : state.mode==='campaign' ? .91 : .87;
        this._buildTactics(state);
        this._buildSector(state);
        this.resize();
    }

    _startingHeading(state){
        const [x,y]=state.player;
        let longest=-1,heading=0;
        for(const [dx,dy,angle] of [[0,-1,0],[1,0,-Math.PI/2],[0,1,Math.PI],[-1,0,Math.PI/2]]){
            let depth=0;
            while(ClientAIEngine.floor(state,[x+dx*(depth+1),y+dy*(depth+1)]))depth++;
            if(depth>longest){longest=depth;heading=angle;}
        }
        return heading;
    }

    movementVector(dx,dy){
        const cos=Math.cos(this.targetAzimuth),sin=Math.sin(this.targetAzimuth);
        return [dx*cos+dy*sin,dy*cos-dx*sin];
    }

    _applyDesign(design){
        const backdrop=design?.void??'#a5b4bf';
        this.scene.background.set(backdrop);
        this.scene.fog.color.set(backdrop);
        this.material.backdrop.color.set(backdrop);
        this.backdropGrid.material.opacity=design ? .085 : .28;
        this.wallMaterials.color.set(design?.wall??'#c3cdd4');
        this.cutawayMaterial.color.copy(this.wallMaterials.color);
        this.cutLineMaterial.color.set(design?.edge??'#597990');
        this.material.plinth.color.set(design?.floor??'#778991');
        this.material.base.color.set(design?.floor??'#536779');
        this.material.rack.color.set(design?.wall??'#556f80');
        this.material.signal.color.set(design?.trim??'#b7f96a');
        this.material.terminal.color.set(design?.trim??'#7eeaff');
        this.terminalGlowMaterial.color.set(design?.trim??'#10c5ff');
        this.crystalGlowMaterial.color.set(design?.crystal??'#b9f986');
        this.material.crystal.color.set(design?.crystal??'#b9f986');
        this.material.crystal.emissive.set(design?.crystal??'#83ca35');
        this.material.crystal.emissiveIntensity=design ? .34 : .78;
        this.material.guard.color.set(design?.cone??'#a9ce64');
        this.material.guard.emissive.set(design?.cone??'#789325');
        this.material.guard.emissiveIntensity=design ? .18 : .52;
        this.material.unknown.color.set(design?.void??'#4d606e');
        const defaults=['#81929c','#8999a2','#7c8f9c','#8797a0','#82959e'];
        this.floorVariants.forEach((mat,i)=>{
            mat.color.set(design?.floor??defaults[i]);
            if(design)mat.color.lerp(new THREE.Color(design.floorAlt),i/(this.floorVariants.length-1));
        });
    }

    _decorateWall(state,tile) {
        const {x,y,wall}=tile;
        if ((x*7+y*11)%(state.live?9:5)!==0) return;
        const edges=[[0,1],[0,-1],[1,0],[-1,0]];
        for (const [dx,dy] of edges) {
            if (!ClientAIEngine.floor(state,[x+dx,y+dy])) continue;
            const plate=new THREE.BoxGeometry(.66,.16,.05);
            const inset=new THREE.BoxGeometry(.56,.045,.02);
            this.levelGeometries.push(plate,inset);
            const mount=this._mesh(plate,this.material.fixture,wall,dx*.51,.24,dy*.51);
            mount.rotation.y=Math.atan2(dx,dy);
            const indicator=this._mesh(inset,this.material.terminal,mount,0,0,.035);
            indicator.castShadow=false;
            const glow=this._mesh(this.glowPlane,this.terminalGlowMaterial,mount,0,0,.056);
            glow.scale.set(.63,.27,1);
            glow.castShadow=false;
            if(state.design){
                const wash=this._mesh(this.glowPlane,this.terminalGlowMaterial,this.sectorLayer,x+.5+dx*.65,.007,y+.5+dy*.65);
                wash.rotation.x=-Math.PI/2;wash.scale.setScalar(1.15);wash.castShadow=false;
                tile.wash=wash;
            }
            break;
        }
    }

    _buildSector(state){
        this.crystalModels=[];
        this.thresholdModels=[];
        this.roomMarkModels=[];
        if(!state.live)return;
        const design=state.design;
        if(design){
            if(!this.stencilTextures.has(design.id)){
                const texture=new THREE.CanvasTexture(SectorArt.stencil(design));
                texture.colorSpace=THREE.SRGBColorSpace;
                this.stencilTextures.set(design.id,texture);
            }
            const ink=new THREE.MeshBasicMaterial({map:this.stencilTextures.get(design.id),transparent:true,
                opacity:.36,depthWrite:false,toneMapped:false});
            this.levelMaterials.push(ink);
            for(const cell of state.roomMarks){
                const mark=this._mesh(this.geo.tile,ink,this.sectorLayer,cell[0]+.5,.004,cell[1]+.5);
                mark.rotation.x=-Math.PI/2;mark.scale.setScalar(3.1);mark.castShadow=false;
                this.roomMarkModels.push({mark,cell});
            }
        }
        for(const [x,y,width] of state.thresholds){
            const marker=this._mesh(this.geo.threshold,this.material.signal,this.sectorLayer,x+width/2,.017,y+.52);
            marker.scale.x=width-.25;
            marker.castShadow=false;
            this.thresholdModels.push({marker,cell:[x,y]});
        }
        const fixtureCells=new Set(state.fixtures.map(p=>p.join(',')));
        for(const tile of this.tiles){
            if(!tile.wall || !fixtureCells.has(`${tile.x},${tile.y}`))continue;
            this._mesh(this.geo.rackTop,this.material.rack,tile.wall,0,.591,0);
            if(design?.id==='basin'){
                this._mesh(this.geo.coolantCap,this.material.fixture,tile.wall,0,.71,0);
                const band=this._mesh(this.geo.ring,this.material.signal,tile.wall,0,.80,0);
                band.rotation.x=-Math.PI/2;band.scale.setScalar(.67);
            }else if(design?.id==='kiln'){
                for(const x of [-.24,0,.24]){
                    this._mesh(this.geo.fins,this.material.fixture,tile.wall,x,.72,0);
                    this._mesh(this.geo.rackVent,this.material.terminal,tile.wall,x,.83,0).rotation.y=Math.PI/2;
                }
            }else{
                for(const z of [-.20,.20]){
                    this._mesh(this.geo.rackTop,this.material.fixture,tile.wall,0,.71,z).scale.set(.87,1.6,.36);
                    this._mesh(this.geo.rackVent,this.material.terminal,tile.wall,-.06,.79,z);
                }
            }
        }
        for(const cell of state.crystals){
            if(!cell){this.crystalModels.push(null);continue;}
            const [x,y]=cell;
            const marker=new THREE.Group();
            marker.position.set(x+.5,0,y+.5);
            this.sectorLayer.add(marker);
            const glow=this._mesh(this.glowPlane,this.crystalGlowMaterial,marker,0,.008,0);
            glow.rotation.x=-Math.PI/2;glow.scale.setScalar(1.3);glow.castShadow=false;
            this._mesh(this.geo.cradle,this.material.rack,marker,0,.065,0);
            const ring=this._mesh(this.geo.ring,this.material.signal,marker,0,.025,0);
            ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.8);ring.castShadow=false;
            const gem=this._mesh(this.geo.crystal,this.material.crystal,marker,0,.49,0);
            gem.scale.y=1.75;
            const diamond=this._marker(marker,1.12,.52,design?.crystal??'#c6ff88');
            this.levelMaterials.push(diamond.material);
            this.crystalModels.push({marker,gem});
        }
        // Keep the individual tiles on a picking layer and draw terrain in three batches.
        const walls=this.tiles.filter(tile=>tile.wall);
        for(const [name,tiles,material] of [
            ['floor',this.tiles,this.batchFloorMaterial],['wall',walls,this.wallMaterials],['plinth',walls,this.material.plinth]
        ]){
            const geometry=name==='floor'?this.geo.sectorFloor:name==='wall'?this.geo.sectorWall:this.geo.plinth;
            const mesh=new THREE.InstancedMesh(geometry,material,tiles.length);
            mesh.receiveShadow=true;
            mesh.castShadow=name==='wall';
            mesh.frustumCulled=false;
            for(const tile of tiles)tile[name].layers.set(1);
            this.sectorLayer.add(mesh);
            this.terrainBatches.push(mesh);
        }
        this.sectorWalls=walls;
        if(state.footprint){
            const deck=new THREE.InstancedMesh(this.geo.deck,this.material.base,this.tiles.length);
            const transform=new THREE.Matrix4();
            for(let i=0;i<this.tiles.length;i++){
                const {x,y}=this.tiles[i];
                deck.setMatrixAt(i,transform.makeTranslation(x+.5,-.18,y+.5));
            }
            deck.instanceMatrix.needsUpdate=true;
            deck.receiveShadow=true;
            this.sectorLayer.add(deck);
            this.sectorDeck=deck;
        }
        this._updateTerrainBatches();
    }

    _updateTerrainBatches(updateColors=true){
        if(!this.terrainBatches.length)return;
        const hidden = this.hiddenInstance || (this.hiddenInstance = new THREE.Matrix4().makeScale(0,0,0));
        const [floors,walls,plinths]=this.terrainBatches;
        if(updateColors)for(let i=0;i<this.tiles.length;i++){
            const floor=this.tiles[i].floor;
            if(!this.terrainMatricesReady){floor.updateMatrix();floors.setMatrixAt(i,floor.matrix);}
            floors.setColorAt(i,floor.material.color);
        }
        if(!this.terrainMatricesReady){
            floors.instanceMatrix.needsUpdate=true;
            this.terrainMatricesReady=true;
        }
        if(updateColors)floors.instanceColor.needsUpdate=true;
        for(let i=0;i<this.sectorWalls.length;i++){
            const {wall,plinth,cutaway}=this.sectorWalls[i];
            wall.updateMatrix();plinth.updateMatrix();
            walls.setMatrixAt(i,wall.visible&&!cutaway?wall.matrix:hidden);
            plinths.setMatrixAt(i,plinth.visible?plinth.matrix:hidden);
        }
        walls.instanceMatrix.needsUpdate=plinths.instanceMatrix.needsUpdate=true;
    }

    _buildTactics(state) {
        for(const visual of this.guardVisuals){visual.cone.geometry.dispose();visual.outline.geometry.dispose();}
        this.tacticalLayer.clear();
        for(const resource of this.tacticalResources)resource.dispose();
        this.tacticalResources=[];this.guardVisuals=[];
        for(const guard of state.guards||[]){
            const model=this.guardModel.clone(true);model.scale.setScalar(1);
            model.position.set(guard.position[0]+.5,0,guard.position[1]+.5);
            const routeGeometry=new THREE.BufferGeometry().setFromPoints([...guard.route,guard.route[0]].map(p=>new THREE.Vector3(p[0]+.5,.035,p[1]+.5)));
            const routeMaterial=new THREE.LineDashedMaterial({color:'#2a576f',transparent:true,opacity:.47,dashSize:.14,gapSize:.17,depthWrite:false,toneMapped:false});
            const route=new THREE.Line(routeGeometry,routeMaterial);route.computeLineDistances();
            const coneMaterial=new THREE.MeshBasicMaterial({color:'#d6ff60',map:this.scanTexture,transparent:true,opacity:.69,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
            const cone=new THREE.Mesh(new THREE.BufferGeometry(),coneMaterial);cone.renderOrder=2;
            const outlineMaterial=new THREE.LineBasicMaterial({color:'#56741a',transparent:true,opacity:.91,depthWrite:false,toneMapped:false});
            const outline=new THREE.Line(new THREE.BufferGeometry(),outlineMaterial);outline.renderOrder=3;
            const label=this._marker(model,1.03,.43,'#dcff8a');
            this.tacticalLayer.add(route,cone,outline,model);
            this.tacticalResources.push(routeGeometry,routeMaterial,coneMaterial,outlineMaterial,label.material);
            this.guardVisuals.push({model,sensor:model.getObjectByName('sensor'),route,cone,outline,label,guardId:guard.id});
        }
    }

    _syncTactics(client) {
        for(const visual of this.guardVisuals){
            const guard=client.state.guards.find(g=>g.id===visual.guardId);
            const visible=this.preview||client.showFullMap||client._visibility(...guard.position)===2;
            visual.model.visible=visual.cone.visible=visual.outline.visible=visible;
            visual.route.visible=visible&&(this.preview||client.showFullMap)&&client.showPatrolRoutes!==false;
            const chase=guard.status==='CHASE', investigate=guard.status==='INVESTIGATE';
            const color=chase?'#ff836b':investigate?'#ffbc70':guard.status==='SCAN'?'#fff6c7':client.state.design?.cone??'#d6ff60';
            visual.cone.material.color.set(color);
            visual.label.material.color.set(color);
            visual.outline.material.color.set(chase?'#a33f2e':investigate?'#8f590b':'#56741a');
            const pose=guard.position.join(',')+'/'+guard.facing.join(',');
            if(!visible || visual.pose===pose)continue;
            visual.pose=pose;
            const polygon=TacticalCampaign.visionPolygon(client.state,guard),positions=[],uv=[];
            for(let i=1;i<polygon.length-1;i++)for(const [x,y] of [polygon[0],polygon[i],polygon[i+1]]){
                positions.push(x,.021,y);
                uv.push(x*2.25,y*2.25);
            }
            visual.cone.geometry.dispose();visual.cone.geometry=new THREE.BufferGeometry();
            visual.cone.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
            visual.cone.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
            visual.outline.geometry.dispose();visual.outline.geometry=new THREE.BufferGeometry().setFromPoints([...polygon,polygon[0]].map(p=>new THREE.Vector3(p[0],.024,p[1])));
        }
    }

    _renderTactics(client,dt,reducedMotion,markerScale) {
        const amount=reducedMotion?1:1-Math.exp(-20*dt);
        for(const visual of this.guardVisuals){
            const guard=client.state.guards.find(g=>g.id===visual.guardId);
            visual.model.position.x+=(guard.position[0]+.5-visual.model.position.x)*amount;
            visual.model.position.z+=(guard.position[1]+.5-visual.model.position.z)*amount;
            visual.model.position.y=0;
            const heading=Math.atan2(guard.facing[0],guard.facing[1]);
            if(guard.status!=='SCAN')visual.model.rotation.y=heading;
            visual.sensor.rotation.y=heading-visual.model.rotation.y;
            visual.model.scale.setScalar(markerScale);
        }
    }

    _updateCutaways(state) {
        const subjects=[this.player];
        if(this.drone.visible)subjects.push(this.drone);
        for(const {model} of this.guardVisuals)if(model.visible)subjects.push(model);
        const ray=this.cutRay, bounds=this.cutBounds;
        this.camera.getWorldDirection(ray.direction).negate();
        const screenX=Math.cos(this.azimuth),screenZ=-Math.sin(this.azimuth);
        const next=new Set();
        for(const subject of subjects){
            const {x,z}=subject.position, scale=subject.scale.x;
            for(let y=Math.max(0,Math.floor(z)-2);y<=Math.min(state.height-1,Math.floor(z)+2);y++){
                for(let column=Math.max(0,Math.floor(x)-2);column<=Math.min(state.width-1,Math.floor(x)+2);column++){
                    const tile=this.tileGrid[y][column];
                    if(!tile?.wall?.visible || next.has(tile))continue;
                    bounds.min.set(column+.004,0,y+.004);
                    bounds.max.set(column+.996,2*tile.wall.position.y,y+.996);
                    for(const side of [0,-.16,.16]){
                        const offset=side*scale;
                        ray.origin.set(x+screenX*offset,.42*scale,z+screenZ*offset);
                        if(ray.intersectsBox(bounds)){next.add(tile);break;}
                    }
                }
            }
        }
        if(next.size===this.cutWalls.size && [...next].every(tile=>this.cutWalls.has(tile)))return false;
        const setCut=(tile,cut)=>{
            tile.cutaway=cut;
            if(!state.live)tile.wall.layers.set(cut?1:0);
            for(const detail of tile.wall.children)detail.visible=!cut;
        };
        for(const tile of this.cutWalls)if(!next.has(tile))setCut(tile,false);
        let i=0;
        for(const tile of next){
            setCut(tile,true);
            let mesh=this.cutawayPool[i];
            if(!mesh){
                mesh=new THREE.Mesh(this.geo.wall,this.cutawayMaterial);
                mesh.renderOrder=5;
                const edges=new THREE.LineSegments(this.cutEdges,this.cutLineMaterial);
                edges.renderOrder=6;
                mesh.add(edges);
                this.cutawayLayer.add(mesh);
                this.cutawayPool.push(mesh);
            }
            mesh.position.copy(tile.wall.position);
            mesh.scale.copy(tile.wall.scale);
            mesh.visible=true;
            i++;
        }
        for(;i<this.cutawayPool.length;i++)this.cutawayPool[i].visible=false;
        this.cutWalls=next;
        return true;
    }

    _renderFloorPulses(client) {
        let index=0;
        for(const {x,y,radius,opacity,color} of client.visualRings||[]){
            let ring=this.pulseRings[index++];
            if(!ring){
                ring=new THREE.Mesh(this.geo.ring,new THREE.MeshBasicMaterial({
                    transparent:true,depthWrite:false,toneMapped:false
                }));
                ring.rotation.x=-Math.PI/2;
                ring.renderOrder=4;
                this.pulseRings.push(ring);
                this.actors.add(ring);
            }
            ring.visible=true;
            ring.position.set(x,.024,y);
            ring.scale.setScalar(radius/.39);
            ring.material.color.set(color);
            ring.material.opacity=opacity;
        }
        for(;index<this.pulseRings.length;index++)this.pulseRings[index].visible=false;
    }

    _sync(client, heatmap) {
        const state=client.state;
        const showDrone=state.mode!=='campaign' && (this.preview || client.mazeRobotInSight);
        this.drone.visible=this.droneGlow.visible=this.droneCone.visible=showDrone;
        const syncKey=`${state.turn}/${state.patrol_ticks}/${client.explored.size}/${heatmap}/${client.targetingDecoy}/${!!client.showFullMap}/${client.showPatrolRoutes}`;
        if(this.lastSync===syncKey)return;
        this.lastSync=syncKey;
        let peak=0;for(const value of Object.values(state.belief||{}))peak=Math.max(peak,value);
        for(const tile of this.tiles){
            const visibility=this.preview?2:client._visibility(tile.x,tile.y);
            const known=visibility>0||client.showFullMap||heatmap;
            tile.floor.material=known && state.mode==='campaign' && this.floorVariants
                ? this.floorVariants[(tile.x*13+tile.y*17)%this.floorVariants.length]
                : visibility===2 ? this.material.visible : known ? this.material.memory : this.material.unknown;
            if(tile.wall){
                tile.wall.visible=tile.plinth.visible=this.firstPerson||known;
                tile.wall.material=this.firstPerson?(known?this.corridorMaterial:this.material.unknown):
                    visibility===2||this.preview||client.showFullMap?this.wallMaterials:this.material.wallMemory;
            }
            if(tile.grate)tile.grate.visible=known;
            if(tile.wash)tile.wash.visible=known;
            if(tile.heat){const probability=state.belief?.[`${tile.x},${tile.y}`]||0;tile.heat.visible=heatmap&&probability>0;tile.heat.material=this.heatMaterials[Math.min(31,Math.floor(probability/(peak||1)*31))];}
            if(tile.target)tile.target.visible=client.targetingDecoy&&visibility===2;
        }
        this.key.visible=!state.live&&!state.key_collected&&(this.preview||client.showFullMap||client._visibility(...state.key_pos)>0);
        this.exit.visible=this.preview||client.showFullMap||client._visibility(...state.exit_pos)>0;
        if(state.mode==='campaign'){
            this._syncTactics(client);
        }
        if(state.live){
            this.terrainColorsDirty=true;
            for(const {mark,cell} of this.roomMarkModels){
                mark.visible=this.preview||client.showFullMap||client._visibility(...cell)===2;
            }
            for(const {marker,cell} of this.thresholdModels){
                marker.visible=this.preview||client.showFullMap||client._visibility(...cell)>0;
            }
            for(let i=0;i<this.crystalModels.length;i++){
                const model=this.crystalModels[i], crystal=state.crystals[i];
                if(model)model.marker.visible=!!crystal&&(this.preview||client.showFullMap||client._visibility(...crystal)>0);
            }
            const color=state.key_collected?'#83efff':'#ffc775';
            this.exitCore.material.color.set(color);
            this.exitCore.material.emissive.set(state.key_collected?'#32c6f0':'#b56723');
            this.exitFrame.material.color.set(color);
            this.exitLight.color.set(color);
            this.exitMarker.material.color.set(color);
        }else if(this.exitCore?.material){
            this.exitCore.material.color.copy(this.material.blue.color);
            this.exitCore.material.emissive.copy(this.material.blue.emissive);
            this.exitFrame.material.color.set('#8aeaff');
            this.exitLight.color.set('#36b2e0');
            this.exitMarker?.material.color.set('#8aeaff');
        }
    }

    render(client, deltaTime=0, reducedMotion=false) {
        const T=THREE;
        if(!reducedMotion&&!client.state.game_over)this.time+=deltaTime;
        const state=client.state;
        const heatmap=!this.preview&&!!document.getElementById('heatmapToggle')?.checked;
        this._sync(client,heatmap);
        const markerScale=this.overview ? THREE.MathUtils.clamp(this.span/this.viewportHeight*33,1.15,1.75) : 1;
        this.player.scale.setScalar(markerScale);this.key.scale.setScalar(markerScale);this.drone.scale.setScalar(markerScale);
        const sneaking=(state.live||this.firstPerson)&&client.sneaking;
        if(sneaking)this.player.scale.y*=.72;
        const px=client.playerSmooth?.x??state.player[0], py=client.playerSmooth?.y??state.player[1];
        const stepX=px+.5-this.player.position.x,stepY=py+.5-this.player.position.z;
        const walking=Math.hypot(stepX,stepY)>.003;
        if(walking)this.player.rotation.y=Math.atan2(stepX,stepY);
        this.player.position.set(px+.5,0,py+.5);
        this.orb.position.y=.68+Math.sin(this.time*2.5)*.012;
        const cadence=sneaking?8:15;
        this.agentLegs.forEach((leg,index)=>{leg.rotation.x=walking&&!reducedMotion?Math.sin(this.time*cadence+index*Math.PI)*.4:0;});
        this.playerGlow.position.set(px+.5,.012,py+.5);
        const mx=client.monsterSmooth?.x??state.monster[0], my=client.monsterSmooth?.y??state.monster[1];
        const dx=mx+.5-this.drone.position.x,dz=my+.5-this.drone.position.z;
        if(Math.hypot(dx,dz)>.005)this.drone.rotation.y=Math.atan2(dx,dz);
        this.drone.position.set(mx+.5,Math.sin(this.time*3+.4)*.045,my+.5);
        this.droneGlow.position.set(mx+.5,.014,my+.5);
        this.droneCone.position.set(mx+.5,.018,my+.5);this.droneCone.rotation.z=-this.drone.rotation.y;
        this.key.position.y=.7+Math.sin(this.time*2)*.08;this.key.rotation.set(0,this.time*.45+.3,-Math.PI/6);
        this.exitCore.rotation.y=this.time*.6;this.exitCore.position.y=.3+Math.sin(this.time*2)*.035;
        if(state.mode==='campaign')this._renderTactics(client,deltaTime,reducedMotion,markerScale);
        this.hover.visible=!!(client.targetingDecoy&&client.hoverCell&&client._visibility(...client.hoverCell)===2&&state.grid[client.hoverCell[1]]?.[client.hoverCell[0]]!==1);
        if(this.hover.visible)this.hover.position.set(client.hoverCell[0]+.5,.028,client.hoverCell[1]+.5);
        this._renderFloorPulses(client);
        if(this.firstPerson){
            this.focus.set(px+.5,sneaking?-.16:0,py+.5);
        }else if(!this.preview && !this.overview){
            const follow=reducedMotion?1:1-Math.exp(-4*deltaTime);
            this.focus.lerp(new T.Vector3(px+.5,0,py+.5),follow);
        }
        const smooth=reducedMotion?1:1-Math.exp(-12*deltaTime);
        this.azimuth=this.firstPerson?this.targetAzimuth:this.azimuth+(this.targetAzimuth-this.azimuth)*smooth;
        if(this.overview && this.autoFit) {
            this.span=this._fitSpan(this.viewportWidth,this.viewportHeight);
            this._updateFrustum();
        }
        if(state.live) this.crystalModels.forEach((model,index)=>{
            if(!model?.marker.visible)return;
            model.gem.rotation.y=this.time*.85+index;
            model.gem.position.y=.58+Math.sin(this.time*2+index)*.075;
            const scale=Math.max(1,markerScale);
            model.gem.scale.set(scale,1.55*scale,scale);
        });
        this._updateCamera();
        const cutChanged=!this.firstPerson && this._updateCutaways(state);
        if(state.live && (cutChanged || this.terrainColorsDirty)){
            this._updateTerrainBatches(this.terrainColorsDirty);
            this.terrainColorsDirty=false;
        }
        this.renderer.render(this.scene,this.camera);
    }

    renderPreview(deltaTime,reducedMotion) {
        this.render({state:this.previewState,explored:new Set(),showFullMap:true,showPatrolRoutes:document.getElementById('routesToggle')?.checked??true,targetingDecoy:false,_visibility:()=>2},deltaTime,reducedMotion);
    }

    _updateCamera() {
        if(this.firstPerson){
            this.camera.position.set(this.focus.x,.62+this.focus.y,this.focus.z);
            this.camera.rotation.set(this.pitch,this.azimuth,0,'YXZ');
        }else{
            const horizontal=22*Math.cos(this.elevation);
            this.camera.position.set(this.focus.x+Math.sin(this.azimuth)*horizontal,22*Math.sin(this.elevation),this.focus.z+Math.cos(this.azimuth)*horizontal);
            this.camera.lookAt(this.focus.x,.15,this.focus.z);
        }
        for(const label of this.compassLabels){
            const sx=label.x*Math.cos(this.azimuth)-label.z*Math.sin(this.azimuth);
            const sy=(label.x*Math.sin(this.azimuth)+label.z*Math.cos(this.azimuth))*Math.sin(this.elevation);
            label.element.style.transform=`translate(${sx*24}px,${sy*24}px)`;
        }
    }

    resize(width,height) {
        const rect=this.canvas.parentElement.getBoundingClientRect();
        width=width||rect.width;height=height||rect.height;
        if(!width||!height)return;
        this.viewportWidth=width;this.viewportHeight=height;
        this.renderer.setSize(width,height,false);
        if(this.overview && this.autoFit) this.span=this._fitSpan(width,height);
        this._updateFrustum();this._updateCamera();
    }

    _updateFrustum() {
        const aspect=this.viewportWidth/this.viewportHeight;
        if(this.firstPerson)this.camera.aspect=aspect;
        else{
            this.camera.left=-this.span*aspect/2;this.camera.right=this.span*aspect/2;
            this.camera.top=this.span/2;this.camera.bottom=-this.span/2;
        }
        this.camera.updateProjectionMatrix();
    }

    _fitSpan(width,height) {
        const state=this.activeState;
        if(!state || !width || !height)return this.span;
        const sin=Math.abs(Math.sin(this.azimuth)),cos=Math.abs(Math.cos(this.azimuth));
        const horizontal=state.width*cos+state.height*sin;
        const vertical=(state.width*sin+state.height*cos)*Math.sin(this.elevation)+1.4;
        if (state.mode==='campaign') {
            const verticalPadding = height > 520 ? (width > 700 ? 150 : 208) : 106;
            const hudSafeHeight = height - verticalPadding;
            const widthPadding = width > 700 ? 110 : 40;
            return Math.max(vertical*height/Math.max(220,hudSafeHeight), horizontal*height/Math.max(150,width-widthPadding))*1.03;
        }
        return Math.max(vertical,horizontal/(width/height))*1.12+1;
    }

    setOverview(enabled) {
        if(this.firstPerson)return;
        if(!enabled){this.resetCamera();return;}
        this.overview=true;this.autoFit=true;
        this.focus.set(this.activeState.width/2,0,this.activeState.height/2);
        this.resize();
    }

    zoom(factor) {
        if(this.firstPerson)return;
        this.autoFit=false;
        const limit=Math.max(90,this._fitSpan(this.viewportWidth,this.viewportHeight)*1.5);
        this.span=THREE.MathUtils.clamp(this.span*factor,5,limit);
        this.resize();
    }
    rotate(quarterTurns=1) {this.targetAzimuth+=quarterTurns*Math.PI/2;}
    resetCamera() {
        if(this.firstPerson)return;
        this.overview=false;this.autoFit=false;this.targetAzimuth=this.defaultAzimuth;
        this.span=this.preview?9.3:8.8;
        if(this.preview){
            const [x,y]=this.activeState.player;
            this.focus.set(x+.5,0,y+.5);
        }
        this.resize();
    }

    pick(event) {
        const rect=this.canvas.getBoundingClientRect();
        this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        this.raycaster.setFromCamera(this.pointer,this.camera);
        // Reject wall faces: a click must reach the floor, not pass through a wall.
        const hit=this.raycaster.intersectObjects(this.world.children,false).find(item=>item.object.visible);
        if(!hit)return[-1,-1];
        return hit.object.userData.cell || [-1,-1];
    }

    _bindCamera() {
        this.canvas.addEventListener('wheel',event=>{event.preventDefault();this.zoom(Math.exp(event.deltaY*.001));},{passive:false});
        let drag=null;
        this.canvas.addEventListener('pointerdown',event=>{
            this.didDrag=false;
            if((!this.firstPerson&&window.quietGrid?.targetingDecoy)||event.button!==0)return;
            drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle:this.targetAzimuth,pitch:this.pitch};
            this.canvas.setPointerCapture(event.pointerId);
        });
        this.canvas.addEventListener('pointermove',event=>{
            if(!drag||drag.id!==event.pointerId)return;
            const distance=event.clientX-drag.x;
            const vertical=event.clientY-drag.y;
            if(Math.abs(distance)>5||(this.firstPerson&&Math.abs(vertical)>5))this.didDrag=true;
            if(this.didDrag){
                this.targetAzimuth=drag.angle-distance*.008;
                if(this.firstPerson)this.pitch=THREE.MathUtils.clamp(drag.pitch-vertical*.005,-1.15,.95);
            }
        });
        const finish=()=>{drag=null;};
        this.canvas.addEventListener('pointerup',finish);this.canvas.addEventListener('pointercancel',finish);
        this.canvas.addEventListener('lostpointercapture',finish);
    }

    _createCompass() {
        const compass=document.createElement('div');compass.className='scene-compass';compass.setAttribute('aria-hidden','true');
        this.compassLabels=[['С',0,-1],['Ш',1,0],['О',0,1],['Б',-1,0]].map(([text,x,z])=>{
            const element=document.createElement('span');element.textContent=text;compass.appendChild(element);return{element,x,z};
        });
        this.canvas.parentElement.appendChild(compass);
        this.compass=compass;
    }
}
window.QuietGrid3D=QuietGrid3D;
