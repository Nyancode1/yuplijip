# 데이터 출처와 외부 소프트웨어

## TJ 일본곡 번호표

유플리집 1.5.1은 Alfex4936의 번호책에 실린 2026년 11월 1일 기준 일본곡 6,659개와 11월 23일까지 TJ에서 별도로 확인한 추가 번호 19개를 사용합니다. 제목·가수·번호·제공된 한글 독음으로 검색합니다. 곡목 출처와 검증 기준일은 저장소의 `data/tj_catalog.json`에 기록합니다. [번호책](https://github.com/Alfex4936/tj-media-karaoke-api) · [TJ미디어 최신곡](https://www.tjmedia.com/song/recent_song)

번호책은 TJ미디어에서 자료를 갱신한다고 설명합니다. 해당 안내에서 제3자 앱의 곡목 재배포 조건은 확인되지 않았습니다. 이미지가 들어 있는 개인 플레이리스트와 음원 파일은 배포본에 포함하지 않습니다.

## 외부 라이브러리와 사전

| 구성 요소 | 사용 목적 | APK에 포함한 고지 파일 |
| --- | --- | --- |
| WanaKana | 가나·로마자 변환 | `wanakana.txt` |
| kuromoji.js | 일본어 형태소 분석 | `kuromoji.txt` |
| MeCab IPADIC | 일본어 독음 사전 | `kuromoji-notice.txt` |
| async, doublearray, lodash, zlibjs | 분석 라이브러리의 의존성 | `async.txt`, `doublearray.txt`, `lodash.txt`, `zlibjs.txt` |

각 구성 요소의 원문 고지는 APK의 `assets/licenses/`에서 확인할 수 있습니다. 유플리집 자체 소스에는 별도의 오픈소스 라이선스를 지정하지 않았습니다.
