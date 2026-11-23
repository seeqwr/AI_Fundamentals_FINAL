const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const Audio = vm.runInNewContext(fs.readFileSync(path.join(root,'audio.js'),'utf8')+'\nQuietGridAudio',{window:{}});
const {ClientAIEngine:Engine,QuietGridClient:Client,TacticalCampaign:Campaign} = vm.runInNewContext(
    fs.readFileSync(path.join(root,'game.js'),'utf8').split('window.quietGrid =')[0]
    +fs.readFileSync(path.join(root,'campaign.js'),'utf8')+'\n({ClientAIEngine,QuietGridClient,TacticalCampaign})'
);
const Scene = vm.runInNewContext(fs.readFileSync(path.join(root,'scene3d.js'),'utf8')+'\nQuietGrid3D',{window:{},ClientAIEngine:Engine});

test('all effects contain finite audible samples with safe peaks at common sample rates',()=>{
    for(const rate of [44100,48000])for(const name of ['step','glass','decoy','key','alert','drone','scan','listen','start','victory','defeat']){
        const samples=Audio.synthesize(name,rate);
        assert.ok(samples.length>rate*.1 && samples.length<rate*1.3,name);
        let energy=0,peak=0;
        for(const value of samples){assert.ok(Number.isFinite(value),name);energy+=value*value;peak=Math.max(peak,Math.abs(value));}
        assert.ok(Math.sqrt(energy/samples.length)>.01,name+' is silent');
        assert.ok(peak<=.651,name+' clips');
        assert.equal(Math.abs(samples[0]),0,name+' has a discontinuous attack');
        assert.ok(Math.abs(samples.at(-1))<.002,name+' has a discontinuous tail');
    }
    assert.throws(()=>Audio.synthesize('missing'),{name:'RangeError'});
});

test('muted and unsupported audio stays harmless and does not play',async()=>{
    const audio=new Audio();
    audio.setVolume(9);assert.equal(audio.volume,1);
    audio.setVolume(-1);assert.equal(audio.volume,0);
    audio.setVolume(.35);audio.setEnabled(false);
    assert.equal(await audio.unlock(),false);
    assert.equal(audio.play('start'),false);
    assert.equal(audio.context,null);
    audio.setEnabled(true);
    assert.equal(await audio.unlock(),false);
    assert.equal(audio.play('step'),false);
});

function arena() {
    return {width:11,height:11,grid:Array.from({length:11},(_,y)=>Array.from({length:11},(_,x)=>Number(x===0||y===0||x===10||y===10))),
        player:[2,2],monster:[8,8],key_pos:[8,7],exit_pos:[9,9],player_vision_radius:3,turn:0,decoys:3};
}

test('full map reveals distant terrain without granting sight or decoy range',()=>{
    const client=Object.create(Client.prototype);
    Object.assign(client,{state:arena(),showFullMap:true,explored:new Set()});
    assert.equal(client._mapKnown(8,8),true);
    assert.equal(client._visibility(8,8),0);
    assert.equal(client._mapKnown(-1,8),false);
    assert.throws(()=>Engine.processMove(client.state,'decoy',[8,8]));
    client.showFullMap=false;
    assert.equal(client._mapKnown(8,8),false);
    client.explored.add('8,8');
    assert.equal(client._mapKnown(8,8),true);
    assert.equal(client._visibility(8,8),1);
});

