/* Interface controls stay separate from the shared Python/JavaScript game rules. */
document.querySelectorAll('[data-dialog]').forEach(button=>{
    button.addEventListener('click',()=>{
        document.querySelector('dialog[open]')?.close();
        document.getElementById(button.dataset.dialog).showModal();
    });
});
document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('click',event=>{
        if(event.target!==dialog)return;
        const rect=dialog.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
    });
});
const valueLabels={gridSize:['gridSizeValue','gridSizeValueMirror'],hearingRadius:['hearingValue'],visionRadius:['visionValue']};
for(const [id,labels] of Object.entries(valueLabels)){
    document.getElementById(id).addEventListener('input',event=>labels.forEach(label=>document.getElementById(label).textContent=event.target.value));
}
document.getElementById('applySettings').addEventListener('click',()=>{
    document.getElementById('settingsDialog').close();initGame();
});
document.getElementById('restartGame').addEventListener('click',()=>{
    document.getElementById('missionsDialog').close();
    initGame();
});
document.getElementById('newSector').addEventListener('click',()=>{
    modeControl.value='sector';
    refreshModeControls();
    document.getElementById('missionsDialog').close();
    initGame({regenerate:true});
});
document.getElementById('view3d').addEventListener('click',()=>window.quietGrid.setView('3d'));
document.getElementById('view2d').addEventListener('click',()=>window.quietGrid.setView('2d'));
document.getElementById('zoomIn').addEventListener('click',()=>window.quietGrid.scene3d?.zoom(.82));
document.getElementById('zoomOut').addEventListener('click',()=>window.quietGrid.scene3d?.zoom(1.22));
document.getElementById('rotateCamera').addEventListener('click',()=>window.quietGrid.scene3d?.rotate());
document.getElementById('resetCamera').addEventListener('click',()=>window.quietGrid.scene3d?.resetCamera());
const fullscreenButton=document.getElementById('fullscreenToggle');
const fullscreenRoot=document.documentElement;
const requestFullscreen=fullscreenRoot.requestFullscreen || fullscreenRoot.webkitRequestFullscreen;
const exitFullscreen=document.exitFullscreen || document.webkitExitFullscreen;
const fullscreenElement=()=>document.fullscreenElement || document.webkitFullscreenElement;
if(requestFullscreen && exitFullscreen && (document.fullscreenEnabled || document.webkitFullscreenEnabled)){
    fullscreenButton.hidden=false;
    const refreshFullscreen=()=>{
        const active=!!fullscreenElement();
        const label=active?'Толық экраннан шығу':'Толық экранға өту';
        fullscreenButton.setAttribute('aria-pressed',String(active));
        fullscreenButton.setAttribute('aria-label',label);
        fullscreenButton.title=label;
        fullscreenButton.querySelector('use').setAttribute('href',active?'#i-fullscreen-exit':'#i-fullscreen');
    };
    document.addEventListener('fullscreenchange',refreshFullscreen);
    document.addEventListener('webkitfullscreenchange',refreshFullscreen);
    fullscreenButton.addEventListener('click',async()=>{
        try{
            if(fullscreenElement())await exitFullscreen.call(document);
            else await requestFullscreen.call(fullscreenRoot);
        }catch{
            window.quietGrid._showToast('Браузер толық экран режиміне рұқсат бермеді.');
        }
    });
    refreshFullscreen();
}
document.getElementById('heatmapToggle').addEventListener('change',()=>{
    const game=window.quietGrid;
    if(game.state)game._updateUI();
});

document.getElementById('toggleMinimap').addEventListener('click',()=>{
    window.quietGrid.setMinimapOpen(document.getElementById('minimapPanel').hidden);
});
document.getElementById('toggleMapRobot').addEventListener('click',()=>{
    const game=window.quietGrid;
    game.setRobotOnMap(!game.showRobotOnMap);
});

