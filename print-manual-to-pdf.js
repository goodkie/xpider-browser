const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false });
    const htmlPath = path.join(__dirname, 'XPIDER_Admin_Manual_v1.html');
    const pdfPath = path.join(__dirname, 'XPIDER_Admin_Manual_v1.pdf');

    console.log('Loading HTML...');
    await win.loadFile(htmlPath);

    console.log('Generating PDF...');
    const pdfData = await win.webContents.printToPDF({
        printBackground: true,
        marginsType: 0,
        pageSize: 'A4'
    });

    fs.writeFileSync(pdfPath, pdfData);
    console.log(`Success! PDF created at: ${pdfPath}`);
    app.quit();
});
