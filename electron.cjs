const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const http = require('http')

let mainWindow
let zoomLevel = 0
let callbackServer

function createCallbackServer() {
  if (callbackServer) return

  callbackServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8888')

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const indexPath = path.join(__dirname, 'dist', 'index.html')

      if (code && mainWindow) {
        mainWindow.loadFile(indexPath, {
          query: {
            code,
            state,
          },
        })
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>Spotify connected. You can return to VibePlay.</h2>')
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })

  callbackServer.on('error', (error) => {
    console.error('Spotify callback server error:', error)
  })

  callbackServer.listen(8888, '127.0.0.1')
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setMainWindowZoom(nextZoomLevel) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  zoomLevel = nextZoomLevel
  mainWindow.webContents.setZoomLevel(zoomLevel)
}

app.whenReady().then(() => {
  createCallbackServer()
  createWindow()

  globalShortcut.register('CommandOrControl+=', () => {
    setMainWindowZoom(zoomLevel + 0.5)
  })

  globalShortcut.register('CommandOrControl+-', () => {
    setMainWindowZoom(zoomLevel - 0.5)
  })

  globalShortcut.register('CommandOrControl+0', () => {
    setMainWindowZoom(0)
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

  if (callbackServer) {
    callbackServer.close()
    callbackServer = null
  }
})
