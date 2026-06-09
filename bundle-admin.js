const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const projectRoot = __dirname;
const srcHtmlPath = path.join(projectRoot, 'src', 'admin.html');
const srcCssPath = path.join(projectRoot, 'src', 'admin.css');
const srcJsPath = path.join(projectRoot, 'src', 'admin.js');

const distDir = path.join(projectRoot, 'dist-admin');
const distHtmlPath = path.join(distDir, 'index.html');
const zipPath = path.join(projectRoot, 'admin-deploy.zip');

try {
    console.log('=== [XPIDER] Bundling Independent Admin Panel ===');
    
    // Ensure dist directory exists
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }

    // Read source files
    let html = fs.readFileSync(srcHtmlPath, 'utf8');
    const css = fs.readFileSync(srcCssPath, 'utf8');
    const js = fs.readFileSync(srcJsPath, 'utf8');

    // Inline CSS
    const cssTag = '<link rel="stylesheet" href="admin.css">';
    if (html.includes(cssTag)) {
        html = html.replace(cssTag, `<style>\n${css}\n</style>`);
        console.log('✅ Inlined admin.css');
    } else {
        console.warn('⚠️ CSS tag not found in admin.html');
    }

    // Inline JS
    const jsTag = '<script src="admin.js"></script>';
    if (html.includes(jsTag)) {
        html = html.replace(jsTag, `<script>\n${js}\n</script>`);
        console.log('✅ Inlined admin.js');
    } else {
        console.warn('⚠️ JS tag not found in admin.html');
    }

    // Save index.html
    fs.writeFileSync(distHtmlPath, html, 'utf8');
    console.log(`✅ Saved bundled file to: ${distHtmlPath}`);

    // Create Zip containing only index.html
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log('Removed existing admin-deploy.zip');
    }

    const zip = new AdmZip();
    zip.addLocalFile(distHtmlPath);
    zip.writeZip(zipPath);
    console.log(`✅ Successfully created: ${zipPath}`);
    console.log('=== Bundling Completed successfully ===');
} catch (err) {
    console.error('❌ Bundling failed:', err);
    process.exit(1);
}
