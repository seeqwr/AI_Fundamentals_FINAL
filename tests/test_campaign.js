const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const Engine=vm.runInNewContext(fs.readFileSync(path.join(root,'game.js'),'utf8').split('window.quietGrid =')[0]+'\nClientAIEngine');
const Campaign=vm.runInNewContext(fs.readFileSync(path.join(root,'campaign.js'),'utf8')+'\nTacticalCampaign',{ClientAIEngine:Engine,window:{}});
const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];

// Independent periodic planner: use only quiet tiles and reject every visible/colliding step.
// Its route is then replayed through the complete HMM/FSM game engine.
function solveQuietly(state) {
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    const period=state.guards.reduce((p,g)=>p*g.route.length/gcd(p,g.route.length),1);
    const patrols=Array.from({length:period},(_,t)=>state.guards.map(guard=>{
        const position=guard.route[t%guard.route.length];
        const before=t?guard.route[(t-1)%guard.route.length]:null;
        const facing=before?[position[0]-before[0],position[1]-before[1]]:guard.facing;
        return {...guard,position,facing};
    }));
    const safe=(position,t)=>patrols[t%period].every(g=>!equal(g.position,position)&&!Campaign.canSee(state,g,position));
    const queue=[{position:state.player,key:false,turn:0,previous:-1,action:null}];
    const visited=new Set([state.player.join(',')+',0,0']);
    const moves={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],wait:[0,0]};
    for(let head=0;head<queue.length;head++){
        const current=queue[head];
        if(current.key&&equal(current.position,state.exit_pos)){
            const actions=[];let index=head;
            while(queue[index].previous>=0){actions.push(queue[index].action);index=queue[index].previous;}
            return actions.reverse();
        }
        for(const [action,[dx,dy]] of Object.entries(moves)){
            const position=[current.position[0]+dx,current.position[1]+dy];
            if(!Engine.floor(state,position)||state.grid[position[1]][position[0]]===2)continue;
            if(!safe(position,current.turn)||!safe(position,current.turn+1))continue;
            const key=current.key||equal(position,state.key_pos),turn=current.turn+1;
            const hash=position.join(',')+','+Number(key)+','+turn%period;
            if(visited.has(hash))continue;
            visited.add(hash);queue.push({position,key,turn,action,previous:head});
        }
    }
    return null;
}

for(let index=0;index<3;index++)test('mission '+(index+1)+' has a complete undetected playable solution',()=>{
    let state=Campaign.createLevel(index);
    assert.equal(state.guards.length,index+1);
    for(const guard of state.guards)for(let i=0;i<guard.route.length;i++){
        const a=guard.route[i],b=guard.route[(i+1)%guard.route.length];
        assert.ok(Engine.floor(state,a));assert.equal(Engine.distance(a,b),1);
    }
    const actions=solveQuietly(state);
    assert.ok(actions&&actions.length>0,'No quiet winning path');
    assert.ok(actions.length<160,'Mission is excessively long');
    for(const action of actions){
        state=Campaign.processMove(state,action);
        if(!state.victory)assert.equal(state.game_over,false,'Caught during a verified route');
        assert.ok(state.guards.every(g=>g.status!=='CHASE'),'A quiet route unexpectedly alerts a guard');
        assert.ok(Math.abs(Object.values(state.belief).reduce((sum,p)=>sum+p,0)-1)<1e-8);
        assert.equal(new Set(state.guards.map(g=>g.position.join(','))).size,state.guards.length);
    }
    assert.equal(state.victory,true);assert.equal(state.key_collected,true);
    assert.ok(equal(state.player,state.exit_pos));
    assert.equal(Campaign.processMove(state,'wait'),state);
});

test('guard vision is directional and blocked by cover',()=>{
    const state=Campaign.createLevel(0),guard=state.guards[0];
    assert.equal(Campaign.canSee(state,guard,[8,2]),true);
    assert.equal(Campaign.canSee(state,guard,[5,2]),false);
    guard.position=[6,4];guard.facing=[1,0];
    assert.equal(Campaign.canSee(state,guard,[9,4]),false);
    for(const p of Campaign.visionPolygon(state,guard).slice(1)){
        assert.ok(Engine.floor(state,p.map(Math.floor)));
        assert.ok(Engine.lineOfSight(state,guard.position,p.map(Math.floor)));
    }
});

