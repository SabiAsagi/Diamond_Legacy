const {build,Platform}=require('electron-builder');
const path=require('node:path');
const fs=require('node:fs');
const runtime=path.resolve(__dirname,'../node_modules/electron/dist');
const target=process.argv[2]==='portable'?'portable':'dir';
const localRuntime=process.platform==='win32'&&fs.existsSync(path.join(runtime,'electron.exe'));
build({targets:Platform.WINDOWS.createTarget(target),config:localRuntime?{electronDist:runtime}:{},publish:'never'}).catch(error=>{console.error(error);process.exitCode=1;});
