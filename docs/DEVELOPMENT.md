# 개발과 배포

## 폴더 구조

| 경로 | 용도 |
| --- | --- |
| `mobile/java/` | Android 화면, 파일 선택, 썸네일 저장, 앱 업데이트 |
| `mobile/ui/` | 화면, 기기 목록 읽기, 저장소, 매칭 작업 |
| `mobile/res/`, `mobile/AndroidManifest.xml` | 아이콘, 앱 이름, 버전 및 권한 |
| `src/` | 공용 매칭 규칙, 로컬 CLI, 곡목 수집·검증 도구 |
| `data/` | 앱의 오프라인 TJ 곡목과 출처 |
| `test/` | 네트워크 없이 실행하는 매칭·파일 입력 테스트 |
| `.github/workflows/` | 서명한 APK를 GitHub 릴리스로 배포하는 작업 |
| `release/` | 다음 릴리스에 사용할 서명한 `yuplijip.apk` |
| `dist/`, `mobile/build/` | 내보낸 APK·ZIP 및 빌드 중간물 |
| `private/` | 개인 목록, PC용 옛 도구, 조사 기록. Git 제외 |

## 로컬 빌드

Windows에서 Node.js 24, Android SDK Platform 35, Build Tools 35.0.0, Android Studio JDK를 준비합니다. SDK와 JDK 경로는 빌드 명령에 `-SdkPath`와 `-JdkPath`로 지정할 수 있습니다.

```powershell
npm.cmd ci
npm.cmd test
powershell -NoProfile -ExecutionPolicy Bypass -File mobile/build.ps1
```

`dist/유플리집.apk`와 `dist/유플리집.zip`이 만들어집니다. 개발 빌드는 로컬 키로 서명합니다. 공식 배포 빌드는 기존 설치본과 같은 서명 키를 사용하고 인증서 지문을 검사합니다.

## 정식 릴리스

1. `mobile/AndroidManifest.xml`에서 버전 이름과 버전 코드를 올립니다. 같은 버전 표기를 쓰도록 `package.json`과 잠금 파일도 갱신합니다.
2. 기존 서명 키가 있는 PC에서 `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/build.ps1 -Release`를 실행합니다.
3. 생성한 APK를 `release/yuplijip.apk`로 복사하고 `main` 브랜치에 올립니다. GitHub Actions가 패키지명, 서명, 업데이트 대상 저장소와 버전 순서를 확인하고 APK와 ZIP을 정식 릴리스에 게시합니다. 1.5.1의 태그는 `v1.5.1-7`입니다.

업데이트 안내는 앱을 열 때 표시됩니다. Android가 설치 권한이나 추가 검사를 요청할 수 있습니다. 서명 키는 이 저장소에 포함되지 않습니다.

## 곡목 관리

`src/export_alfex.js`는 Alfex 번호책의 일본곡 검색 결과에서 번호·제목·가수와 제공된 한글 독음을 읽습니다. 내보낸 JSON에 `node src/import_catalog.js <파일>`을 실행하면 중복 번호와 필수 항목을 검증합니다. `node src/update_tj_catalog.js`는 TJ 최신곡의 번호·제목·가수를 공식 일본곡 검색과 대조해 추가합니다. 곡목을 바꾼 뒤 APK를 다시 빌드합니다.

개인 곡 목록을 PC에서 변환하려면 `npm run match -- <목록 파일>`을 실행합니다. 변환 결과는 `private/pc/data/`에 저장됩니다.
