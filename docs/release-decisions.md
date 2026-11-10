# 릴리스 결정 문서 (나들오피스)

> 이 문서는 `docs/release-pipeline-design.md` §5의 미결정 항목을 **선택지·추천·결정 기록** 형식으로 옮긴 것입니다. 설계 문서는 "무엇을 어디에 만들 것인가"를, 이 문서는 "어느 쪽으로 갈 것인가"를 다룹니다.
> 기준 저장소: `scottnaddle/naddle-office` @ `0d6090d` (업스트림 `v0.12.11` import 기반).
> 표기: `[직접확인]` = 이 저장소에서 직접 본 것 · `[추정]` = 미확인 판단 · `[보고]` = 다른 에이전트 보고 인용.

---

## 0. 이 문서를 쓰는 방식

- 각 항목은 **결정 필요 사항 → 근거 → 선택지 → 추천 → 결정자** 순서입니다.
- **추천은 제 판단**이고, 최종 결정은 사람이 합니다. 결정되면 해당 항목의 "결정 기록"에 날짜와 결정자를 적고, `docs/plan.md`의 대응 항목과 함께 갱신합니다.
- 결정이 필요한 **사람 결정**과, 제가 승인 없이 진행할 수 있는 **운영 사항**을 구분했습니다.

| 구분               | 항목                                       |
| ------------------ | ------------------------------------------ |
| 사람 결정 (D1–D12) | 서명·피드·브랜딩·채널 등 릴리스의 방향     |
| 운영 사항 (O1–O4)  | CI 도입 과정에서 생긴, 설정·비용 수준의 것 |

---

## 1. 사람 결정 항목

### D1. Windows 서명 방식

**결정 필요** — Windows production 서명을 어떤 방식으로 구현할 것인가.

**근거** `[직접확인]`

- `apps/shell/electron-builder.cjs:958` — `GENOFFICE_WIN_SIGN_MODE` 환경변수(`test`/`production`, 그 외 throw)
- `:963` — `config.win.signtoolOptions` 설정
- `:970` — `join(__dirname, '../../scripts/win-sign.cjs')` 호출. **이 파일이 없습니다**(업스트림 `main`에도 0건) → `GENOFFICE_WIN_SIGN_MODE`을 켜면 패키징 시점에 실패합니다.
- `:945`-`:957` 주석 — "test = alpha self-signed PFX, production = DigiCert KeyLocker — the two modes of `scripts/win-sign.cjs`"

**선택지**

| 안    | 구성                                                          | 장점                                                                     | 위험·비용                                                                                    |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **A** | `scripts/win-sign.cjs`를 직접 작성 + `CSC_LINK`로 인증서 주입 | 업스트림 주석이 약속한 계약 그대로. 키 회전·폐기 로직을 우리 손으로 관리 | 스크립트를 우리가 작성·검증해야 함. 인증서 로딩 방식이 Electron/electron-builder 버전에 묶임 |
| **B** | electron-builder 내장 `CSC_LINK`만 사용(훅 없음)              | 스크립트 작성 불필요                                                     | **extraResources 서명이 안 됩니다**(§D2). MDM에서 앱이 죽는 사례가 업스트림 주석에 있음      |
| **C** | KeyLocker 등 클라우드 서명 서비스 직접 연동                   | 키가 로컬에 없음(보안↑)                                                  | 클라우드 의존성·비용·구현 난이도. electron-builder의 `signtoolOptions` 우회 필요             |

**추천: A.** 근거는 B가 "installer만 서명해서 자식 프로세스가 죽는" 문제를 그대로 남기기 때문입니다. `scripts/win-sign.cjs`는 업스트림이 **이미 계약을 문서화해 둔** 지점이라, 우리가 채우는 것은 계약 구현이지 새 설계가 아닙니다. C는 Phase 0에서 과합니다.

**결정자** scott-air15 · **기록** —

---

### D2. Windows 코드서명 인증서 종류·보유 주체·갱신 절차

**결정 필요** — 어떤 인증서를 누가 보유하고, 갱신 때 기존 설치를 어떻게 이어 갈 것인가.

**근거** `[직접확인]`

- `docs/releasing.ko.md:111` — 서명된 빌드가 한 번 배포되면 이후 서명 없는 버전으로는 업데이트되지 않는다고 경고
- `docs/plan.md` §8.1-14 — "서명 키 교체 경로"를 초기 설계에 포함해야 한다는 이미 결정된 항목

