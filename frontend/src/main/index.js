// frontend/src/main/index.js

import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

let miniWindow = null // 미니 입력 창
let mainWindow = null // 메인 앱 창
let authWindow = null
let notionAuthWindow = null

const APP_ID = 'net.ogapp.onegate'

function setupAutoUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true

  const sendUpdateStatus = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', payload)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ state: 'available', info })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus({ state: 'not-available', info })
  })

  autoUpdater.on('error', (error) => {
    sendUpdateStatus({ state: 'error', error: String(error?.message || error) })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({ state: 'downloading', progress })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ state: 'downloaded', info })
  })

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { skipped: true }
    return autoUpdater.checkForUpdates()
  })

  ipcMain.on('install-update', () => {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdatesAndNotify()
}

// 미니 입력 창 생성 (Spotlight 스타일)
function createMiniWindow() {
  miniWindow = new BrowserWindow({
    width: 600,
    height: 64,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    hasShadow: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  miniWindow.on('blur', () => {
    miniWindow.hide()
  })

  const miniUrl =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}?mode=mini`
      : `file://${join(__dirname, '../renderer/index.html')}?mode=mini`

  miniWindow.loadURL(miniUrl)
}

// 메인 앱 창 생성
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    frame: true, // 타이틀바, 닫기 버튼 있음
    transparent: false,
    resizable: true,
    center: true,
    icon: icon,
    title: 'One Gate',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  const mainUrl =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}?mode=main`
      : `file://${join(__dirname, '../renderer/index.html')}?mode=main`

  mainWindow.loadURL(mainUrl)
}

// OAuth 인증 창 생성
function createAuthWindow(authUrl) {
  console.log('[Auth] Opening auth window with URL:', authUrl)

  authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    show: true,
    frame: true,
    center: true,
    title: 'Google 로그인',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  authWindow.loadURL(authUrl)

  // 페이지 로드 완료 시 로그
  authWindow.webContents.on('did-finish-load', () => {
    console.log('[Auth] Page loaded:', authWindow.webContents.getURL())
  })

  // URL 변화 감지 (리다이렉트 시 토큰 추출)
  authWindow.webContents.on('will-redirect', (event, url) => {
    console.log('[Auth] will-redirect:', url)
    handleAuthCallback(url)
  })

  authWindow.webContents.on('will-navigate', (event, url) => {
    console.log('[Auth] will-navigate:', url)
    // Google OAuth 페이지 내 이동은 무시, localhost로 돌아올 때만 처리
    if (url.startsWith('http://localhost')) {
      handleAuthCallback(url)
    }
  })

  authWindow.on('closed', () => {
    console.log('[Auth] Window closed')
    authWindow = null
  })
}

