// frontend/src/main/index.js

import { app, shell, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let miniWindow = null
let mainWindow = null
let authWindow = null

// 미니 입력 창 생성 (Spotlight 스타일)
function createMiniWindow() {
  miniWindow = new BrowserWindow({
    width: 600,
    height: 60,
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

  const miniUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
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
    frame: true,
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

  const mainUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
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

// OAuth 콜백 처리
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

        console.log('[Auth] Access token:', accessToken ? 'found' : 'not found')
        console.log('[Auth] Refresh token:', refreshToken ? 'found' : 'not found')

        if (accessToken) {
          // 메인 창으로 토큰 전달
          if (mainWindow) {
            mainWindow.webContents.send('auth-callback', {
              access_token: accessToken,
              refresh_token: refreshToken
            })
            console.log('[Auth] Tokens sent to main window')
          }

          // 인증 창 닫기
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
  electronApp.setAppUserModelId('com.onegate')

  createMiniWindow()
  createMainWindow()

  // 앱 시작 시 메인 창 표시
  mainWindow.show()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (miniWindow.isVisible()) {
      miniWindow.hide()
    } else {
      miniWindow.center()
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

// IPC: OAuth 창 열기
ipcMain.on('open-auth-window', (event, authUrl) => {
  createAuthWindow(authUrl)
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
ipcMain.on('resize-mini-window', (event, height) => {
  if (miniWindow) miniWindow.setSize(600, height, true)
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