**선택지**

| 안    | 구성                                                         | 장점                 | 위험                                                         |
| ----- | ------------------------------------------------------------ | -------------------- | ------------------------------------------------------------ |
| **A** | OV/EV 코드서명 인증서(도메인 검증형) + 내부 서명 전담자 지정 | MDM 배포 표준을 충족 | 주체 비용 발생                                               |
| **B** | 조직 내부 인증서(사내 PKI)                                   | 비용 없음            | MDM이 신뢰하지 않을 수 있음(OV/EV 미보증)                    |
| **C** | 인증서 없이 unsigned 유지 + MDM 대신 다른 배포 방식          | 비용·키 관리 0       | "알 수 없는 게시자"로 배포 차단 → enterprise 요구사항 미충족 |

**추천: A**, 그리고 **갱신 경로를 D1·D3과 함께 초기 설계에 포함**하는 것을 권합니다(갱신 시점엔 구버전 설치본이 구서명자 종속에 걸립니다).

**결정자** scott-air15 · **기록** —

---

### D3. mac Developer ID 보유 주체 + 공증 자격 + CI 인증서 임포트 방식

**결정 필요** — Developer ID 인증서를 누가 갖고, CI에서 어떤 방식으로 주입할 것인가.

**근거** `[직접확인]`

- `electron-builder.cjs:986`-`:989` — `identity='-'`·`hardenedRuntime=false`·`notarize=false`·`dmg.sign=false` (ad-hoc). **기본값은 이미 `hardenedRuntime:true`(`:737`)·`notarize:true`(`:741`)라 4줄만 바꾸면 됩니다.**
- `apps/shell/build/notarize-dmg.js:14`-`:23` — CI용 비밀값 `APPLE_ID`+`APPLE_APP_SPECIFIC_PASSWORD`+`APPLE_TEAM_ID` 지원, 로컬은 `APPLE_KEYCHAIN_PROFILE`
- `apps/shell/build/entitlements.mac.plist` — entitlement 2개뿐(`allow-jit`, `allow-unsigned-executable-memory`)
- 업스트림 `mac-build.yml:46` — `CSC_IDENTITY_AUTO_DISCOVERY:'false'` ("러너가 인증서를 임의로 집지 못하게" 막는 장치)

**선택지 (주체)**

| 안    | 구성                                            | 비고                            |
| ----- | ----------------------------------------------- | ------------------------------- |
| **A** | 조직 명의 Apple Developer Program(Team ID 보유) | 통상적. 공증 자격을 그대로 얻음 |
| **B** | 개인 Apple ID 기반                              | 개인 계정에 묶여 리스크         |

**선택지 (CI 주입 방식)**

| 안    | 구성                                                                    | 장점                        | 단점                                                        |
| ----- | ----------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| **A** | p12를 시크릿으로 보관 → 러너 키체인에 import → `APPLE_KEYCHAIN_PROFILE` | notarize-dmg.js가 이미 지원 | 시크릿에 바이너리 인증서(만료 시 갱신 필요)                 |
| **B** | `APPLE_ID`+앱 전용 비밀번호+`APPLE_TEAM_ID` (Apple ID 방식)             | 시크릿이 3개 문자열뿐       | Apple ID 로그인 방식은 2FA·애플 정책에 묶임. 키 재사용 불가 |
| **C** | Apple Developer Program API로 인증서 발급을 자동화                      | 키 수명 최소화              | 구현 난이도·계정 API 키 관리                                |

**추천: 주체 A + 주입 방식 A.** 이유: `notarize-dmg.js`가 이미 A를 우선 지원하고, B는 Apple ID 비밀번호를 CI에 두는 방식이라 인증서 회전·폐기 시 교체가 어렵습니다. C는 Phase 0 과잉입니다.

**추가 확인 필요(사람)**: hardened runtime + 별도 바이너리 포함 시 추가 entitlement이 필요한지는 **실기 확인** 항목입니다(엔티틀먼트 2개 상태). 추정이 아니라 실기 검증으로 확정합니다.

**결정자** scott-air15 · **기록** —

---

### D4. 릴리스 피드 저장소 공개 여부 + provider

**결정 필요** — 업데이트 피드를 어디에 두고 어떤 provider로 올릴 것인가. **자동 업데이트 전체의 전제**입니다.