// Notion OAuth 인증 창 생성
function createNotionAuthWindow(authUrl) {
  console.log('[Notion Auth] Opening auth window with URL:', authUrl)

  notionAuthWindow = new BrowserWindow({
    width: 500,
    height: 700,
    show: true,
    frame: true,
    center: true,
    title: 'Notion 연동',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  notionAuthWindow.loadURL(authUrl)

  // 페이지 로드 완료 시 로그
  notionAuthWindow.webContents.on('did-finish-load', () => {
    const currentUrl = notionAuthWindow.webContents.getURL()
    console.log('[Notion Auth] Page loaded:', currentUrl)

    // 백엔드 콜백에서 localhost로 리다이렉트 되었을 때 처리
    if (currentUrl.includes('localhost') && currentUrl.includes('notion_connected=true')) {
      console.log('[Notion Auth] OAuth success, closing window')

      // 메인 창에 데이터 새로고침 신호 보내기
      if (mainWindow) {
        mainWindow.webContents.send('notion-auth-success')
        setTimeout(() => {
          mainWindow.webContents.send('refresh-data')
        }, 100)
      }

      notionAuthWindow.close()
    }
  })

  // URL 변화 감지
  notionAuthWindow.webContents.on('will-redirect', (event, url) => {
    console.log('[Notion Auth] will-redirect:', url)
    handleNotionCallback(url)
  })

  notionAuthWindow.webContents.on('will-navigate', (event, url) => {
    console.log('[Notion Auth] will-navigate:', url)
    if (url.includes('localhost')) {
      handleNotionCallback(url)
    }
  })

  notionAuthWindow.on('closed', () => {
    console.log('[Notion Auth] Window closed')
    notionAuthWindow = null
  })
}

// Notion OAuth 콜백 처리
function handleNotionCallback(url) {
  if (url.includes('localhost') && url.includes('notion_connected=true')) {
    console.log('[Notion Auth] OAuth success detected')

    if (mainWindow) {
      mainWindow.webContents.send('notion-auth-success')
      setTimeout(() => {
        mainWindow.webContents.send('refresh-data')
      }, 100)
    }

    if (notionAuthWindow) {
      notionAuthWindow.close()
    }
  }
}

// Google OAuth 콜백 처리
function handleAuthCallback(url) {
  console.log('[Auth] Handling callback URL:', url)

  // localhost로 리다이렉트되고 access_token이 있을 때만 처리
  if (url.startsWith('http://localhost') && url.includes('access_token')) {
    console.log('[Auth] Token found in URL')

    try {
      // fragment(#) 를 query(?)로 변환해서 파싱
      const hashIndex = url.indexOf('#')
      if (hashIndex > -1) {
        const fragment = url.substring(hashIndex + 1)
        const params = new URLSearchParams(fragment)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const providerToken = params.get('provider_token')

        console.log('[Auth] Access token:', accessToken ? 'found' : 'not found')
        console.log('[Auth] Refresh token:', refreshToken ? 'found' : 'not found')
        console.log('[Auth] Provider token (Google):', providerToken ? 'found' : 'not found')

        if (accessToken) {
          // 1. 메인 창으로 토큰 전달 (기존 코드)
          mainWindow.webContents.send('auth-callback', {
            access_token: accessToken,
            refresh_token: refreshToken,
            provider_token: providerToken
          })

          // [수정 포인트] 리액트 창에 데이터 갱신 신호를 보냅니다.
          // 이 신호가 있어야 Settings.jsx의 useEffect 리스너가 작동합니다.
          setTimeout(() => {
            mainWindow.webContents.send('refresh-data')
          }, 100)

          // 2. 인증 창 닫기 (기존 코드)
          if (authWindow) {
            authWindow.close()
          }
        }
      }
    } catch (err) {
      console.error('[Auth] Error parsing callback URL:', err)
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

  createMiniWindow()
  createMainWindow()

  // 앱 시작 시 메인 창 표시
  mainWindow.show()
  setupAutoUpdater()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (miniWindow.isVisible()) {
      miniWindow.hide()
    } else {
      // 중앙 하단에 위치시키기
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
      const [winWidth] = miniWindow.getSize()
      const x = Math.round((screenWidth - winWidth) / 2)
      const y = Math.round(screenHeight - 150) // 하단에서 150px 위
      miniWindow.setPosition(x, y)
      miniWindow.show()
      miniWindow.focus()
      miniWindow.webContents.send('focus-input')
    }
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// IPC: Google OAuth 창 열기
ipcMain.on('open-auth-window', (event, authUrl) => {
  createAuthWindow(authUrl)
})

// IPC: Notion OAuth 창 열기
ipcMain.on('open-notion-auth-window', (event, authUrl) => {
  createNotionAuthWindow(authUrl)
})

// IPC: 미니 창 닫기
ipcMain.on('close-mini-window', () => {
  if (miniWindow) miniWindow.hide()
})

// IPC: 메인 창 새로고침
ipcMain.on('refresh-main-window', () => {
  if (mainWindow) {
    mainWindow.webContents.send('refresh-data')
  }
})

// IPC: 메인 창 보이기
ipcMain.on('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

// IPC: 미니 창 크기 조절
ipcMain.on('resize-mini-window', (event, data) => {
  if (miniWindow) {
    const height = typeof data === 'object' ? data.height : data
    miniWindow.setSize(600, height, true)
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})
