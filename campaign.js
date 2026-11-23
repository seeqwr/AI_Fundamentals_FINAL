/* Original, authored tactical missions. The classic maze engine remains separate. */
class TacticalCampaign {
    static missions = [
        {name:'Көз алдында',brief:'Патрульдің қай жаққа бұрылатынын бақыла. Кілтті алып, тасаларды бойлай күзет бекетін айналып өт.',
            size:[13,11],player:[1,8],key:[10,3],exit:[11,8],
            cover:[[3,3,1,4],[4,6,2,1],[7,3,2,2],[1,5,1,1],[7,7,1,2],[8,8,2,1],[10,6,2,1]],noise:[[5,8],[6,8],[9,6]],
            patrols:[[[6,2],[10,2],[10,5],[6,5]]]},
        {name:'Қос патруль',brief:'Өткелді екі бекет күзетеді. Күту үшін бос орын пернесін, күзетшіні алаңдату үшін E пернесін бас.',
            size:[15,11],player:[1,8],key:[12,4],exit:[13,8],
            cover:[[3,3,3,1],[5,4,1,1],[2,7,4,1],[5,8,1,1],[10,3,1,3],[11,5,1,1],[7,7,1,3],[11,9,3,1]],noise:[[5,5],[6,5],[8,7],[8,8]],
            patrols:[[[2,2],[7,2],[7,5],[2,5]],[[9,2],[13,2],[13,8],[9,8]]]},
        {name:'Тыныш торап',brief:'Мұнда үш патруль бағыты мен шулы өткелдер бар. Байқалмай өт немесе жолыңдағы күзетшіні құты лақтырып алаңдат.',
            size:[17,13],player:[1,10],key:[15,3],exit:[15,10],
            cover:[[3,3,1,3],[4,5,1,1],[2,8,3,1],[4,9,1,2],[8,2,1,3],[9,4,1,1],[8,8,2,2],[13,4,2,2],[13,8,1,3],[14,10,1,1]],
            noise:[[6,8],[7,8],[11,3],[12,3],[10,11],[11,11]],
            patrols:[[[2,2],[6,2],[6,6],[2,6]],[[7,6],[11,6],[11,10],[7,10]],[[12,2],[15,2],[15,6],[12,6]]]}
    ];