test('3D full map exposes walls and objectives while preserving hidden drones and local targets',()=>{
    const wall={x:8,y:8,floor:{},wall:{},plinth:{}};
    const floor={x:8,y:7,floor:{},target:{}};
    const scene={preview:false,lastSync:'',tiles:[wall,floor],material:{visible:'v',memory:'m',unknown:'u',wallMemory:'wall'},wallMaterials:[],
        key:{},exit:{},drone:{},droneGlow:{},droneCone:{}};
    const client={state:arena(),explored:new Set(),showFullMap:true,targetingDecoy:true,mazeRobotInSight:false,_visibility:()=>0};
    Scene.prototype._sync.call(scene,client,false);
    assert.equal(wall.wall.visible,true);
    assert.equal(scene.key.visible,true);
    assert.equal(scene.exit.visible,true);
    assert.equal(scene.drone.visible,false);
    assert.equal(scene.droneGlow.visible,false);
    assert.equal(floor.target.visible,false);
    client.mazeRobotInSight=true;
    Scene.prototype._sync.call(scene,client,false);
    assert.equal(scene.drone.visible,true);
    assert.equal(scene.droneCone.visible,true);
    client.showFullMap=false;
    Scene.prototype._sync.call(scene,client,false);
    assert.equal(wall.wall.visible,false);
    assert.equal(scene.key.visible,false);
    assert.equal(scene.exit.visible,false);
});

test('overview framing contains the full maze on both desktop and narrow screens',()=>{
    for(const width of [375,900])for(const size of [15,21,27])for(const azimuth of [0,Math.PI/4,Math.PI/2]){
        const scene={activeState:{width:size,height:size},azimuth,elevation:.87,span:9};
        const span=Scene.prototype._fitSpan.call(scene,width,540);
        const horizontal=size*(Math.abs(Math.cos(azimuth))+Math.abs(Math.sin(azimuth)));
        const vertical=horizontal*Math.sin(.87)+1.4;
        assert.ok(span>vertical);
        assert.ok(span*width/540>horizontal);
    }
});

test('random maze spawns the drone away from the player and opens facing a corridor',()=>{
    const scene=Object.create(Scene.prototype);
    const client=Object.create(Client.prototype);
    client.explored=new Set();
    for(const size of [11,15,21,27])for(let i=0;i<8;i++){
        const state=client.state=Engine.generateLevel(size,size);
        scene.targetAzimuth=scene._startingHeading(state);
        const forward=scene.movementVector(0,-1);
        const distance=Engine.distance(state.player,state.monster);
        assert.ok(distance>state.player_vision_radius);
        assert.ok(Engine.floor(state,state.player.map((n,j)=>Math.round(n+forward[j]))));
        assert.equal(client._visibility(...state.monster),0);
        assert.ok(Engine.bfsReachable(state.grid,size,size,state.player,state.monster));
        assert.equal(Engine.same(state.key_pos,state.monster),false);
    }
});

test('the map toggle tracks the current drone at any distance independently of fog and world sight',()=>{
    const client=Object.create(Client.prototype);
    const state=arena();
    Object.assign(client,{state,explored:new Set(),mazePosition:[2,2],monsterSmooth:{x:8,y:8},showRobotOnMap:true});
    assert.equal(client.mazeRobotInSight,true);
    state.grid[4][4]=1;
    assert.equal(client.mazeRobotInSight,false);
    for(const full of [true,false]){
        client.showFullMap=full;
        assert.deepEqual(Array.from(client.mappedMazeRobot),[8,8]);
        client.showRobotOnMap=false;
        assert.equal(client.mappedMazeRobot,null);
        client.monsterSmooth={x:2,y:8};
        assert.equal(client.mazeRobotInSight,true);
        assert.equal(client.mappedMazeRobot,null);
        client.showRobotOnMap=true;
        assert.deepEqual(Array.from(client.mappedMazeRobot),[2,8]);
        client.monsterSmooth={x:8,y:8};
    }
    client.mazePosition=null;
    assert.equal(client.mappedMazeRobot,null);
});

test('continuous sight across a long corridor stops at walls and sealed diagonal corners',()=>{
    const state=arena();
    for(const [start,end] of [[[1.2,4],[9,4.25]],[[9,4.25],[1.2,4]]]){
        state.grid[4][6]=0;
        assert.ok(Engine.openSightSegment(state,start,end));
        state.grid[4][6]=1;
        assert.equal(Engine.openSightSegment(state,start,end),false);
    }
    state.grid[2][3]=1;
    assert.equal(Engine.openSightSegment(state,[2,2],[6,6]),false);
});

