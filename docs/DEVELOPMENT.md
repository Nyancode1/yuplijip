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

키가 설정되면 `dist/유플리집.apk`가 만들어집니다. API 키 없이 화면을 테스트하는 개발 빌드는 `mobile/build/유플리집-dev.apk`에 저장합니다. 로컬 ZIP도 필요할 때만 `-Zip`을 추가합니다. 공식 배포 빌드는 기존 설치본과 같은 서명 키를 사용하고 인증서 지문을 검사합니다.

## 정식 릴리스

공개 플레이리스트 등록에는 Google Cloud 프로젝트에서 발급한 YouTube Data API v3 키를 사용합니다. 앱이 Google에 직접 요청하므로 별도 서버 배포가 필요하지 않습니다. Android 제한에 패키지 `app.songbook.tj`와 서명 인증서 SHA-1 `A7:14:95:DE:9C:A0:98:95:1B:FC:EB:85:82:DF:B4:FE:25:18:71:07`을 등록하고 API 제한을 YouTube Data API v3로 지정합니다. 개발 빌드를 다른 키로 서명하면 해당 서명용 개발 API 키를 사용합니다.

빌드에서는 환경 변수 `YUPLIJIP_YOUTUBE_API_KEY` 또는 Git에서 제외한 `private/youtube-api-key.txt`의 키를 읽습니다. 배포용 APK에는 이 값이 포함됩니다. 빌드할 때 키가 없으면 정식 릴리스를 중단합니다. 구글이 일일 한도를 거절하면 새 목록이나 갱신 요청에 오류를 표시하고 저장 중이던 일부 페이지만으로 기존 목록을 덮어쓰지 않습니다.

1. `mobile/AndroidManifest.xml`에서 버전 이름과 버전 코드를 올립니다. 같은 버전 표기를 쓰도록 `package.json`과 잠금 파일도 갱신합니다.
2. 기존 서명 키가 있는 PC에서 `powershell -NoProfile -ExecutionPolicy Bypass -File mobile/build.ps1 -Release`를 실행합니다.
3. 생성한 APK를 `release/yuplijip.apk`로 복사하고 `main` 브랜치에 올립니다. GitHub Actions가 패키지명, 서명, 업데이트 대상 저장소와 버전 순서를 확인하고 APK 한 개를 정식 릴리스에 게시합니다. ZIP은 PC의 `dist/`에 보관합니다. 1.5.1의 태그는 `v1.5.1-7`입니다.

업데이트 안내는 앱을 열 때 표시됩니다. Android가 설치 권한이나 추가 검사를 요청할 수 있습니다. 서명 키는 이 저장소에 포함되지 않습니다.

## 곡목 관리

`src/export_alfex.js`는 Alfex 번호책의 일본곡 검색 결과에서 번호·제목·가수와 제공된 한글 독음을 읽습니다. 내보낸 JSON에 `node src/import_catalog.js <파일>`을 실행하면 중복 번호와 필수 항목을 검증합니다. `node src/update_tj_catalog.js`는 TJ 최신곡의 번호·제목·가수를 공식 일본곡 검색과 대조해 추가합니다. 곡목을 바꾼 뒤 APK를 다시 빌드합니다.

개인 곡 목록을 PC에서 변환하려면 `npm run match -- <목록 파일>`을 실행합니다. 변환 결과는 `private/pc/data/`에 저장됩니다.

일본곡 번호책과 외부 사전을 갱신할 때는 다음 명령을 사용합니다. 첫 번째 명령은 TJ 공식 검색의 국가 필터를 일본(JPN)으로 지정하고 모든 번호를 페이지 끝까지 조회합니다. 마지막 인수에는 JMdict-Simplified 영어 JSON 파일 경로를 지정합니다.

작품 자료를 만들 때는 Unicode 17.0.0의 `Unihan_Readings.txt`와 `Unihan_Variants.txt`를 압축에서 꺼내 `mobile/build/`에 둡니다. [Unicode 17.0.0 Unihan 자료](https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip)

```powershell
node src/update_catalog_metadata.js fresh <JMdict-영어-JSON-경로>
node src/update_work_sources.js
node src/update_recording_aliases.js
npm.cmd test
```

VocaDB에서는 평점순 원곡 5,000건을 번호책과 대조하고, 보이스뱅크 명의가 있으면서 아직 연결되지 않은 TJ 곡은 등록 제목으로 추가 조회합니다. 원곡 항목이 없으면 같은 제목의 리마스터 음원도 대조합니다. 작품을 식별하면 연결된 커버·리믹스의 영상 ID와 크레딧을 수집합니다. Wikidata에서는 일본곡 번호책에 두 곡 이상 등록된 가수의 작품명과 다국어 표기를 확인하며, 작곡자의 별칭은 TJ 등록 크레딧과 일치할 때 사용합니다. 두 작업의 다운로드 캐시는 `mobile/build/work-metadata-v2/`와 `mobile/build/wikidata/`에 저장합니다. 새 시점의 자료를 받을 때는 이 캐시를 새 디렉터리로 옮긴 후 실행합니다.
