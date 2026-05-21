const asar = require('asar');
const fs = require('fs');
const path = require('path');

const sourceAsar = 'e:\\vivpr\\ai\\browser\\out\\XPIDER Browser-win32-x64\\resources\\app.asar';
const destAsar = 'C:\\Users\\vivPR\\Desktop\\XPIDER Browser-56\\resources\\app.asar';
const unpackedDir = 'e:\\vivpr\\ai\\browser\\out_app_unpacked';
const sourceMainJs = 'e:\\vivpr\\ai\\browser\\src\\main.js';
const targetMainJs = path.join(unpackedDir, 'src', 'main.js');

async function main() {
    try {
        console.log('🚀 [Method C Patch] Starting app.asar extraction...');
        
        // 1. Clean previous directory if exists
        if (fs.existsSync(unpackedDir)) {
            console.log('🧹 Cleaning previous unpacked directory...');
            fs.rmSync(unpackedDir, { recursive: true, force: true });
        }

        // 2. Extract ASAR to local workspace
        console.log(`📦 Extracting from: ${sourceAsar} -> To: ${unpackedDir}`);
        await asar.extractAll(sourceAsar, unpackedDir);
        console.log('✅ Extraction complete!');

        // Verify that main.js actually exists in unpacked directory
        if (!fs.existsSync(targetMainJs)) {
            throw new Error(`❌ Target main.js not found in extracted directory! Path was: ${targetMainJs}`);
        }

        // 3. Copy our modified main.js into the unpacked directory
        console.log(`💾 Copying modified main.js into: ${targetMainJs}`);
        fs.copyFileSync(sourceMainJs, targetMainJs);
        console.log('✅ main.js patch successfully integrated!');

        // 4. Pack everything directly into the Desktop release folder
        console.log(`📦 Packing directly into Desktop release ASAR: ${destAsar}`);
        
        // Ensure destination resources folder exists
        const destResourcesDir = path.dirname(destAsar);
        if (!fs.existsSync(destResourcesDir)) {
            fs.mkdirSync(destResourcesDir, { recursive: true });
        }
        
        // Delete corrupt app.asar if exists
        if (fs.existsSync(destAsar)) {
            try {
                fs.unlinkSync(destAsar);
            } catch (e) {
                console.warn('⚠️ Direct delete failed, trying force override:', e.message);
            }
        }

        await asar.createPackage(unpackedDir, destAsar);
        console.log('✅ app.asar successfully repacked onto Desktop!');

        // 5. Clean up temporary directory
        console.log('🧹 Cleaning up temporary unpacked folder...');
        fs.rmSync(unpackedDir, { recursive: true, force: true });
        console.log('🎉 [Success] Method C Patch successfully deployed!');
    } catch (error) {
        console.error('❌ Error during Method C Patching:', error);
        process.exit(1);
    }
}

main();