**근거** `[직접확인]`

- `electron-builder.cjs:1003`-`:1005` — `publish: [{ provider:'github', owner: REPO_OWNER, repo: REPO_NAME }]`
- `:995`-`:997` 주석 — "the releases of the **public** repository … the repository is public, which is why no token or feed URL has to be injected"
- `apps/shell/src/main/updater.ts:747` — `CHANNEL_FEED = { stable:'latest', beta:'beta' }`, `:809` 적용
- `docs/plan.md` §8.1-21 — 릴리스 저장소 공개/비공개 분리 자체가 결정 항목

**선택지**

| 안    | 구성                                                           | 장점                                             | 위험·비용                                                                                                                                |
| ----- | -------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **공개** GitHub 릴리스 저장소(별도) + `provider:'github'`      | 토큰 불필요(위 주석의 전제 유지). 피드 자동 생성 | **공개 전환 = 저장소 설정 변경(✓ 승인)**. 개발 중에도 릴리스 노트·브랜드가 노출. `docs/plan.md` §6.6.1의 공개 전 점검 5개와 연결         |
| **B** | private GitHub + 토큰                                          | 파일 분리                                        | 클라이언트에 토큰 배포 필요(시크릿 배포 문제). **private + github provider는 조용히 실패** — 업데이트 실패를 사용자가 모름               |
| **C** | private 피드 서버(`provider:'s3'` 또는 `'generic'`) + 자체 URL | 완전 분리·공개 범위 통제                         | 피드 URL이 앱에 박힘 → **URL 변경 = 기존 사용자 업데이트 경로 차단**. 서버 운영 필요(저장소 밖). 피드 서버 가용성이 업데이트 가용성이 됨 |

**선행 관계** — A안의 "공개 전환"은 아래 두 가지가 **먼저**여야 합니다: ① **상표·도메인 충돌 검색**(사람 확인, `docs/plan.md` §8.1-8) ② `docs/plan.md` §6.6.1의 **공개 전 점검 5개**(산출물 바이너리 문자열 스캔 포함). 둘 다 통과한 뒤에야 공개 전환을 요청합니다. 즉 A안은 "피드 위치를 정한다"와 "저장소를 공개한다"가 별개 결정이며, 후자는 위 선행 조건에 묶입니다.

**추천: A.** B는 "조용히 실패"가 남고, C는 Phase 0에서 서버·URL 안정성 부담이 큽니다. 다만 A는 공개 전환 승인이 필요하므로 **계획서 §6.6.1의 공개 전 점검 5개(바이너리 문자열 스캔 포함)를 통과한 뒤** 전환하는 순서를 밟아야 합니다. 리포 공개 전환 결정을 별도로 (§8.1-18) 받는 것과 연결됩니다.

**결정자** scott-air15 · **기록** —

---

### D5. Google Drive 클라이언트 포함 여부

**결정 필요** — 빌드에 Drive 클라이언트를 넣을 것인가.

**근거** `[직접확인]`

- 업스트림 `mac-build.yml:93`-`:94`·`windows-build.yml:92`-`:93` — `GENOFFICE_GOOGLE_CLIENT_ID`·`GENOFFICE_GOOGLE_CLIENT_SECRET`을 빌드에 주입
- 같은 워크플로 `:110`(`mac`)·`:113`(`windows`) — 값이 없으면 경고 후 **Drive 없이 배포**하고, 값이 있는데 앱에 안 들어갔으면 실패

**선택지** — A: 포함(비밀값 2개 등록 필요) / B: 제외(비밀값 0개, Drive 기능 없음)

**추천: 초기에는 B.** enterprise 첫 고객이 Drive 연동을 요구하는지 아직 모릅니다(계획서 §8 미확인). B로 시작하면 비밀값·OAuth 승인· scopes 관리 부담이 없고, 나중에 A는 워크플로에 이미 주입 지점이 있어 어렵지 않습니다. 단 **B라면 "Drive 없음"이 고객 문서에 명시**되어야 합니다.

**결정자** scott-air15 · **기록** —

---

### D6. `win-ocr.exe`·`win-quicklook.exe` 유지 여부

**결정 필요** — Windows 전용 보조 실행 파일 2종을 빌드 대상에서 뺄 것인가.

**근거** `[직접확인]`