test('a nearby decoy changes the patrol target, invalid throws do not spend anything',()=>{
    const initial=Campaign.createLevel(0);initial.player=[4,8];
    const next=Campaign.processMove(initial,'decoy',[5,7]);
    assert.equal(next.decoys,2);assert.equal(next.turn,1);
    assert.equal(next.guards[0].status,'INVESTIGATE');
    assert.ok(equal(next.guards[0].target,[5,7]));
    const before=JSON.stringify(initial);
    assert.throws(()=>Campaign.processMove(initial,'decoy',[10,2]));
    assert.equal(JSON.stringify(initial),before);
});

test('contact is lethal and an exit requires its key',()=>{
    let state=Campaign.createLevel(0);
    state.player=[state.guards[0].position[0]-1,state.guards[0].position[1]];
    const caught=Campaign.processMove(state,'right');assert.equal(caught.game_over,true);assert.equal(caught.victory,false);
    state=Campaign.createLevel(0);state.player=[state.exit_pos[0]-1,state.exit_pos[1]];
    assert.equal(Campaign.processMove(state,'right').victory,false);
    state.key_collected=true;assert.equal(Campaign.processMove(state,'right').victory,true);
});

test('generated sectors have distinct outlines, clustered objectives and patrols that cross rooms',()=>{
    const footprints=new Set();
    const layouts=new Set();
    for(let seed=1;seed<=36;seed++){
        let value=Math.imul(seed,0x9e3779b1)>>>0;
        const random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/0x100000000);
        const first=[random(),random(),random()];
        const [layout,flipX,flipY]=first;
        const plan=Campaign.sectorPlans[Math.floor(layout*Campaign.sectorPlans.length)];
        const state=Campaign.generateSector(()=>first.length?first.shift():random());
        const inRoom=([x,y],[left,top,w,h])=>{
            const px=flipX<.5?state.width-1-x:x,py=flipY<.5?state.height-1-y:y;
            return px>=left && px<left+w && py>=top && py<top+h;
        };
        layouts.add(state.width+'x'+state.height);
        assert.ok(state.footprint.flat().filter(Boolean).length<state.width*state.height*.86);
        assert.ok(state.footprint.every((row,y)=>row.every((solid,x)=>solid||state.grid[y][x]===1)));
        assert.equal(state.crystals.length,6);
        assert.equal(new Set(state.crystals.map(cell=>cell.join(','))).size,6);
        for(const start of [0,3])assert.equal(Engine.distance(state.crystals[start],state.crystals[start+2]),2);
        assert.equal(state.guards.length,3);
        const occupied=new Set();
        for(const guard of state.guards){
            assert.ok(plan.rooms.filter(room=>guard.route.some(cell=>inRoom(cell,room))).length>=2);
            assert.ok(guard.route.some(cell=>!plan.rooms.some(room=>inRoom(cell,room))));
            assert.ok(!Campaign.canSee(state,guard,state.player));
            for(const [i,cell] of guard.route.entries()){
                assert.ok(Engine.floor(state,cell));
                assert.equal(Engine.distance(cell,guard.route[(i+1)%guard.route.length]),1);
                assert.ok(!occupied.has(cell.join(',')),'patrol loops can block each other');
            }
            for(const cell of guard.route)occupied.add(cell.join(','));
        }
        for(const objective of [...state.crystals,state.exit_pos]){
            assert.ok(Engine.floor(state,objective));
            assert.ok(Engine.bfsReachable(state.grid,state.width,state.height,state.player,objective));
        }
        footprints.add(JSON.stringify(state.grid));
    }
    assert.equal(layouts.size,3);
    assert.ok(footprints.size>=24);
    let sector=Campaign.generateSector(()=>.42);
    for(let i=0;i<3;i++){
        const next=Campaign.generateSector(()=>.42,sector.sectorPlan);
        assert.notEqual(next.sectorPlan,sector.sectorPlan);
        sector=next;
    }
});

