# 데이터 출처와 외부 소프트웨어

## TJ 일본곡 번호표

유플리집 1.5.1은 Alfex4936의 번호책에 실린 2026년 11월 1일 기준 일본곡 6,659개와 11월 23일까지 TJ에서 별도로 확인한 추가 번호 19개를 사용합니다. 제목·가수·번호·제공된 한글 독음으로 검색합니다. 곡목 출처와 검증 기준일은 저장소의 `data/tj_catalog.json`에 기록합니다. [번호책](https://github.com/Alfex4936/tj-media-karaoke-api) · [TJ미디어 최신곡](https://www.tjmedia.com/song/recent_song)

번호책은 TJ미디어에서 자료를 갱신한다고 설명합니다. 해당 안내에서 제3자 앱의 곡목 재배포 조건은 확인되지 않았습니다. 이미지가 들어 있는 개인 플레이리스트와 음원 파일은 배포본에 포함하지 않습니다.

1.5.6의 번호책은 2026년 11월 23일 TJ미디어 공식 곡 검색에서 국가를 일본으로 지정해 확인한 6,678개입니다. 앱은 이 번호들의 제목·가수·작곡자를 사용하며, 일치하는 항목에는 Alfex 번호책의 독음을 함께 사용합니다. [TJ미디어 일본곡 검색](https://www.tjmedia.com/song/accompaniment_search?nationType=JPN)

## 곡명과 원곡 식별 자료

- `data/work_sources.json`은 VocaDB 기여자들의 곡명, 참여자, 원곡·파생곡 관계와 영상 식별자를 추출해 TJ 번호와 대조한 자료입니다. 각 작품의 `id`는 VocaDB 작품 번호입니다. 이 데이터는 CC BY 4.0으로 배포합니다. [VocaDB](https://vocadb.net/) · [이용 조건](https://wiki.vocadb.net/docs/license) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- `data/recording_aliases.json`은 Wikidata 기여자들이 공개한 가수·작품 식별자와 언어별 명칭을 TJ 곡목과 대조한 자료입니다. 원본 구조화 데이터에는 CC0가 적용됩니다. [Wikidata 라이선스](https://www.wikidata.org/wiki/Wikidata:Licensing)
- `data/loanwords.json`은 Electronic Dictionary Research and Development Group의 JMdict 일본어·영어 사전에서 번호책에 쓰인 가타카나 표기와 영문 풀이를 선별하고 정규화한 자료입니다. 사전과 이 파생 파일은 CC BY-SA 4.0으로 배포합니다. [JMdict 저작권 및 이용 조건](https://www.edrdg.org/edrdg/licence.html) · [사용한 JSON 배포판](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20261116213322) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## 외부 라이브러리와 사전

한자만으로 된 일부 보컬로이드 원제의 한국 한자음 표기는 Unicode 17.0.0 Unihan의 발음 및 이체자 자료에서 계산했습니다. Unicode, Inc.의 Unicode License V3 고지를 APK의 `assets/licenses/unicode.txt`에 포함합니다. [Unicode Han Database](https://www.unicode.org/reports/tr38/) · [라이선스 원문](unicode-license.txt)

| 구성 요소 | 사용 목적 | APK에 포함한 고지 파일 |
| --- | --- | --- |
| WanaKana | 가나·로마자 변환 | `wanakana.txt` |
| kuromoji.js | 일본어 형태소 분석 | `kuromoji.txt` |
| MeCab IPADIC | 일본어 독음 사전 | `kuromoji-notice.txt` |
| async, doublearray, lodash, zlibjs | 분석 라이브러리의 의존성 | `async.txt`, `doublearray.txt`, `lodash.txt`, `zlibjs.txt` |

각 구성 요소의 원문 고지는 APK의 `assets/licenses/`에서 확인할 수 있습니다. 유플리집 자체 소스에는 별도의 오픈소스 라이선스를 지정하지 않았습니다.
