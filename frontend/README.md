# Frontend

Electron + React (electron-vite) 기반 데스크톱 앱 프론트엔드입니다.

## 한국어

### 추천 개발환경

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### 설치

```bash
npm install
```

### 개발

```bash
npm run dev
```

### 아이콘 생성

앱 아이콘을 변경한 경우 다음 명령어로 macOS/Windows용 아이콘을 재생성합니다:

```bash
# macOS 아이콘 생성 (.icns)
npm run icons:mac

# Windows 아이콘 생성 (.ico)
npm run icons:win

# 모든 플랫폼 아이콘 한 번에 생성
npm run icons
```

**요구사항:**
- 소스 아이콘: `resources/icon.png` (1024x1024, RGBA 형식)
- 생성 위치: `build/icon.icns`, `build/icon.ico`
- 빌드 전에 아이콘 파일들을 반드시 git에 커밋해야 합니다 (GitHub Actions에서 사용)

### 로컬 빌드 (publish 없음)

```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

### 릴리즈 (GitHub Actions)

태그를 push하면 **GitHub Releases**로 설치 파일이 자동 빌드/업로드되도록 구성합니다.

#### 릴리즈 빌드 트리거

레포 루트에서:

```bash
git tag v0.0.1
git push origin v0.0.1
```

#### 빌드 결과 확인 위치

- GitHub **Actions** → 태그 push로 실행된 워크플로 런에서 macOS/Windows 로그 및 (있다면) 아티팩트 확인
- GitHub **Releases** → `v0.0.1` 릴리즈 페이지에서 산출물 확인
  - 예상 산출물:
    - macOS: `.dmg` (+ 자동업데이트용 `.zip` + `latest-mac.yml`)
    - Windows: 설치형 `.exe` (NSIS)

#### 버전 규칙

- 릴리즈 버전 == 태그 버전
  - 예: `v0.0.1` 태그 → 앱 버전 `0.0.1`
- 워크플로에서는 빌드 전에 아래 둘 중 하나로 버전을 맞춰야 합니다.
  - `frontend/package.json` 버전 업데이트 (예: `npm version --no-git-tag-version 0.0.1`)
  - 또는 electron-builder에 버전 주입

---

## English

Electron + React (electron-vite) desktop app frontend.

### Recommended IDE setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Icon generation

If you update the app icon, regenerate platform-specific icons:

```bash
# Generate macOS icon (.icns)
npm run icons:mac

# Generate Windows icon (.ico)
npm run icons:win

# Generate all platform icons at once
npm run icons
```

**Requirements:**
- Source icon: `resources/icon.png` (1024x1024, RGBA format)
- Output: `build/icon.icns`, `build/icon.ico`
- Icon files must be committed to git before building (used by GitHub Actions)

### Local build (no publish)

```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

### Release (GitHub Actions)

Pushing a tag triggers a build and publishes installers to **GitHub Releases**.

#### Trigger a release build

From the repo root:

```bash
git tag v0.0.1
git push origin v0.0.1
```

#### Where to confirm the build

- GitHub **Actions** → the workflow run triggered by the tag push (macOS/Windows logs + artifacts if uploaded)
- GitHub **Releases** → the `v0.0.1` release assets
  - Expected assets:
    - macOS: `.dmg` (+ `.zip` + `latest-mac.yml` for auto-update)
    - Windows: installer `.exe` (NSIS)

#### Versioning

- Release version == tag version
  - Example: `v0.0.1` tag → app version `0.0.1`
- The workflow should either:
  - update `frontend/package.json` before building (e.g. `npm version --no-git-tag-version 0.0.1`), or
  - inject the version into electron-builder at build time
