const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false });
    const htmlPath = path.join(__dirname, 'install_guide.html');
    const pdfPath = path.join(__dirname, '..', 'XPIDER_Installation_Guide.pdf');

    console.log('Loading rich HTML...');
    await win.loadFile(htmlPath);

    // Wait slightly to ensure fonts and locally referenced images are fully loaded
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('Generating beautiful PDF...');
    const pdfData = await win.webContents.printToPDF({
        printBackground: true,
        margins: {
            top: 0.4,
            bottom: 0.4,
            left: 0.4,
            right: 0.4
        },
        pageSize: 'A4'
    });

    fs.writeFileSync(pdfPath, pdfData);
    console.log(`Success! PDF beautifully generated at: ${pdfPath}`);
    app.quit();
});