test('independent patrol ticks move guards without stepping the player',()=>{
    const initial=Campaign.generateSector(()=>.42);
    const playerStep=Campaign.processMove(initial,'down');
    assert.ok(!equal(playerStep.player,initial.player));
    assert.deepEqual(playerStep.guards.map(g=>g.position),initial.guards.map(g=>g.position));
    const after=Campaign.tick(playerStep);
    assert.equal(after.patrol_ticks,1);
    assert.equal(after.turn,playerStep.turn);
    assert.ok(equal(after.player,playerStep.player));
    assert.ok(after.guards.some((g,i)=>!equal(g.position,playerStep.guards[i].position)));
    assert.equal(initial.patrol_ticks,0);
});

test('sector exit checks the last crystal and collected crystals cannot count twice',()=>{
    let state=Campaign.generateSector(()=>.42);
    const total=state.crystals.length;
    const spawn=state.player;
    state.player=[state.exit_pos[0]-1,state.exit_pos[1]];
    state=Campaign.processMove(state,'right');
    assert.equal(state.victory,false);
    assert.match(state.message,/жабық/);
    const [x,y]=state.crystals.at(-1);
    state={...state,crystals:state.crystals.map((cell,i)=>i===total-1?cell:null),crystalsCollected:total-1,
        player:[x,y],guards:state.guards.map(g=>({...g,position:spawn}))};
    const collected=Campaign.processMove(state,'wait');
    assert.equal(collected.crystalsCollected,total);
    assert.equal(collected.key_collected,true);
    assert.equal(state.crystalsCollected,total-1);
    assert.equal(Campaign.processMove(collected,'wait').crystalsCollected,total);
    collected.player=[collected.exit_pos[0]-1,collected.exit_pos[1]];
    assert.equal(Campaign.processMove(collected,'right').victory,true);
});

function liveArena(rows,player,patrols){
    const grid=rows.map(row=>Array.from(row,ch=>ch==='#'?1:ch==='='?2:0));
    const state=Campaign.createState({player,key:[1,1],exit:[1,1],patrols},grid,null);
    for(const guard of state.guards)guard.vision=0;
    return {...state,live:true,crystals:[[1,1]],crystalsCollected:0,patrol_ticks:0,pendingSounds:[]};
}

test('free walking has fixed speed across headings and frame rates and stops between centres',()=>{
    const initial=liveArena(['##########','#........#','#........#','#........#','#........#',
        '#........#','#........#','##########'],[2,2],[[[8,5],[8,6]]]);
    for(const frames of [10,30,144])for(const [dx,dy] of [[1,0],[1,1],[1,.35]]){
        let state=initial;
        for(let i=0;i<frames;i++)state=Campaign.walk(state,dx,dy,1/frames);
        const [x,y]=state.playerPosition;
        assert.ok(Math.abs(Math.hypot(x-2,y-2)-2.6)<1e-8);
        assert.ok(Math.abs((y-2)/(x-2)-dy/dx)<1e-8);
        assert.ok(equal(state.player,[Math.round(x),Math.round(y)]));
        assert.equal(Campaign.walk(state,0,0,1),state);
        assert.equal(state.pendingSounds.length,3);
    }
    assert.equal(initial.playerPosition,undefined);
    assert.equal(initial.pendingSounds.length,0);
});

test('walls allow sliding and single-file travel while sealed diagonal corners stay closed',()=>{
    const initial=liveArena(['#########','#...#...#','#...#...#','#...#...#','#...#...#',
        '#.......#','#########'],[3,2],[[[7,1],[7,2]]]);
    const sliding=Campaign.walk(initial,1,1,.8);
    assert.ok(Math.abs(sliding.playerPosition[0]-(3.5-Campaign.bodyRadius))<1e-8);
    assert.ok(sliding.playerPosition[1]>3.4);
    const wall=Campaign.walk(sliding,1,0,.8);
    assert.equal(wall.pendingSounds.length,sliding.pendingSounds.length);
    assert.ok(equal(wall.playerPosition,sliding.playerPosition));
    const corner=liveArena(['#######','#..#..#','#..#..#','###...#','#.....#','#######'],
        [2,2],[[[5,3],[5,4]]]);
    const blocked=Campaign.walk(corner,1,1,1);
    assert.ok(equal(blocked.player,[2,2]));
});