- `electron-builder.cjs:110`·`:111` — 경로 정의, `:113` `ensurePlatformHelpers()`가 존재 확인, `:638`-`:643`에서 extraResources로 패키징
- `packages/pdf2docx/ocr-helper/build-win.mjs`·`apps/shell/src/main/quick-look/build-win.mjs` — Windows 전용 `csc.exe`(.NET Framework 4.x)로 컴파일
- `electron-builder.cjs:119`-`:125`·`:130`-`:134` — **win32일 때만 패키징 시점에 컴파일**

**선택지** — A: 유지 / B: 제외(기능의 제거)

**추천: A(유지).** 베이스가 업스트림 그대로이고, 제외하면 "문서 스캔 OCR"·"탐색기 빠른 보기"라는 사용자 기능이 사라집니다. 다만 유지하는 대가로 **Windows 러너가 필수**가 됩니다(§D12).

**결정자** scott-air15 · **기록** —

---

### D7. 제품명 슬러그 확정 (브랜딩 3축)

**결정 필요** — 산출 파일명·앱 ID·프로토콜 핸들러·표시명을 확정한다. **첫 릴리스 후 되돌릴 수 없습니다.**

**근거** `[직접확인]`

- `electron-builder.cjs:23` `APP_ID='io.github.pblsketch.ieumoffice'` · `:24` `PRODUCT_NAME='IeumOffice'` · `:28` `PACKAGED_APP_NAME='ieumoffice'` · `:29`-`:30` `REPO_OWNER='pblsketch'`·`REPO_NAME='openoffice'`
- 업스트림 워크플로는 앱 이름·버전 피드 파일명을 하드코딩(`mac-build.yml:128`·`:135`·`:143`·`:156`·`:157`·`:183`-`:184`, `windows-build.yml:129`·`:133`·`:137`·`:143`·`:153`·`:172`, `linux-build.yml:150`·`:152`·`:155`-`:157`·`:163`·`:179`)
- `docs/plan.md` §8.1-8·§8.1-10 — 3축 분리 원칙, 공개 전 확정 대상

**3축**

| 축                    | 키              | 현재 값(업스트림)                | 예시                             |
| --------------------- | --------------- | -------------------------------- | -------------------------------- |
| 산출 파일명           | `productName`   | `IeumOffice`                     | `NaddleOffice-Setup-0.12.11.exe` |
| 앱 ID·프로토콜 핸들러 | `appId`         | `io.github.pblsketch.ieumoffice` | `global.naddle.office`           |
| 표시명(한글)          | `productNameKo` | —                                | `나들오피스`                     |

**선택지** — A: `NaddleOffice` / `global.naddle.office` / `나들오피스` · B: `Naddle` 계열 축약 · C: 한글 중심(예: `NadleOffice` → **`Naddle`가 '나들'과 헷갈리지 않는지** 계획서 §8.1-8이 점검 항목을 못 박음)

**추천: A.** 리포명 `naddle-office`·결정된 제품명 '나들오피스'와 어긋나지 않고, 파일명·앱 ID가 영문으로 안정적이고 짧습니다. `naddle`만 봤을 때 '나들오피스'로 오독될 여지가 없다는 계획서 점검을 통과한다고 보고(사람 확인 필요).

**결정자** scott-air15 · **기록** —

---

### D8. mac hardened runtime entitlement 추가 필요 여부

**결정 필요** — Developer ID 서명·hardened runtime 전환 시 entitlement 추가가 필요한가.

**근거** `[직접확인]` — `apps/shell/build/entitlements.mac.plist`에 `allow-jit`·`allow-unsigned-executable-memory` 2개뿐. `electron-builder.cjs:737` `hardenedRuntime:true`는 이미 켜져 있음(현재는 ad-hoc라 꺼짐).

**선택지** — A: 현 entitlements 유지 / B: 추가 entitlement 필요(어떤 것인지는 실기 확인)

**추천: 실기 확인 후 결정.** D3과 묶어, Developer ID 서명·공증 빌드 1회로 실제 확인합니다(추정으로 정하지 않음). 좁은 범위(사이드카·보조 프로세스 실행)라 `allow-jit`로 충분할 가능성이 높지만 **실측으로 확인**합니다.

**결정자** scott-air15(실기 확인 결과 수령 후) · **기록** —

---

### D9. `publish` provider 덮어쓰기를 훅 1개로 쓸지, config 인자로 분리할지

