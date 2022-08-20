const puppeteer               = require( 'puppeteer' );
const fs                      = require( 'fs' );
const {default: OBSWebSocket} = require('obs-websocket-js');

const config        = JSON.parse( fs.readFileSync( 'config.json' ) );
const TICKRATE      = config.tickRate || 100;
const TIMEFACTOR    = 1000 / TICKRATE;
const ANTIFLICKER   = (config.antiFlicker || 10) * TIMEFACTOR;
const DWELLTIME     = (config.dwellTime || 5) * TIMEFACTOR;
const HEADLESS      = config.headless || true;
const STREAMKIT_URL = config.url || "";
const WS_URL        = config.wsUrl || "ws://127.0.0.1:4455";
const WS_PASS       = config.wsPass || "";

(async () => {
    console.log( "Loading page..." );

    const browser = await puppeteer.launch( {headless: HEADLESS} );
    const page = await browser.newPage();
    await page.setViewport( {width: 200, height: 600, deviceScaleFactor: 1.0} );
    await page.goto( STREAMKIT_URL );

    console.log( "Page loaded, connecting to OBS" );
    const obs = new OBSWebSocket();
    await obs.connect( WS_URL, WS_PASS );

    setInterval( updateNames(page, obs), TICKRATE );
})();

let antiFlicker = 0;
let playerDict = {};

async function updateView( obs ) {
    if( antiFlicker > 0 ) {
        antiFlicker--;

        if( antiFlicker > DWELLTIME )
            return;
        
        // Occasionally allow changes less than the antiflicker holdoff delay
        if( Math.random() < 0.9 )
            return;
    }

    antiFlicker = ANTIFLICKER;

    let playerNames = Object.keys( playerDict );
    if( playerNames.length > 0 ) {
        let maxVal = Object.values(playerDict).sort( (a,b) => b-a ).filter( (val,ind,arr) => arr.indexOf(val) === ind )[0];

        let options  = playerNames.filter( name => playerDict[name] === maxVal );
        let selected = options[Math.floor(Math.random()*options.length)]
        console.log( "Options: " + JSON.stringify(options) );
        console.log( "Swap To: " + selected );

        const SCENE_NAME = "DiscordSourceGroup";

        const scenes = await obs.call( "GetGroupSceneItemList", { sceneName: SCENE_NAME } );
        for( let i=0; i<scenes.sceneItems.length; i++ ) {
            await obs.call( "SetSceneItemEnabled", { sceneName: SCENE_NAME, sceneItemId: scenes.sceneItems[i].sceneItemId, sceneItemEnabled: false } )
        }

        const target = scenes.sceneItems.filter( entry => entry.sourceName === selected )[0];
        console.log( target );
        await obs.call( "SetSceneItemEnabled", { sceneName: SCENE_NAME, sceneItemId: target.sceneItemId, sceneItemEnabled: true } )
    }
}

function updateNames( page, obs ) {
    return async function() {
        updateView( obs );

        let playerNames = Object.keys( playerDict );
        for( let i=0; i<playerNames.length; i++ )
        {
            if( playerDict[playerNames[i]] > 0 )
                playerDict[playerNames[i]]--;
        }
        
        let tmp = await page.$$( 'span' );
        if( tmp && tmp.length > 0 ) {
            let speakers = [];
            for( let i=0; i<tmp.length; i++ ) {
                let name = await page.evaluate( el => el.innerText, tmp[i]);
                playerDict[name] = playerDict[name] + 5 || 5;
                speakers.push( `${name}(${playerDict[name]})` );
            }
            console.log( `<< ${speakers.join(' ')} >>` );
        }
    }
}