test('each guard hears the strongest sound in its own range and investigates beyond four ticks',()=>{
    const start=liveArena(['###############','#.............#','#.............#','#.............#',
        '###############'],[2,2],[[[6,2],[6,1]],[[13,2],[13,1]]]);
    const walked=Campaign.walk(start,1,0,.4);
    const normal=Campaign.tick(walked);
    assert.equal(normal.guards[0].status,'INVESTIGATE');
    assert.ok(equal(normal.guards[0].target,[3,2]));
    assert.equal(normal.guards[1].status,'PATROL');
    const thrown=Campaign.processMove(walked,'decoy',[4,2]);
    const withDecoy=Campaign.tick(thrown);
    assert.ok(withDecoy.guards.every(g=>equal(g.target,[4,2])));
    assert.equal(withDecoy.guards[1].status,'INVESTIGATE');
    // A distant flask is inaudible to guard 1, whose nearby footstep is in the same interval.
    const split=Campaign.advanceGuards({...start,guards:start.guards.map(g=>({...g}))},[
        {position:[13,3],range:1},{position:[1,1],range:3,decoy:true}
    ]);
    assert.ok(equal(split.guards[0].target,[1,1]));
    assert.ok(equal(split.guards[1].target,[13,3]));

    const corridor=liveArena(['############','#....#.....#','#....#.....#','#....#.....#','#..........#',
        '############'],[3,1],[[[7,1],[8,1]]]);
    let state=Campaign.processMove(corridor,'decoy',[4,1]);
    for(let i=0;i<12&&!equal(state.guards[0].position,[4,1]);i++){
        const before=state.guards[0].position;
        state=Campaign.tick(state);
        assert.equal(Engine.distance(before,state.guards[0].position),1);
        assert.ok(Engine.floor(state,state.guards[0].position));
        assert.ok(equal(state.guards[0].target,[4,1]));
    }
    assert.ok(equal(state.guards[0].position,[4,1]));
});

test('entering a grate rings at once and can be heard beyond ordinary step range',()=>{
    const start=liveArena(['############','#..........#','#..=.......#','############'],
        [2,2],[[[9,2],[9,1]]]);
    const crossed=Campaign.walk(start,1,0,.21);
    assert.equal(crossed.stepped_on_noise,true);
    const heard=Campaign.tick(crossed);
    assert.equal(heard.guards[0].status,'INVESTIGATE');
    assert.ok(equal(heard.guards[0].target,[3,2]));
    assert.equal(heard.pendingSounds.length,0);
});

test('sneaking halves speed and stays silent across floor and grates until walking resumes',()=>{
    const start=liveArena(['##########','#........#','#..==....#','#........#','##########'],
        [2,2],[[[5,3],[6,3]]]);
    const quiet=Campaign.walk(start,1,0,2,true);
    assert.ok(Math.abs(quiet.playerPosition[0]-4.6)<1e-8);
    assert.equal(quiet.pendingSounds.length,0);
    assert.equal(quiet.footstep,false);
    assert.equal(quiet.stepped_on_noise,false);
    const patrol=Campaign.tick(quiet);
    assert.equal(patrol.guards[0].status,'PATROL');
    const loud=Campaign.walk(patrol,-1,0,.25);
    assert.equal(loud.stepped_on_noise,true);
    assert.equal(Campaign.tick(loud).guards[0].status,'INVESTIGATE');
    // Crouching after a loud step cannot take back the sound already emitted.
    const quietAgain=Campaign.walk(loud,-1,0,.1,true);
    assert.equal(quietAgain.footstep,false);
    assert.deepEqual(quietAgain.pendingSounds,loud.pendingSounds);
});

test('a guard sees a sneaking player enter its cone and can catch them',()=>{
    const start=liveArena(['#########','#.......#','#..=....#','#.......#','#########'],
        [2,2],[[[6,2],[6,3]]]);
    const guard=start.guards[0];
    guard.vision=3;guard.facing=[-1,0];
    assert.equal(Campaign.canSee(start,guard,start.player),false);
    const seen=Campaign.walk(start,1,0,1,true);
    assert.equal(seen.pendingSounds.length,0);
    assert.equal(seen.guards[0].status,'CHASE');
    assert.ok(equal(seen.guards[0].target,seen.player));
    assert.equal(Campaign.walk(seen,1,0,2,true).game_over,true);
});