**결정 필요** — D4에서 provider가 `github`가 아닌 경우, `electron-builder.cjs:1003`-`:1005`를 바꾸는 방식.

**근거** `[직접확인]` — 목표는 업스트림 훅 0개(`docs/plan.md` §6.6.1·§8.1-17). 업스트림 원본 파일의 값을 바꾸면 훅 1개이며, 훅 대장(파일·줄·목적·되돌리는법·회차) 기록 대상이 됩니다.

**선택지** — A: 훅 1개 + 대장 등록 / B: `-c.publish=…` CLI 인자로 주입(훅 0개, 단 CI에서 매번 명시) / C: 전용 overlay 스크립트로 분리(훅 1개, 제품 코드와 분리)

**추천: C.** 훅 예산을 0으로 유지하면서 변경이 한 파일에 모이고, 훅이 생겨도 원본 파일을 직접 손대지 않아 업스트림 동기화가 쉽습니다. 새 저장소용 대장 구조(§8.1-17)와 함께 만드는 것이 자연스럽습니다.

**결정자** devops 제안 + scott-air15 확인 · **기록** —

---

### D10. enterprise ring 운영 여부

**결정 필요** — stable/beta 2채널로 충분한가, 테스트→필로트→전체 ring이 필요한가.

**근거** `[직접확인]` — `apps/shell/src/main/updater.ts:747` `CHANNEL_FEED = { stable:'latest', beta:'beta' }`, `:809` `autoUpdater.channel = CHANNEL_FEED[channel]`. 채널을 늘리면 이 대응표 수정이 필요 → 업스트림 훅 1개.

**선택지** — A: stable/beta 유지(훅 0개) / B: ring 추가(훅 1개 + 운영 절차)

**추천: A로 시작.** 첫 고객 규모가 아직 모릅니다(계획서 §8-3 "대상 고객 규모 미정"). ring은 피드 운영·롤백 절차가 성숙한 뒤 D4·§3.7(서버 선배포)과 함께 도입하는 편이 안전합니다. **단, 서버 선배포 → beta → stable 순서가 이미 3단계이므로, 첫 고객은 beta로 franja 파일럿**하는 절차는 지금부터 가능하고 권합니다.

**결정자** scott-air15 · **기록** —

---

### D11. mac 자체 업데이트 스테이징 경로(결정 0097) 유지 여부

**결정 필요** — Developer ID 서명 도입 후에도 자체 스테이징 경로를 그대로 둘 것인가.

**근거** `[직접확인]`

- `apps/shell/src/main/mac-update.ts:154` `installMacStaging` · `:147` "instead of **Squirrel.Mac**" · `:19` quarantine 플래그를 만지지 않음 · `:47` 차단 사유 3종(`not-an-app-bundle`·`translocated`·`read-only`)
- `updater.ts:955`·`:960` 호출부
- `docs/releasing.ko.md:256` — "서명이 없으면 Mac의 업데이트 장치가 설치를 거부하므로… 자체 경로" (결정 0097)

**선택지** — A: 유지(권장) / B: 서명 후 표준 경로로 되돌림(쿼크 제거)

**추천: A(유지).** ad-hoc에서도 동작하며 서명 여부와 무관하게 동작하는 경로이고, 제거 시 되돌리기 비용이 생깁니다. 서명은 **Gatekeeper·MDM 배포** 사유이지 업데이트 불가 사유가 아니라는 점이 §6.6.2에서 이미 확정됐습니다.

**결정자** devops 제안 + scott-air15 확인 · **기록** —

---

### D12. Windows 산출물을 Windows 러너에서만 만들지, 로컬 크로스 빌드를 지원할지

**결정 필요** — Windows 설치 파일을 어디서 만드는가.

**근적** `[직접확인]`

- `electron-builder.cjs:113` `ensurePlatformHelpers()` — `process.platform === 'win32'`일 때만 `build-win.mjs`로 `win-ocr.exe`·`win-quicklook.exe`를 컴파일(`:119`-`:125`·`:130`-`:134`)
- mac도 darwin에서만 swiftc로 OCR 헬퍼를 컴파일(`:114`-`:116`, `:93`-`:103`)
- → **다른 OS 러너에서 빌드하면 헬퍼가 없는 채 빌드가 성공**하고 OCR·QuickLook가 조용히 빠집니다
- 사이드카만 크로스 빌드하는 경로는 v0.12.11에 존재: `apps/sheets/native/xlsx-engine/.cargo/config.toml` + `native:build` 스크립트의 `--config` (작업 디렉터리 기준 탐색이라 명시 필요)