// Terrain and the robot marker can be toggled independently.
document.getElementById('fullMapToggle').addEventListener('change',event=>window.quietGrid.setFullMap(event.target.checked));
document.getElementById('overviewCamera').addEventListener('click',()=>window.quietGrid.scene3d?.setOverview(true));
const gameAudio=window.quietGrid.audio;
const refreshAudioControls=()=>{
    const enabled=!!gameAudio?.enabled;
    const button=document.getElementById('soundToggle');
    const label=enabled?'Дыбысты өшіру':'Дыбысты қосу';
    button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',label);button.title=label;
    button.querySelector('use').setAttribute('href',enabled?'#i-volume':'#i-muted');
    document.getElementById('soundState').textContent=enabled?'Дыбыс қосулы':'Дыбыс өшірулі';
    document.getElementById('soundEnabled').checked=enabled;
    const percent=Math.round((gameAudio?.volume??.35)*100);
    document.getElementById('soundVolume').value=String(percent);
    document.getElementById('volumeValue').textContent=percent+'%';
};
if(gameAudio)gameAudio.onChange=refreshAudioControls;
refreshAudioControls();
document.getElementById('soundToggle').addEventListener('click',()=>{
    if(!gameAudio)return;
    gameAudio.setEnabled(!gameAudio.enabled);
    if(gameAudio.enabled)gameAudio.unlock();
});
document.getElementById('soundEnabled').addEventListener('change',event=>{
    gameAudio?.setEnabled(event.target.checked);
    if(event.target.checked)gameAudio?.unlock();
});
document.getElementById('soundVolume').addEventListener('input',event=>gameAudio?.setVolume(Number(event.target.value)/100));
document.getElementById('testSound').addEventListener('click',async()=>{
    const status=document.getElementById('audioStatus');
    if(!gameAudio?.enabled || gameAudio.volume===0){status.textContent='Дыбысты қосып, деңгейін нөлден жоғары қой.';return;}
    const ready=await gameAudio.unlock();
    status.textContent=ready&&gameAudio.play('start')?'Сынақ сигналы ойнатылды.':'Браузер дыбысты қоса алмады. Түймені тағы бір рет басып көр.';
});

const modeControl=document.getElementById('gameMode');
function refreshModeControls(){
    const tactical=modeControl.value!=='classic';
    document.getElementById('modeHelp').textContent={
        sector:'Кездейсоқ секторда күзет өздігінен қозғалады. Таңдаған режимің келесі ойында қолданылады.',
        campaign:'Қадамдық тапсырмаларда күзет сенен кейін жүреді.',
        classic:'Роботтың орны ойын басталғаннан картада көрінеді. «Робот» түймесі оның белгісін жасырады немесе қайта көрсетеді. 3D көріністе қабырға көруге кедергі болады.'
    }[modeControl.value];
    document.getElementById('proceduralOptions').hidden=tactical;
    document.getElementById('routesHelp').textContent=tactical?'Үзік сызық патрульдің әдеттегі бағытын көрсетеді. Күзет дыбыс естісе немесе сені байқаса, бағытын өзгертеді.':'Патруль бағыттары тапсырма режимінде көрсетіледі.';
    document.getElementById('fullMapHelp').textContent=tactical
        ?'Карта, күзет және күзеттің көру аймақтары көрінеді. Зерттелмеген жерлерді жасыру үшін осы баптауды өшір.'
        :'Қабырғалар, кілт және шығаберіс көрінеді. Картаның екі режимінде де роботтың белгісін «Робот» түймесімен басқарасың.';
}
modeControl.addEventListener('change',refreshModeControls);refreshModeControls();
document.getElementById('routesToggle').addEventListener('change',event=>{window.quietGrid.showPatrolRoutes=event.target.checked;});
document.querySelectorAll('[data-mission]').forEach(button=>{
    const best=Number(window.quietGrid.completedMissions[button.dataset.mission]);
    if(best>0){button.classList.add('completed');button.querySelector('.mission-best').textContent=best+' жүріс';}
    button.addEventListener('click',()=>{
        document.getElementById('missionsDialog').close();
        window.quietGrid.selectedMission=Number(button.dataset.mission);
        modeControl.value='campaign';refreshModeControls();initGame();
    });
});
document.getElementById('nextMission').addEventListener('click',()=>{
    window.quietGrid.selectedMission=Math.min(TacticalCampaign.missions.length-1,window.quietGrid.selectedMission+1);
    modeControl.value='campaign';refreshModeControls();initGame();
});