test('maze movement follows arbitrary camera angles with sector speed, collision and silent cell crossings',async()=>{
    const scene=Object.create(Scene.prototype);
    scene.targetAzimuth=-Math.PI/6;scene.firstPerson=true;
    const client=Object.create(Client.prototype);
    Object.assign(client,{scene3d:scene,viewMode:'3d',state:arena(),mazePosition:[2,2],sneaking:false});
    const actions=[];
    client.sendMove=async(direction,cell,sneaking)=>{
        actions.push({direction,cell,sneaking});client.state.player=cell;
    };
    await client._walkMaze(0,-1,.1);
    assert.ok(Math.abs(client.mazePosition[0]-2-Campaign.walkSpeed*.1*.5)<1e-7);
    assert.ok(Math.abs(client.mazePosition[1]-2+Campaign.walkSpeed*.1*Math.sqrt(3)/2)<1e-7);
    assert.equal(actions.length,0);
    scene.targetAzimuth=0;client.mazePosition=[2,2];client.sneaking=true;
    await client._walkMaze(1,1,.6);
    const delta=.6*Campaign.walkSpeed*.5/Math.sqrt(2);
    assert.ok(client.mazePosition.every(n=>Math.abs(n-2-delta)<1e-7));
    assert.equal(actions.length,1);
    assert.equal(actions[0].direction,'walk');assert.equal(actions[0].sneaking,true);
    assert.deepEqual(Array.from(actions[0].cell),[3,3]);
    client.state.grid[3][4]=1;
    await client._walkMaze(1,0,1);
    assert.ok(Math.abs(client.mazePosition[0]-(3.5-Campaign.bodyRadius))<1e-7);
    assert.equal(actions.length,1);
});

test('turn effects distinguish glass, pickups and endings without sounding hidden drone moves',()=>{
    const heard=[];
    const previous={...arena(),game_over:false,key_collected:false,ai_status:'PATROL'};
    const client=Object.create(Client.prototype);
    Object.assign(client,{audio:{play:name=>heard.push(name)},viewMode:'2d',_visibility:()=>0});
    client.state={...previous,turn:1,monster:[8,7]};
    client._playTurnAudio(previous);assert.deepEqual(heard,[]);
    client.state={...previous,turn:1,player:[2,3],stepped_on_noise:false};
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['step']);
    client.state.stepped_on_noise=true;
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['glass']);
    client.state={...previous,turn:1,last_decoy:[2,3]};
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['decoy']);
    client.state={...previous,turn:1,key_collected:true};
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['key']);
    client.state={...previous,turn:1,game_over:true,victory:true};
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['victory']);
    client.state.victory=false;
    client._playTurnAudio(previous);assert.deepEqual(heard.splice(0),['defeat']);
    client.state={...previous};
    client._playTurnAudio(previous);assert.deepEqual(heard,[]);
});

test('visible sentries signal the start of a scan or investigation once',()=>{
    const played=[];
    const client=Object.create(Client.prototype);
    const guard={id:0,position:[3,2],status:'PATROL'};
    const previous={...arena(),live:true,patrol_ticks:1,guards:[guard]};
    Object.assign(client,{audio:{play:(name,options)=>played.push({name,...options})},viewMode:'2d',_visibility:()=>2});
    for(const [status,cue] of [['SCAN','scan'],['INVESTIGATE','listen']]){
        client.state={...previous,guards:[{...guard,status}],patrol_ticks:2};
        client._playTurnAudio(previous);
        assert.equal(played.length,1);
        const sound=played.pop();
        assert.equal(sound.name,cue);assert.ok(sound.pan>0&&sound.gain>0);
        client._playTurnAudio({...client.state,patrol_ticks:1});
        assert.equal(played.length,0);
    }
    client._visibility=()=>0;
    client._playTurnAudio(previous);
    assert.equal(played.length,0);
});