**선택지**

| 안    | 구성                             | 장점                | 단점                                                  |
| ----- | -------------------------------- | ------------------- | ----------------------------------------------------- |
| **A** | Windows 러너 고정(업스트림 방식) | 완전한 산출물. 단순 | Windows 러너 필요(비용·시간)                          |
| **B** | 로컬 크로스 빌드 지원            | Mac Studio에서 바로 | 헬퍼 2종을 Windows 러너 산출물로 넘겨 붙여야 함. 복잡 |
| **C** | 두 가지 모두                     | 유연성              | 관리 대상이 두 개                                     |

**추천: A.** 업스트림과 동일하게 Windows 러너 고정으로 시작합니다. B가 필요해지면 그때 헬퍼를 artifact로 넘기는 설계를 별도로 검토합니다.

**결정자** scott-air15 · **기록** —

---

## 2. 운영 사항 (설정·비용 수준 · **✓ 승인 필요**)

> 이 절의 항목은 **사람 결정(§1)과 달리** 성격이 설정·비용 수준이지만, **저장소·계정 설정에 걸리므로 ✓ 승인 대상**입니다. 이미 머지·승인된 것과 진행 중인 것을 구분해 적습니다.

| 항목                                          | 상태                                         | 승인                                    |
| --------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| **O1** artifact 저장량 quota                  | 진행 중 — orchy가 scott-air15에게 결정 요청  | **✓ 승인 필요** (저장소·계정 설정·비용) |
| **O2** e2e 스펠 폴링 타임아웃                 | PR #12 열림                                  | 승인 불필요 (CI 개선)                   |
| **O3** 업스트림 소유 마크다운의 prettier 예외 | orchy가 결정 — 예외 유지                     | 승인 완료                               |
| **O4** `check:no-genspark` 게이트             | PR #10으로 **머지 완료**                     | 승인 완료                               |
| **O5** test job 45분 타임아웃                 | **원인 규명 완료** — 조치 PR은 PR #9 머지 후 | 승인 불필요 (CI 개선)                   |

### O1. GitHub Actions artifact 저장량 quota

- **현황** `[직접확인]` — CI 실행마다 `Failed to CreateArtifact: Artifact storage quota has been hit. Unable to upload any new artifacts. Usage is recalculated every 6-12 hours.` e2e 실패 아티팩트 415개 업로드가 실패했습니다.
- **영향** — 실패 원인을 남기는 아티팩트가 없어서 로그를 뒤져야 합니다. **계정/저장소 설정이라 승인 대상**입니다(orchy가 scott-air15에게 요청 중).
- **권장** — 저장소 artifact 보존 기간을 짧게 설정(예: 7일)하거나, 저장소 규모 대비 quota 상향. e2e 아티팩트는 실패 시점 진단용이므로 보존 기간만 짧아져도 부담은 줄고 진단 가능성은 유지됩니다.

### O2. e2e 스펠 검사 폴링 타임아웃