test('opposing guards use a side bay to pass in a one-cell corridor',()=>{
    const state=liveArena(['##########','###.######','#........#','##########'],
        [3,1],[[[4,2],[8,2]],[[5,2],[1,2]]]);
    const [a,b]=state.guards;
    a.target=[8,2];b.target=[1,2];
    let usedBay=false;
    for(let tick=0;tick<15;tick++)for(const guard of state.guards){
        const next=Campaign.guardStep(state,guard);
        if(next){
            assert.equal(Engine.distance(guard.position,next),1);
            assert.ok(Engine.floor(state,next));
            guard.position=next;
        }
        usedBay||=equal(guard.position,[3,1]);
        assert.ok(!equal(a.position,b.position));
    }
    assert.ok(usedBay);
    assert.ok(equal(a.position,a.target)&&equal(b.position,b.target));
});

test('a guard completes its detour around an occupied tile',()=>{
    const state=liveArena(['########','#......#','#......#','########'],[1,2],
        [[[1,1],[6,1]],[[3,1],[3,2]]]);
    const [guard,blocker]=state.guards;
    guard.target=[6,1];blocker.target=blocker.position;
    for(let i=0;i<8&&!equal(guard.position,guard.target);i++){
        const next=Campaign.guardStep(state,guard);
        assert.ok(next&&!equal(next,blocker.position));
        guard.position=next;
    }
    assert.ok(equal(guard.position,guard.target));
});

test('a moving guard catches a player standing between cell centres',()=>{
    const start=liveArena(['########','#......#','#......#','########'],[3,2],[[[4,2],[3,2]]]);
    const moved=Campaign.walk(start,1,0,.17);
    assert.equal(moved.game_over,false);
    assert.ok(moved.playerPosition[0]>3.4);
    assert.equal(Campaign.tick(moved).game_over,true);
});

test('new sectors can change design independently of the plan and keep their design while playing',()=>{
    const seen=new Set();
    let seed=57;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000);
    let previous=null;
    for(let i=0;i<24;i++){
        const s=Campaign.generateSector(random,previous?.sectorPlan,previous?.design.id);
        assert.notEqual(s.design.id,previous?.design.id);
        seen.add(s.sectorPlan+'/'+s.design.id);
        assert.equal(s.roomMarks.length,Campaign.sectorPlans[s.sectorPlan].rooms.length);
        assert.equal(Campaign.tick(s).design,s.design);
        previous=s;
    }
    assert.ok(seen.size>6);
});

test('guards look down open sightlines while stationary, then resume or react to new evidence',()=>{
    const state=liveArena(['#########','#.......#','#.......#','#.......#','#.......#','#.......#','#########'],
        [1,1],[[[4,3],[6,3]]]);
    const guard=state.guards[0];
    guard.target=guard.position;guard.memory=4;guard.status='INVESTIGATE';
    const first=Campaign.tick(state), second=Campaign.tick(first), resumed=Campaign.tick(second);
    for(const s of [first,second]){
        assert.equal(s.guards[0].status,'SCAN');
        assert.ok(equal(s.guards[0].position,guard.position));
    }
    assert.ok(!equal(first.guards[0].facing,second.guards[0].facing));
    assert.equal(resumed.guards[0].status,'PATROL');
    assert.ok(!equal(resumed.guards[0].position,guard.position));
    const heard=Campaign.tick({...first,pendingSounds:[{position:[3,2],range:1}]});
    assert.equal(heard.guards[0].status,'INVESTIGATE');
    assert.ok(equal(heard.guards[0].target,[3,2]));
    guard.memory=0;guard.status='PATROL';guard.patrolSteps=14;
    assert.equal(Campaign.tick(state).guards[0].status,'SCAN');
    const [dx,dy]=first.guards[0].facing;
    state.player=[Math.round(4+2*dx),Math.round(3+2*dy)];
    const spotted=Campaign.tick({...first,player:state.player,
        guards:[{...first.guards[0],vision:4}]});
    assert.equal(spotted.guards[0].status,'CHASE');
    assert.ok(equal(spotted.guards[0].target,state.player));
});