    static createLevel(index=0) {
        const missionIndex=Math.max(0,Math.min(this.missions.length-1,Number(index)||0));
        const mission=this.missions[missionIndex], [width,height]=mission.size;
        const grid=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>Number(x===0||y===0||x===width-1||y===height-1)));
        for(const [x,y,w,h] of mission.cover)for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)grid[y+dy][x+dx]=1;
        for(const [x,y] of mission.noise)grid[y][x]=2;
        return this.createState(mission,grid,missionIndex);
    }

    static sectorPlans = [
        {
            size:[34,23], player:[2,12], exit:[29,20],
            rooms:[[2,3,7,7],[11,2,6,6],[7,14,8,7],[17,13,7,8],[23,3,7,6],[27,11,5,7]],
            halls:[[8,5,4,2],[7,8,7,2],[11,7,3,2],[14,15,4,2],[14,18,4,2],
                [27,8,3,4],[24,7,2,8],[24,13,4,2],[2,11,24,3],[5,9,2,3],[10,13,3,2],
                [19,20,5,2],[23,17,5,2],[28,17,4,4]],
            patrols:[[[4,5],[14,5],[14,7],[12,8],[5,8]],
                [[9,15],[20,15],[20,19],[9,19]],[[24,5],[28,5],[28,13],[27,14],[24,14]]],
            caches:[[[12,2],[13,2],[14,2]],[[20,21],[21,21],[22,21]]],
            covers:[[[4,4],[5,4]],[[14,6],[15,6]],[[11,17],[12,17]],[[19,17],[20,17]],[[26,6],[26,7]],[[30,13],[30,14]]],
            grates:[[9,5],[16,19],[25,12],[28,9],[6,11],[24,18]],
            thresholds:[[5,10,2],[10,13,3],[27,9,3],[28,19,4]]
        },
        {
            size:[29,27], player:[15,24], exit:[25,21],
            rooms:[[2,2,7,8],[11,2,7,8],[20,4,7,6],[20,13,7,6],[3,13,9,5],[2,21,11,4]],
            halls:[[8,4,4,2],[8,8,4,2],[23,9,3,5],[20,9,2,5],[4,17,2,5],[8,17,3,5],
                [13,8,3,17],[15,7,6,3],[15,16,6,3],[11,14,4,3],[11,22,4,3],[13,19,4,6],[23,18,4,4]],
            patrols:[[[5,4],[14,4],[14,8],[5,8]],
                [[21,6],[25,6],[25,16],[21,16],[21,13]],[[5,15],[9,15],[9,23],[5,23]]],
            caches:[[[3,3],[3,4],[3,5]],[[26,13],[26,14],[26,15]]],
            covers:[[[6,6],[7,6]],[[12,6],[13,6]],[[23,7],[23,8]],[[22,14],[23,14]],
                [[6,15],[6,16]],[[7,21],[7,22]]],
            grates:[[9,4],[24,11],[20,12],[9,19],[13,12],[16,23]],
            thresholds:[[13,11,3],[23,11,3],[8,19,3],[23,19,4]]
        },
        {
            size:[33,25], player:[3,22], exit:[29,5],
            rooms:[[2,13,7,8],[11,12,6,8],[8,2,6,8],[17,2,6,8],[22,9,9,6],[22,17,8,5]],
            halls:[[8,14,4,2],[8,18,4,2],[2,20,4,4],[7,1,5,2],[13,4,5,2],[13,8,5,2],[14,9,3,4],
                [16,9,5,3],[23,14,2,4],[27,14,3,4],[16,17,7,3],[20,10,3,2],[28,4,3,6]],
            patrols:[[[4,14],[12,14],[12,18],[5,18]],
                [[10,4],[18,4],[18,8],[11,8]],[[24,11],[28,11],[28,19],[24,19]]],
            caches:[[[7,1],[8,1],[9,1]],[[25,21],[26,21],[27,21]]],
            covers:[[[5,16],[6,16]],[[13,16],[13,17]],[[11,6],[12,6]],[[19,6],[20,6]],
                [[25,13],[26,13]],[[25,18],[26,18]]],
            grates:[[9,14],[15,10],[14,8],[20,18],[28,15],[29,8]],
            thresholds:[[14,11,3],[28,7,3],[27,16,3],[2,21,4]]
        }
    ];

    static designs = [
        {id:'relay',name:'Реле торабы',void:'#0b1419',floor:'#384c50',floorAlt:'#415759',
            wall:'#78897d',edge:'#a9b99d',trim:'#d8f78d',cone:'#ecfa8f',crystal:'#96ffda'},
        {id:'kiln',name:'Жылу алмастырғыш',void:'#161219',floor:'#504249',floorAlt:'#5d4c50',
            wall:'#967e72',edge:'#c7ab8d',trim:'#ffa975',cone:'#ffe493',crystal:'#a9f7ff'},
        {id:'basin',name:'Криокамера',void:'#0c1322',floor:'#34465e',floorAlt:'#40536b',
            wall:'#7889a4',edge:'#bbc9d8',trim:'#95cbff',cone:'#d9d0ff',crystal:'#9cffe0'}
    ];

    static generateSector(random=Math.random,previousPlan=null,previousDesign=null) {
        const choices=this.sectorPlans.map((_,i)=>i).filter(i=>i!==previousPlan);
        const sectorPlan=choices[Math.floor(random()*choices.length)];
        const plan=this.sectorPlans[sectorPlan];
        const [width,height]=plan.size;
        const flipX=random()<.5,flipY=random()<.5;
        const cell=([x,y])=>[flipX?width-1-x:x,flipY?height-1-y:y];
        const grid=Array.from({length:height},()=>Array(width).fill(1));
        for(const [x,y,w,h] of [...plan.rooms,...plan.halls]){
            for(let row=y;row<y+h;row++)for(let column=x;column<x+w;column++){
                const [gx,gy]=cell([column,row]);
                grid[gy][gx]=0;
            }
        }
        // The collision grid keeps its usual wall values outside the physical deck.
        const footprint=grid.map((row,y)=>row.map((_,x)=>{
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(grid[y+dy]?.[x+dx]===0)return true;
            return false;
        }));
        const fixtures=plan.covers.filter(()=>random()<.82).flat().map(cell);
        for(const [x,y] of fixtures)grid[y][x]=1;
        for(const [x,y] of plan.grates.filter(()=>random()<.7).map(cell))grid[y][x]=2;
        const crystals=plan.caches.flat().map(cell);
        const patrols=plan.patrols.map(route=>route.map(cell));
        const mission={name:'Сектор',brief:'Екі топтағы кристалдарды жина. Күзет бөлмелер мен дәліздерді аралап жүр.',
            player:cell(plan.player),key:crystals[0],exit:cell(plan.exit),patrols};
        const state=this.createState(mission,grid,null);
        state.live=true;
        state.sectorPlan=sectorPlan;
        state.crystals=crystals;
        state.crystalsCollected=0;
        state.patrol_ticks=0;
        state.pendingSounds=[];
        state.footprint=footprint;
        state.fixtures=fixtures;
        state.thresholds=plan.thresholds.map(([x,y,length])=>[...cell([flipX?x+length-1:x,y]),length]);
        const designs=this.designs.filter(design=>design.id!==previousDesign);
        state.design=designs[Math.floor(random()*designs.length)];
        state.roomMarks=plan.rooms.map(([x,y,w,h])=>cell([x+Math.floor(w/2),y+Math.floor(h/2)]));
        for(const guard of state.guards){
            const start=Math.floor(random()*guard.route.length);
            guard.position=[...guard.route[start]];
            guard.route_index=(start+1)%guard.route.length;
            const next=guard.route[guard.route_index];
            guard.facing=[next[0]-guard.position[0],next[1]-guard.position[1]];
        }
        return this.summarize(state);
    }

    static createState(mission,grid,missionIndex) {
        const height=grid.length, width=grid[0].length;
        const state={mode:'campaign',mission_index:missionIndex,mission_name:mission.name,brief:mission.brief,
            width,height,grid,player:[...mission.player],key_pos:[...mission.key],exit_pos:[...mission.exit],
            turn:0,key_collected:false,game_over:false,victory:false,decoys:3,last_decoy:null,
            player_vision_radius:3,monster_type:'patrol',hearing_radius:4,vision_radius:4,
            stepped_on_noise:false,ai_status:'PATROL',detection_probability:.05,guards:[],
            message:mission.brief,ai_target:null,last_seen:null,observed_velocity:[0,0],chase_cooldown:0};
        state.guards=mission.patrols.map((corners,id)=>{
            const route=[];
            for(let i=0;i<corners.length;i++){
                const from=corners[i],to=corners[(i+1)%corners.length];
                const segment=ClientAIEngine.astar(grid,width,height,from,to);
                if(!segment.length)throw new Error('Патруль бағытындағы нүктеге жету мүмкін емес.');
                route.push([...from],...segment.slice(0,-1));
            }
            const guard={id,position:[...route[0]],facing:[route[1][0]-route[0][0],route[1][1]-route[0][1]],
                route,route_index:1,status:'PATROL',target:null,memory:0,vision:4,hearing:4,belief:{}};
            const listener=this.listenerState(state,guard);
            ClientAIEngine.initBelief(listener);guard.belief=listener.belief;
            return guard;
        });
        this.summarize(state);
        return state;
    }

    static listenerState(state,guard) {
        return {grid:state.grid,width:state.width,height:state.height,player:state.player,
            monster:guard.position,hearing_radius:guard.hearing,belief:guard.belief};
    }

    static canSee(state,guard,position,point=position) {
        if(!ClientAIEngine.floor(state,position))return false;
        const dx=point[0]-guard.position[0],dy=point[1]-guard.position[1];
        const distance=Math.hypot(dx,dy);
        if(distance===0)return true;
        return distance<=guard.vision && (dx*guard.facing[0]+dy*guard.facing[1])/distance>=Math.SQRT1_2-1e-8
            && ClientAIEngine.lineOfSight(state,guard.position,position);
    }

    // A wall-clipped fan for both renderers; its orientation matches the detection rule.
    static visionPolygon(state,guard) {
        const origin=[guard.position[0]+.5,guard.position[1]+.5],angle=Math.atan2(guard.facing[1],guard.facing[0]);
        const points=[origin];
        for(let ray=0;ray<=48;ray++){
            const direction=angle-Math.PI/4+ray/48*Math.PI/2;
            const dx=Math.cos(direction),dy=Math.sin(direction);
            let end=origin;
            for(let distance=.04;distance<=guard.vision;distance+=.04){
                const p=[origin[0]+dx*distance,origin[1]+dy*distance],cell=p.map(Math.floor);
                if(!ClientAIEngine.floor(state,cell)||!ClientAIEngine.lineOfSight(state,guard.position,cell))break;
                end=p;
            }
            points.push(end);
        }
        return points;
    }

    static summarize(state) {
        const priority={PATROL:0,SCAN:1,SEARCH:2,INVESTIGATE:3,CHASE:4};
        const ordered=[...state.guards].sort((a,b)=>(priority[b.status]-priority[a.status])
            ||ClientAIEngine.distance(a.position,state.player)-ClientAIEngine.distance(b.position,state.player)||a.id-b.id);
        const focus=ordered[0];
        state.monster=[...focus.position];state.ai_status=focus.status;state.ai_target=focus.target;
        state.chase_cooldown=focus.memory;
        state.belief=Object.fromEntries(Object.keys(focus.belief).map(key=>[key,state.guards.reduce((sum,g)=>sum+(g.belief[key]||0),0)/state.guards.length]));
        ClientAIEngine.beliefSummary(state);
        if(state.guards.some(g=>this.canSee(state,g,state.player,state.playerPosition)))state.detection_probability=1;
        return state;
    }

    // World positions use tile centres as integers, just like the actor renderers.
    static walkSpeed = 2.6;
    static bodyRadius = .22;
    static stride = .78;

    static slideAxis(state,position,axis,delta){
        if(!delta)return;
        const radius=this.bodyRadius, sign=Math.sign(delta);
        let next=position[axis]+delta;
        const leadingCell=Math.round(next+sign*radius);
        const across=position[1-axis];
        for(let i=Math.round(across-radius+1e-8);i<=Math.round(across+radius-1e-8);i++){
            const cell=axis===0?[leadingCell,i]:[i,leadingCell];
            if(!ClientAIEngine.floor(state,cell)){
                next=leadingCell-sign*(.5+radius);
                break;
            }
        }
        position[axis]=next;
    }

    static touchesGuard(point,from,to=from){
        // Guards move one cardinal edge per tick. Check the entire swept segment.
        const nearest=from.map((v,i)=>Math.max(Math.min(v,to[i]),Math.min(point[i],Math.max(v,to[i]))));
        return Math.hypot(point[0]-nearest[0],point[1]-nearest[1])<=.48;
    }

    static *walkPath(state,start,dx,dy,seconds,sneaking=false){
        const length=Math.hypot(dx,dy);
        if(!length||seconds<=0)return;
        const speed=sneaking ? this.walkSpeed*.5 : this.walkSpeed;
        const distance=speed*seconds;
        const steps=Math.ceil(distance/.12);
        let before=start;
        for(let i=0;i<steps;i++){
            const point=[...before];
            this.slideAxis(state,point,0,dx/length*distance/steps);
            this.slideAxis(state,point,1,dy/length*distance/steps);
            const travelled=Math.hypot(point[0]-before[0],point[1]-before[1]);
            if(travelled<1e-8)return;
            yield {point,travelled};
            before=point;
        }
    }

    static walk(previous,dx,dy,seconds,sneaking=false){
        if(!previous.live||previous.game_over)return previous;
        let state=previous;
        const start=state.playerPosition??state.player;
        for(const {point,travelled} of this.walkPath(previous,start,dx,dy,seconds,sneaking)){
            const cell=point.map(Math.round);
            const entered=!ClientAIEngine.same(cell,state.player);
            const stride=(state.strideDistance??0)+(sneaking?0:travelled);
            const enteredGrate=!sneaking&&entered&&state.grid[cell[1]][cell[0]]===2;
            const footstep=!sneaking&&(stride>=this.stride||enteredGrate);
            state={...state,playerPosition:point,strideDistance:enteredGrate?0:stride%this.stride};
            if(sneaking){
                state.footstep=false;
                state.stepped_on_noise=false;
            }
            if(state.guards.some(g=>this.touchesGuard(point,g.position))){
                return this.caught({...state,player:cell,turn:state.turn+1});
            }
            if(entered||footstep){
                state=this.applyAction(state,cell,footstep,null);
            }else if(state.guards.some(g=>g.status!=='CHASE'&&this.canSee(state,g,cell,point))){
                state=this.applyAction(state,cell,false,null);
            }
            if(state.game_over)break;
        }
        if(state.pendingSounds.length>previous.pendingSounds.length){
            state.footstep=true;
            state.stepped_on_noise=state.pendingSounds.at(-1).range===2;
        }
        return state;
    }

    static processMove(previous,direction,target=null) {
        if(previous.game_over)return previous;
        const moves={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],wait:[0,0]};
        if(direction==='decoy'){
            if(!Array.isArray(target)||target.length!==2||!target.every(Number.isInteger)||previous.decoys<=0
                ||!ClientAIEngine.floor(previous,target)||ClientAIEngine.distance(previous.player,target)>previous.player_vision_radius
                ||!ClientAIEngine.lineOfSight(previous,previous.player,target))throw new Error('Үш қадамнан аспайтын жердегі көрініп тұрған торкөзді таңда.');
        }else if(!Object.hasOwn(moves,direction))throw new Error('Белгісіз әрекет');
        const [dx,dy]=moves[direction]??[0,0];
        const next=[previous.player[0]+dx,previous.player[1]+dy];
        const cell=ClientAIEngine.floor(previous,next)?next:previous.player;
        const moved=!ClientAIEngine.same(previous.player,cell);
        if(previous.live&&moved)return this.walk(previous,dx,dy,1/this.walkSpeed);
        return this.applyAction(previous,cell,moved,direction==='decoy'?target:null);
    }

    static applyAction(previous,cell,footstep,decoy){
        const state={...previous,player:cell,guards:previous.guards.map(guard=>({...guard})),
            turn:previous.turn+1,last_decoy:decoy,message:null,footstep};
        if(decoy){
            state.decoys--;state.message='Құты сынды. Патруль естісе, дыбыс шыққан жерді тексереді.';
        }
        state.stepped_on_noise=footstep&&state.grid[cell[1]][cell[0]]===2;
        if(state.stepped_on_noise)state.message='Торлы еден сылдырлады! Жақын маңдағы патруль дыбысқа қарай бұрылуы мүмкін.';
        if(state.guards.some(g=>state.live?this.touchesGuard(state.playerPosition??cell,g.position):ClientAIEngine.same(g.position,cell)))return this.caught(state);
        if(state.live){
            const index=state.crystals.findIndex(crystal=>ClientAIEngine.same(state.player,crystal));
            if(index>=0){
                state.crystals=[...state.crystals];
                state.crystals[index]=null;
                state.crystalsCollected++;
                state.key_collected=state.crystalsCollected===state.crystals.length;
                state.message=state.key_collected?'Барлық кристалл жиналды. Шығаберіс ашық.':null;
            }
        }else if(!state.key_collected&&ClientAIEngine.same(state.player,state.key_pos)){
            state.key_collected=true;state.message='Кілт қолыңда. Енді порталға жет.';
        }
        if(ClientAIEngine.same(state.player,state.exit_pos)){
            if(state.key_collected){state.game_over=state.victory=true;state.message='Тапсырма орындалды.';return this.summarize(state);}
            state.message=state.live?'Шығаберіс жабық. Қалған кристалдарды жина.':'Портал жабық. Алдымен кілтті ал.';
        }
        let sound=null;
        if(decoy)sound={position:decoy,decoy:true,range:state.live?3:2};
        else if(state.stepped_on_noise)sound={position:cell,range:state.live?2:1};
        else if(state.live&&footstep)sound={position:cell,range:1};
        if(state.live){
            if(sound)state.pendingSounds=[...state.pendingSounds,sound];
            // Spot the player as soon as they enter a visible cell. Movement remains clock-driven.
            for(const guard of state.guards){
                if(this.canSee(state,guard,cell,state.playerPosition))this.observe(state,guard);
            }
            if(state.guards.some(guard=>guard.status==='CHASE')){
                state.ai_status='CHASE';
                state.detection_probability=1;
            }
            return state;
        }
        return this.advanceGuards(state,sound?[sound]:[]);
    }

    static tick(previous){
        if(!previous.live||previous.game_over)return previous;
        const state={...previous,guards:previous.guards.map(guard=>({...guard})),
            patrol_ticks:previous.patrol_ticks+1,pendingSounds:[],last_decoy:null,footstep:false,stepped_on_noise:false,message:null};
        return this.advanceGuards(state,previous.pendingSounds);
    }

    static observe(state,guard){
        const acquired=guard.status!=='CHASE';
        guard.status='CHASE';
        guard.scan=null;
        guard.target=[...state.player];
        guard.memory=4;
        if(acquired || guard.belief[state.player.join(',')]!==1){
            const cell=state.player.join(',');
            guard.belief=Object.fromEntries(Object.keys(guard.belief).map(key=>[key,Number(key===cell)]));
        }
        if(acquired)state.message='Сені байқап қалды! Тасаға жасырын.';
    }

    // Choose two different sightlines with room to see down them. Only the map
    // and the sentry's heading inform this decision.
    static surveyDirections(state,guard){
        const [x,y]=guard.position;
        const heading=Math.atan2(guard.facing[1],guard.facing[0]);
        const candidates=[];
        for(const offset of [-2,-1,1,2,3,-3,4,0]){
            const angle=heading+offset*Math.PI/4;
            const facing=[Math.cos(angle),Math.sin(angle)];
            let depth=0;
            for(let n=1;n<=4;n++){
                const cell=[Math.round(x+facing[0]*n),Math.round(y+facing[1]*n)];
                if(!ClientAIEngine.floor(state,cell)||!ClientAIEngine.lineOfSight(state,guard.position,cell))break;
                depth=n;
            }
            if(depth)candidates.push({facing,depth});
        }
        candidates.sort((a,b)=>b.depth-a.depth);
        if(!candidates.length)return [guard.facing];
        const first=candidates[0].facing;
        const other=candidates.find(({facing})=>facing[0]*first[0]+facing[1]*first[1]<.5);
        return other?[first,other.facing]:[first];
    }

    static advanceGuards(state,sounds){
        for(const guard of state.guards){
            let heard=null;
            for(const sound of sounds){
                if(ClientAIEngine.distance(guard.position,sound.position)<=guard.hearing*sound.range
                    &&(!heard||sound.range>=heard.range))heard=sound;
            }
            const visible=this.canSee(state,guard,state.player,state.playerPosition);
            const listener=this.listenerState(state,guard);
            if(heard || !state.live){
                ClientAIEngine.updateBelief(listener,heard?.position,heard?.decoy);
                guard.belief=listener.belief;
            }
            if(visible){
                this.observe(state,guard);
            }else if(heard){
                guard.scan=null;guard.status='INVESTIGATE';guard.target=heard.position;guard.memory=4;
            }else if(guard.memory>0&&guard.target&&!ClientAIEngine.same(guard.position,guard.target)){
                if(!state.live)guard.memory--;
                if(!state.live||guard.status!=='INVESTIGATE')guard.status='SEARCH';
            }else if(state.live&&!guard.yielding&&(guard.scan?.length||guard.memory>0||
                guard.patrolSteps>=7+(guard.id*3+guard.route_index)%7)){
                const scan=guard.scan?.length?guard.scan:this.surveyDirections(state,guard);
                guard.facing=scan[0];guard.scan=scan.slice(1);
                guard.memory=0;guard.patrolSteps=0;guard.status='SCAN';guard.target=guard.position;
            }else{
                guard.memory=0;guard.status='PATROL';
                if(ClientAIEngine.same(guard.position,guard.route[guard.route_index]))guard.route_index=(guard.route_index+1)%guard.route.length;
                guard.target=guard.route[guard.route_index];
            }
        }
        for(const guard of state.guards){
            const from=guard.position;
            const next=this.guardStep(state,guard);
            if(next){
                guard.facing=[next[0]-from[0],next[1]-from[1]];
                guard.position=next;
                if(state.live&&guard.status==='PATROL')guard.patrolSteps=(guard.patrolSteps??0)+1;
            }
            if(state.live?this.touchesGuard(state.playerPosition??state.player,from,guard.position)
                :ClientAIEngine.same(guard.position,state.player))return this.caught(state);
            if(this.canSee(state,guard,state.player,state.playerPosition))this.observe(state,guard);
        }
        return this.summarize(state);
    }

    static guardStep(state,guard){
        const from=guard.position;
        const others=state.guards.filter(other=>other!==guard);
        const occupied=new Set(others.map(other=>other.position.join(',')));
        const path=(start,end,blocked)=>ClientAIEngine.astar(state.grid,state.width,state.height,start,end,blocked);
        const route=ClientAIEngine.distance(from,guard.target)===1?[guard.target]:path(from,guard.target);
        const next=route[0];

        if(guard.yielding){
            const {bay,forId}=guard.yielding;
            if(!ClientAIEngine.same(from,bay)){
                const retreat=path(from,bay,occupied)[0];
                if(retreat)return retreat;
            }else{
                const passing=others.find(g=>g.id===forId);
                if(next&&passing&&path(passing.position,passing.target).some(cell=>ClientAIEngine.same(cell,next)))return;
            }
            guard.yielding=null;
        }
        if(!next||!route.some(cell=>occupied.has(cell.join(','))))return next;
        const detour=path(from,guard.target,occupied)[0];
        if(detour)return detour;
        const blocker=others.find(other=>ClientAIEngine.same(other.position,next));
        if(!blocker)return next;

        // In a single-file passage, back up to the nearest free tile off the oncoming route.
        const oncoming=new Set(path(blocker.position,blocker.target).map(cell=>cell.join(',')));
        if(!oncoming.has(from.join(',')))return;
        const queue=[from],visited=new Set([...occupied,from.join(',')]);
        for(let i=0;i<queue.length;i++){
            const [x,y]=queue[i];
            for(const cell of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
                const key=cell.join(',');
                if(visited.has(key)||!ClientAIEngine.floor(state,cell))continue;
                if(!oncoming.has(key)){
                    guard.yielding={bay:cell,forId:blocker.id};
                    return path(from,cell,occupied)[0];
                }
                visited.add(key);queue.push(cell);
            }
        }
    }

    static caught(state) {
        state.game_over=true;state.victory=false;state.message='Күзетші сені ұстап алды. Келесі жолы өтуге қолайлы сәтті күт.';
        return this.summarize(state);
    }
}
if(typeof window!=='undefined')window.TacticalCampaign=TacticalCampaign;