- **현황** `[직접확인]` — 스펠 검사 e2e 2건이 러너 속도에 따라 반복 실패(3회 실행 중 2회 실패, 1회 통과). 원인: 스크린샷 픽셀 카운팅 폴링의 15초 대기 부족(러너 이미지·워커 수·Electron 버전·스펙·코드는 업스트림과 동일, 해당 테스트만 2.8배 느림).
- **조치** — 저장소 e2e 관례(다른 스펙 다수 `timeout: 30_000`)에 맞춰 두 스펙의 폴링 상수를 30초로 상향하는 PR을 올렸습니다(PR #12). 업스트림과 동일한 파일이라 동기화 시 충돌 가능성은 중장기 과제로 기록합니다.

### O3. 업스트림 소유 마크다운의 prettier 예외

- **현황** `[직접확인]` — `format:check`는 prettier를 돌리지만 변경 파일만 검사합니다. 업스트림 소유 마크다운 2개(`apps/sheets/src/renderer/ai/prompts/guides/data-attribution.md`·`financial-formatting.md`)가 prettier 기준을 어기고 있어, 이 파일을 건드리는 PR은 `format:check`에서 실패합니다.
- **결정** — orchy 확인: **`.prettierignore`에 추가하지 않고**, 업스트림 동기화 시점에 그때 처리합니다. 그 파일을 고치는 PR이 생기면 그 PR에서 함께 정리합니다.

### O4. `check:no-genspark` 게이트와 출처 표기

- **현황** `[직접확인]` — 게이트가 나들오피스 자체의 Apache-2.0 §4 출처 표기 4건(`.github/README.md` 2·`NOTICE-NADDLE.md` 1·`docs/plan.md` 1)을 잡아 `main`의 test job이 step 16에서 멈췄습니다.
- **조치** — 허용 목록에 사유를 명시해 추가하는 PR을 올려 머지됐습니다(PR #10). **허용 범위는 해당 URL 4건으로만** 좁혔고, 같은 파일의 다른 표기는 여전히 잡힙니다.

### O5. `test` job 45분 타임아웃 — 단위 테스트가 끝까지 실행되지 않음

- **현황** `[직접확인]` — `.github/workflows/ci.yml:26` `timeout-minutes: 45`. attempt 1은 step 23(단위 테스트) **진행 중** 45m19s에 취소, attempt 2는 step 21(`Install xmllint`) 진행 중 45m15s에 취소. check-run annotation: `The job has exceeded the maximum execution time of 45m0s`. 두 실행이 설정값과 초 단위까지 일치.
  → **ci.yml을 원문 그대로 두면 이 저장소의 러너에서 단위 테스트가 끝까지 돌지 않습니다.**
- **e2e도 한도 가까이** — `:176` `timeout-minutes: 60`, 우리 e2e 소요 47m17s·44m20s = **한도의 79%**.
- **원인** — 워크플로 결함이 아니라 **예산 부족**입니다. 업스트림 러너 대비 1.1~1.7배 느린 환경(같은 이미지·워커 수·Electron 버전)에서 업스트림이 정한 45분이 모자랍니다.
- **확인된 것은 분명합니다** — attempt 2에서 스텝 1~20 전부 success: 라이선스(9·10)·포맷(11)·테마(12)·스킬(13)·도움말(14)·영어 주석(15)·`check:no-genspark`(16)·**Lint(17)**·**Typecheck(18)**·fixture 재생성·대조(19·20).
- **조치(계획)** — PR #9 머지 후 별도 PR에서 `timeout-minutes`를 test `45 → 90`, e2e `60 → 120`으로 올리고, `docs/upstream-modifications.md` 원장에 (파일·줄·이유·되돌리는 방법·업스트림 PR 가능 여부) 항목으로 남깁니다. `.github/workflows/ci.yml`은 업스트림에서 들여온 파일이라 **원장 등록이 전제**입니다.
  - **대안**: 더 빠른 러너(계정 설정 → **✓ 승인 필요**).
  - **업스트림 PR 가능 여부**: **가능** — 업스트림도 저속 러너에서는 같은 문제가 재현될 수 있습니다. 다만 업스트림 러너는 빨라 현재는 미발현입니다.
- **상태** — PR #9 머지 대기. 머지는 사람(✓ 승인 대상).

---

## 3. 결정 순서에 대한 제안

D4(피드 저장소)는 D7(제품명 슬러그)·D9(provider 덮어쓰기)와 맞물립니다. 피드 URL·owner/repo가 산출물명·앱 ID와 함께 **영구히 박히기 때문**입니다.

권장 순서:

1. **D7 → D4 → D9** (정체성·피드 위치 → provider 주입 방식)
2. **D1 → D2** (Windows 서명 방식 → 인증서)
3. **D3 → D8** (mac 서명 주체·방식 → entitlement 실기 확인)
4. **D5·D6·D10·D11·D12** (나머지)

각 결정이 정해지면 §1의 "기록"에 날짜·결정자를 적고, `docs/release-pipeline-design.md`의 대응 절과 `docs/plan.md` §8.1 항목을 갱신합니다.

---

## 4. 하지 않는 것

- 이 문서는 **결정 기록**이며, 결정이 나면 사람이 기입합니다. 제가 임의로 기입하지 않습니다.
- 서명 키·토큰·시크릿 값은 이 문서에도 **이름만** 씁니다.
- 서버 설정 변경·저장소 공개 전환·계정 설정 변경은 이 문서의 결정 범위 밖이며 별도 승인 대상입니다.
