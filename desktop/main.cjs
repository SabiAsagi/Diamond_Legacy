const {app,BrowserWindow,Menu,protocol,net,session,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const smoke=process.argv.includes('--smoke-test');
const verifyPackage=process.argv.includes('--verify-package');
const checking=smoke||verifyPackage;
app.setName('Diamond Legacy');
if(checking)app.setPath('userData',path.join(app.getPath('temp'),'DiamondLegacy-smoke-'+process.pid));
protocol.registerSchemesAsPrivileged([{scheme:'diamond',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
if(!app.requestSingleInstanceLock())app.quit();
else{
  let window;
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    const root=path.resolve(__dirname,'../dist');
    protocol.handle('diamond',request=>{
      const url=new URL(request.url);
      if(url.host!=='game')return new Response('Not found',{status:404});
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
      const target=path.resolve(root,relative);
      if(target!==root&&!target.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(target).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'"]}}));
    window=new BrowserWindow({width:1440,height:960,minWidth:1024,minHeight:720,title:'Diamond Legacy',backgroundColor:'#101827',show:!checking,webPreferences:{offscreen:checking,backgroundThrottling:!checking,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('diamond://game/'))event.preventDefault();});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'게임',submenu:[{label:'저장 폴더 열기',click:()=>shell.openPath(app.getPath('userData'))},{type:'separator'},{role:'quit',label:'종료'}]},
      {label:'화면',submenu:[{label:'전체화면 전환',accelerator:'F11',click:()=>window.setFullScreen(!window.isFullScreen())},{role:'resetZoom',label:'기본 화면 크기'},{role:'zoomIn',label:'확대'},{role:'zoomOut',label:'축소'}]},
    ]));
    await window.loadURL('diamond://game/index.html');
    if(verifyPackage){
      await new Promise(resolve=>setTimeout(resolve,1500));
      const report=await window.webContents.executeJavaScript('({title:document.title,ready:!!document.querySelector("#root")?.children.length,text:document.body.innerText.slice(0,400),images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0}))})');
      const passed=report.ready&&report.text.includes('Diamond Legacy')&&report.images.every(i=>i.loaded);
      fs.writeFileSync(path.join(path.dirname(app.getPath('exe')),'package-verification.json'),JSON.stringify({...report,passed},null,2));
      app.exit(passed?0:1);return;
    }
    if(smoke){
      try{const report=await require('../tests/desktop-smoke.cjs')(window);fs.writeFileSync(path.join(__dirname,'../release/desktop-smoke.json'),JSON.stringify(report,null,2));app.exit(0);}
      catch(e){fs.writeFileSync(path.join(__dirname,'../release/desktop-smoke.json'),JSON.stringify({error:String(e),stack:e.stack},null,2));app.exit(1);}
    }
  }).catch(error=>{console.error(error);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
}
