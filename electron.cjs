const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const http = require('http')

let mainWindow
let zoomLevel = 0

function createCallbackServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8888')

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const indexPath = path.join(__dirname, 'dist', 'index.html')

      if (code && mainWindow) {
        mainWindow.loadFile(indexPath, {
          query: {
            code,
          },
        })
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>Spotify connected. You can return to VibePlay.</h2>')
    }
  })

  server.listen(8888, '127.0.0.1')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#111111',
  })

  const indexPath = path.join(__dirname, 'dist', 'index.html')

  mainWindow.loadFile(indexPath)
}

app.whenReady().then(() => {
  createCallbackServer()
  createWindow()

  globalShortcut.register('CommandOrControl+=', () => {
    zoomLevel += 0.5
    mainWindow.webContents.setZoomLevel(zoomLevel)
  })

  globalShortcut.register('CommandOrControl+-', () => {
    zoomLevel -= 0.5
    mainWindow.webContents.setZoomLevel(zoomLevel)
  })

  globalShortcut.register('CommandOrControl+0', () => {
    zoomLevel = 0
    mainWindow.webContents.setZoomLevel(zoomLevel)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})