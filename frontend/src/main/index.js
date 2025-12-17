// frontend/src/main/index.js

import { app, shell, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let miniWindow = null  // 미니 입력 창
let mainWindow = null  // 메인 앱 창

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

  // 포커스 잃으면 숨기기
  miniWindow.on('blur', () => {
    miniWindow.hide()
  })

  const miniUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}?mode=mini`
    : `file://${join(__dirname, '../renderer/index.html')}?mode=mini`

  miniWindow.loadURL(miniUrl)
}

// 메인 앱 창 생성 (일반 윈도우)
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    frame: true,  // 타이틀바, 닫기 버튼 있음
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

  // 닫기 버튼 누르면 숨기기 (완전 종료 X)
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.onegate')

  createMiniWindow()
  createMainWindow()

  // 핫키: Cmd + Shift + Space -> 미니 입력 창 토글
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

  // 앱 아이콘 클릭 시 메인 창 표시 (macOS)
  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// IPC: 미니 창 닫기
ipcMain.on('close-mini-window', () => {
  if (miniWindow) miniWindow.hide()
})

// IPC: 메인 창 새로고침 (데이터 갱신 요청)
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

// IPC: 미니 창 크기 조절 (필요시)
ipcMain.on('resize-mini-window', (event, height) => {
  if (miniWindow) miniWindow.setSize(600, height, true)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// 모든 창 닫혀도 앱 유지 (macOS 스타일)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 앱 종료 전 플래그 설정
app.on('before-quit', () => {
  app.isQuitting = true
})
