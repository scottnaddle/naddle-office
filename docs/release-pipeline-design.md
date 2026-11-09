# 릴리스 파이프라인 설계 (나들오피스)

> 문서 상태: **설계 초안** (구현 전). 이 문서에는 코드가 없습니다.
> 기준 저장소: `scottnaddle/naddle-office` @ `c1ad4793` (업스트림 `v0.12.11` import 기반).
> 작성: @devops. 근거는 파일:줄로 적으며, `[직접확인]` = 이 저장소에서 직접 본 것, `[추정]` = 미확인 판단, `[보고]` = 다른 에이전트 보고 인용.
> 계획서(`docs/plan.md`) §6.6·§7·§8·§8.1 의 배포·릴리스 결정을 구현 가능한 형태로 옮긴 문서입니다.

---

## 0. 한 줄 요약

**CI 워크플로가 하나도 없고(0개), 서명 스크립트(`scripts/win-sign.cjs`)가 없어, 그대로는 릴리스가 불가능하다.** 파이프라인은 ① 업스트림 워크플로 이식 → ② 서명 적용 → ③ 피드(publish) 결정 → ④ 서버 선배포 순서라는 4단으로 구성하고, **결정 3건(Windows 서명 방식·mac 공증 자격·피드 저장소 공개 여부)이 사람 승인 없이는 Phase 0을 끝낼 수 없다.**

---

## 1. 목표 · 비목표

### 목표
1. 이 저장소에서 **재현 가능한 릴리스 빌드**(mac·linux·windows)를 돌릴 수 있게 한다.
2. **서명**(mac Developer ID + notarize, Windows code signing)을 넣어 MDM 배포 가능한 산출물을 만든다.
3. **업데이트 피드**(`latest*.yml` / `beta*.yml`)를 어디에 두고 어떤 provider로 올릴지 확정해, 자동 업데이트가 조용히 실패하지 않게 한다.
4. **서버 선배포 → beta → stable** 순서로 롤백 가능한 릴리스 절차를 문서로 고정한다.

### 비목표 (이번 문서에서 다루지 않음)
- 서버(`bot`·`gateway`·nginx) 구현·설정 변경 — 서버는 이 저장소 밖이며 §7에 운영 관점만 기술한다.
- 저장소 공개 전환(✓ 승인 대상, `docs/plan.md` §8.1-18).
- 시크릿 등록·저장소 설정 변경·Actions 설정 변경 (모두 승인 전 금지).

---

## 2. 현재 상태 (직접확인)

### 2.1 워크플로가 하나도 없다

| 항목 | 값 | 근거 |
|---|---|---|
| 이 저장소의 `.github/workflows/` | **0개** | `git ls-tree -r c1ad4793 \| grep workflows/` → 0건. `.github/`에는 `README.md`만 존재 |
| 업스트림 `v0.12.11`의 워크플로 | **0개** | `git ls-tree -r v0.12.11 \| grep workflows/` → 0건 |
| 업스트림 `main`의 워크플로 | 6개 (`ci`·`free-models`·`growth`·`linux-build`·`mac-build`·`windows-build`) | `upstream/main:.github/workflows/` |
| 업스트림 `main`과 `v0.12.11`의 거리 | **313 커밋 · 871 파일 차이** | `git rev-list --count v0.12.11..upstream/main` = 313, `git diff --shortstat` = 871 files changed |

→ **이 저장소에는 릴리스 파이프라인이 "있지만 옮기지 않은" 상태가 아니라 "아예 없는" 상태입니다.** 업스트림 `main`의 워크플로를 **가져오는 것 자체가** Phase 0의 첫 작업입니다.
→ 동시에 업스트림 `main`의 워크플로는 `v0.12.11` 이후 313커밋 분량 기준의 코드를 전제로 작성되어 있으므로, **가져온 뒤 v0.12.11 코드에 맞게 대조·조정하는 단계가 반드시 필요**합니다.

**대조 결과(선행 확인)** — `ci.yml`이 호출하는 루트 스크립트 13종은 전부 `v0.12.11`에 존재합니다(`licenses`·`format:check`·`check:theme-colors`·`check:skill-version`·`check:help-langs`·`check:english-comments`·`check:no-genspark`·`lint`·`typecheck`·`fixtures`·`dist:mac`·`dist:win`·`dist:linux`), Sheets 워크스페이스의 `fixtures`·`compat`도 존재합니다. → **CI 워크플로 이식의 기술적 장애물은 낮습니다** `[추정]`.

### 2.2 Actions는 이미 활성 — 저장소 설정 변경 불필요

- `scottnaddle/naddle-office` actions permissions = `{"enabled":true,"allowed_actions":"all"}` `[직접확인, 이전 조사 m294]`
- 워크플로 0개, 시크릿 0개 `[직접확인]`
- → **워크플로를 추가하고 실행하는 데 별도 승인(저장소 설정 변경)이 필요 없습니다.** 남는 승인 대상은 ①서명 키 ②릴리스 피드 저장소의 공개 범위 ③저장소 공개 전환뿐입니다.

### 2.3 product identity와 publish 대상이 업스트림 값 그대로다

`apps/shell/electron-builder.cjs` (이 저장소 `c1ad4793` 기준):

| 줄 | 값 | 비고 |
|---|---|---|
| `:23` | `APP_ID = 'io.github.pblsketch.ieumoffice'` | 앱 ID·프로토콜 핸들러 계열 |
| `:24` | `PRODUCT_NAME = 'IeumOffice'` | 산출 파일명 계열 |
| `:28` | `PACKAGED_APP_NAME = 'ieumoffice'` | per-user 캐시 폴더(`<name>-updater`) |
| `:29` | `REPO_OWNER = 'pblsketch'` | |
| `:30` | `REPO_NAME = 'openoffice'` | |
| `:1003`-`:1005` | `publish: [{ provider: 'github', owner: REPO_OWNER, repo: REPO_NAME }]` | **업스트림 공개 저장소를 가리킴** |
| `:995`-`:997` | "Auto-update feed: the releases of the public repository … the repository is public, which is why no token or feed URL has to be injected" | private 릴리스 저장소를 쓰면 이 전제가 깨짐 |

→ **릴리스 산출물명·앱 ID·업데이트 피드 대상이 3곳 모두 업스트림 값을 가리킵니다.** 이 3축은 `docs/plan.md` §6.6.4-2·§8.1-8/10의 브랜딩 3축과 같은 결정입니다(산출 파일명 / 앱 ID·핸들러 / 표시명). **파이프라인 구현 전에 확정하지 않으면, 첫 릴리스 후 산출물명과 업데이트 경로가 영구히 박힙니다.**

### 2.4 mac 서명: 인프라는 있고, 꺼져 있는 4줄뿐

| 줄 | 내용 |
|---|---|
| `electron-builder.cjs:737` | `hardenedRuntime: true` (기본값) |
| `electron-builder.cjs:741` | `notarize: true` (기본값) |
| `electron-builder.cjs:942` | `afterAllArtifactBuild: 'build/notarize-dmg.js'` |
| `electron-builder.cjs:986` | `config.mac.identity = '-'` ← ad-hoc |
| `electron-builder.cjs:987` | `config.mac.hardenedRuntime = false` ← 꺼짐 |
| `electron-builder.cjs:988` | `config.mac.notarize = false` ← 꺼짐 |
| `electron-builder.cjs:989` | `config.dmg.sign = false` ← 꺼짐 |

- 공증 실행기 `apps/shell/build/notarize-dmg.js`가 이미 **CI용 비밀값 3종**을 지원합니다: `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` (`:14`-`:23`). 로컬 전용으로 `APPLE_KEYCHAIN_PROFILE`도 지원(`:17`).
- `apps/shell/build/entitlements.mac.plist`의 entitlement는 **2개뿐**(`allow-jit`, `allow-unsigned-executable-memory`).
- **→ Developer ID 서명+공증으로 전환하는 데 필요한 코드 변경은 위 4줄(986-989)뿐이고, 이 저장소의 훅 예산은 0개 목표입니다.** [직접확인]

**mac 자체 업데이트는 서명과 무관하게 동작합니다** (`docs/plan.md` §6.6.2 확정 사항, devops m292 정정):
- `apps/shell/src/main/mac-update.ts:19` — "Nothing here adds or strips the quarantine flag …"
- `mac-update.ts:47` — 차단 사유 3종: `not-an-app-bundle` · `translocated` · `read-only` (**ad-hoc 서명은 차단 목록에 없음**)
- `mac-update.ts:147` — "Points electron-updater's Mac download at `stage` instead of **Squirrel.Mac**" (Squirrel.Mac 미사용)
- `mac-update.ts:154` — `installMacStaging` / `updater.ts:955`·`:960` 호출부
→ **mac 서명의 동기는 "자체 업데이트 불가"가 아니라 Gatekeeper 마찰과 기업 MDM 배포 불가입니다.**

### 2.5 Windows 서명 경로는 실제로 동작하지 않는다 ★블로커

| 줄 | 내용 |
|---|---|
| `electron-builder.cjs:958` | `const winSignMode = process.env.GENOFFICE_WIN_SIGN_MODE` (값: `test` / `production`, 그 외 throw) |
| `electron-builder.cjs:963` | `config.win.signtoolOptions = { … }` |
| `electron-builder.cjs:970` | `execFileSync(process.execPath, [join(__dirname, '../../scripts/win-sign.cjs'), winSignMode, configuration.path], …)` |
| `scripts/win-sign.cjs` | **파일 없음** — `scripts/`에는 `mcp-stdio-bridge.js`·`update-feed-utils.cjs` 2개뿐 (`git ls-tree` 확인, 업스트림 `main`에도 0건) |

**→ `GENOFFICE_WIN_SIGN_MODE=production`(또는 `test`)을 켜면 패키징 시점에 모듈을 못 찾아 죽습니다.** 주석이 약속한 "test=자체서명 PFX / production=DigiCert KeyLocker" 두 모드가 **실행 불가** 상태입니다.

**installer만 서명해서는 부족합니다** — `electron-builder.cjs:945`-`:957` 주석:
> Security features that judge every PE individually (Smart App Control, WDAC/AppLocker, AV heuristics) block unsigned child processes — the unsigned xlsx-sidecar.exe died with "spawn UNKNOWN" on such machines **even though the installer itself was signed**.

- electron-builder가 서명하는 것: 메인 실행 파일·NSIS uninstaller·installer (`signtoolOptions.sign` 경유). 업스트림 주석은 실행 파일을 `GenOffice.exe`라고 부르지만(`:946`-`:951`), 이 저장소에서는 브랜드 3축 결정(§2.3)에 따라 제품명으로 바뀝니다.
- electron-builder가 **서명하지 않는** 것: 정적 extraResources → `xlsx-sidecar.exe`(`:55`), `win-ocr.exe`(`:110`), `win-quicklook.exe`(`:111`)
- → **extraResources 3종은 워크플로가 서명해야 합니다.** (주석 `:954`-`:956`이 같은 취지)

**★ 서명 도입 시 반드시 뒤집어야 할 기존 규칙들** [직접확인]:
- 업스트림 `windows-build.yml:144`-`:146`은 **"설치 파일이 서명되어 있지 않은지"를 강제 검사**합니다: `(Get-AuthenticodeSignature '$installer').Status` 가 `NotSigned`가 아니면 exit 1. 이유 주석은 `:7`-`:8` — "a signed release would lock every later update to that signer". → **서명을 도입하면 이 검사를 반전해야 합니다(서명됨을 검증).**
- `windows-build.yml:48`·`mac-build.yml:46`의 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`는 "러너가 인증서를 임의로 집어오지 못하게" 막는 장치입니다("never pick up a certificate from the runner"). → 서명 시 인증서 **import**로 대체해야 합니다.
- `docs/releasing.ko.md:111`은 `CSC_LINK`·`WIN_CSC_LINK`·`GENOFFICE_WIN_SIGN_MODE`를 **"이 저장소에서는 쓰지 않는다"**고 명시하며, 한 번 서명된 릴리스는 이후 서명 없는 버전으로 업데이트되지 않는다고 경고합니다. → **정본 문서이므로 서명 도입과 동시에 반드시 고쳐야 합니다**(§4-9).
- `releasing.ko.md:173`-`:174`("알 수 없는 게시자" 안내·"서명이 없어도 자동 업데이트는 됩니다"), `:256`(mac은 서명이 없어야 자체 스테이징 경로가 필요 — 결정 0097)도 서명 상태에 따라 **안내 문구가 바뀝니다**.

### 2.6 빌드 순서 고정 (역순이면 조용히 죽는다)

- `electron-builder.cjs:933`-`:935` — `beforePack`이 `WIN_SIDECAR` 부재를 잡지만 **electron-builder는 exit 0으로 종료**합니다(오류 문구는 주석에 명시: "electron-builder exits 0 on a missing extraResources source … Sheets would ship dead").
- `electron-builder.cjs:113` `ensurePlatformHelpers()` — `win-ocr.exe`(`:117`)·`win-quicklook.exe`(`:128`) 존재 확인.
- → **사이드카 → 패키징 순서가 뒤집히면 빌드는 "성공"하면서 Sheets가 죽은 산출물이 나옵니다.** CI에서는 이 두 부재를 **실패 조건(hard fail)으로** 바꿔야 합니다.

### 2.7 이미 있는 릴리스 절차 문서·스킬 (정본) [직접확인]

이 저장소에는 **릴리스 절차 문서가 이미 있습니다.** 파이프라인을 새로 만드는 게 아니라, 이 절차를 CI로 옮기는 쪽입니다.

| 파일 | 역할 |
|---|---|
| `docs/releasing.ko.md` (315줄) | **정본** — 릴리스 절차(버전 올리기·설치 파일 만들기·게시·확인) |
| `.claude/skills/release-ieumoffice/SKILL.md` | 정본에 없는 **판단 기준·금지·승인 절차** ("문서와 어긋나면 문서를 따른다") |

**정본 절차의 흐름**(이 설계가 그대로 따를 부분):
1. 버전은 **`apps/shell/package.json`의 `"version"` 한 곳**에서 정합니다(루트 `package.json`의 `0.1.0`은 무관 — `releasing.ko.md` 3번).
2. **릴리스 본문만 먼저 공개**(파일 없음) → Actions 워크플로를 `release_tag` 지정으로 실행 → 빌드·검사 통과 → 파일이 그 릴리스에 자동 첨부 (`releasing.ko.md` 4번).
3. Windows 산출물에는 **출처 증명(attestation)**이 붙습니다 — `gh attestation verify IeumOffice-Setup-<ver>.exe --repo pblsketch/openoffice`. 워크플로 권한 `id-token: write`·`attestations: write` (업스트림 `windows-build.yml:35`-`:44`). → 이 저장소에서는 `--repo scottnaddle/naddle-office`로 바뀝니다.
4. 스킬이 정한 사람의 승인 게이트: Anthropic 상업 약관 동의(릴리스 1번)·버전 번호·**"Publish release"를 누르기 전**·릴리스 본문 최종본.

**관련 결정 기록**: `docs/tracking/decisions/0056-windows-build-on-actions.md`(Windows 빌드를 Actions로)·`0031-unsigned-mac-beta.md`(mac 미서명 베타)·`0065-intel-mac-beta.md`·`0097-mac-self-update-without-squirrel.md`.

→ **§3.3-5의 "사람이 릴리스 생성 → 워크플로가 첨부"는 업스트림 정본 절차와 이미 같습니다.** 파이프라인 설계는 이 절차를 바꾸지 않고, **CI 워크플로가 그 절차의 실행부**가 되게 하는 쪽입니다.

### 2.8 피드 지원 코드

- `apps/shell/src/main/updater.ts:747` — `CHANNEL_FEED = { stable: 'latest', beta: 'beta' }`, `:809` `autoUpdater.channel = CHANNEL_FEED[channel]`
- `scripts/update-feed-utils.cjs` 존재 — 피드 yml의 버전 파싱과 **forward-only promote/upload 가드**를 담고 있음(의존성 0).
- 다만 이 파일의 헤더 주석이 참조하는 `mac-release-upload.cjs`·`promote-stable.cjs`는 **이 저장소에도 업스트림 `main`에도 없습니다**(0건) `[직접확인]` → 피드 업로드·promote는 **새로 작성해야 합니다** (업스트림 `main`에도 없습니다).

---

## 3. 파이프라인 설계

### 3.1 4단 구조

```
[Layer 0] PR CI                    [Layer 1] Release Build         [Layer 2] Publish(첨부)    [Layer 3] Promote
ci.yml                             mac-build / linux-build /       릴리스 자산 + 피드 yml      beta → stable
(PR·push main)                     windows-build (dispatch)         (사람이 릴리스 생성 후)
      │                                    │                            │                    │
      └─ 게이트: lint/typecheck/test/e2e    └─ 게이트: 서명·아티팩트 검증  └─ 게이트: 피드 정합성   └─ forward-only
```

- **Layer 0은 PR 검증만** 하고 산출물을 만들지 않습니다(릴리스 산출물이 PR에서 나오면 안 됩니다).
- **Layer 1은 빌드 + 서명**까지. publish는 하지 않음(`--publish never`).
- **Layer 2는 빌드 산출물을 릴리스·피드에 올리는 단계.** provider가 `github`면 릴리스 자산이 곧 피드이므로 릴리스에 첨부하면 끝나지만, `generic`/`s3`면 **피드 yml 파일을 별도 서버에 올리는 작업**이 추가됩니다.
- **릴리스(태그) 생성 자체는 사람이 승인한 뒤 수동으로 하고, 워크플로는 "첨부"만 역할을 갖습니다** — 업스트림 방식입니다(§3.3-5).
- **Layer 3은 beta → stable 승격.** 되돌리지 않는 방향(forward-only)이며, `scripts/update-feed-utils.cjs`의 가드를 그대로 씁니다.

### 3.2 워크플로 목록 (이 저장소에 만들 것)

| 워크플로 | 출처 | 상태 | 비고 |
|---|---|---|---|
| `ci.yml` | 업스트림 `main` **이식** | 검증 job 2개(`test`·`e2e`) | secrets 0건. v0.12.11 스크립트 존재 확인됨(§2.1) |
| `mac-build.yml` | 업스트림 `main` **이식 + 수정** | arm64(+선택 x64) | IeumOffice 하드코딩 `:128`·`:135`·`:143`·`:156`·`:157`·`:183`-`:184`, Drive 비밀값 `:93`-`:94`·`:104`-`:105`·`:110`, `CSC_IDENTITY_AUTO_DISCOVERY:'false'` `:46` |
| `linux-build.yml` | 업스트림 `main` **이식 + 수정** | AppImage/deb/rpm | ieumoffice 하드코딩 `:150`·`:152`·`:155`-`:157`·`:163`·`:179`, Drive 비밀값 `:107`-`:108`·`:128`-`:129`·`:134` |
| `windows-build.yml` | 업스트림 `main` **이식 + 수정** | x64(선택 arm64) | IeumOffice 하드코딩 `:129`·`:133`·`:137`·`:143`·`:153`·`:172`, Drive 비밀값 `:92`-`:93`·`:107`-`:108`·`:113` |
| `release-publish.yml` (신규) | **신규 작성** | 산출물 → 릴리스·피드 | provider 결정이 선행(§3.5) |
| `promote-stable.yml` (신규) | **신규 작성** | beta → stable | forward-only 가드 재사용 |

> 업스트림 `main` 워크플로의 라인번호는 `pblsketch/openoffice@upstream/main` 기준입니다. 이 저장소에는 워크플로가 없으므로 **이식 시 라인번호가 바뀝니다** — 이식 후 라인번호 기준으로 문서를 갱신합니다.
> `free-models.yml`·`growth.yml`은 배포 파이프라인과 무관하므로 Phase 0 범위 밖입니다(필요 여부는 별도 판단).

### 3.3 각 워크플로의 최소 요구사항

#### `ci.yml` (이식)
- 트리거: `pull_request` + `push: main` + `workflow_dispatch` (업스트림 `ci.yml:10`-`:14`와 동일)
- job: `test`(ubuntu-latest)·`e2e`(ubuntu-22.04 — **24.04는 Electron 렌더러 spawn이 막혀서 22.04 고정**, 업스트림 `ci.yml:170`-`:173` 주석)
- 권한: `contents: read` (`ci.yml:21`)
- **변경 지점**: 업스트림 `main`과 313커밋 차이이므로, 각 `run:` 스텝이 `v0.12.11`에서 그대로 동작하는지 스텝 단위로 확인(특히 `npm run fixtures` 재현 대조와 e2e).
- secrets: **0건** — 이 워크플로는 승인 없이 추가·실행 가능.

#### `mac-build.yml` (이식 + 수정)
- **필수 수정 1 — IeumOffice 하드코딩 제거**: `:128`(`apps/shell/release/$dir/IeumOffice.app`)·`:135`·`:143`·`:156`·`:157`·`:183`-`:184`가 앱 이름·버전 피드 파일명을 하드코딩합니다. 브랜드 값(§2.3)으로 치환해야 하며, **치환 값은 §5 결정 7 확정 전까지 "플레이스홀더"로 두고 실패하도록** 합니다(잘못된 이름으로 릴리스되면 업데이트 경로가 박힙니다).
- **필수 수정 2 — 서명 전환**: `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`(`:46`)는 "키체인에서 인증서를 찾지 말라"는 뜻입니다. Developer ID로 가려면 키체인에 인증서를 **import**하는 단계(또는 자동 탐색 허용)가 추가로 필요합니다 → §5 결정 3.
- **선택**: `GENOFFICE_MAC_X64=1`로 Intel dmg 동시 생성(업스트림 `electron-builder.cjs:33`-`:38` 주석: x64/arm64 동시 배포용).
- **게이트(설계)**: notarize 성공 여부, dmg 서명 검증, `*.app` bundle ID가 결정된 `appId`와 일치하는지, 산출 파일명이 결정된 slug와 일치하는지.

#### `linux-build.yml` (이식 + 수정)
- ieumoffice 하드코딩 `:150`·`:152`·`:155`-`:157`·`:163`·`:179` 제거(경로·패키지명·deb/rpm 파일명).
- deb 의존성 확인(`:163`)·설치 후 headless export 스모크(`:255`-`:261`)는 그대로 활용 가능.
- linux는 **패키지 서명(DEB/RPM/GPG)이 없습니다** — 업스트림은 `*.sha256` 체크섬 파일만 생성합니다(`linux-build.yml:303`·`:343`·`:372`). 무결성 검증은 체크섬 수준뿐이라 MDM 배포 제약은 §5 결정에 명시합니다.

#### `windows-build.yml` (이식 + 수정)
- IeumOffice 하드코딩 `:129`·`:133`·`:137`·`:143`·`:153`·`:172` 제거.
- **서명 단계 추가(신규)**: `GENOFFICE_WIN_SIGN_MODE`를 `production`(또는 `test`)으로 넘기고, **`scripts/win-sign.cjs`를 먼저 작성**해야 합니다(§2.5). **이 스크립트가 없으면 이 워크플로는 반드시 실패해야 합니다** — "서명 없이 통과"는 §2.5 주석이 경고한 그대로 "installer는 서명됐지만 child process가 죽는" 상황을 재현합니다.
- **extraResources 서명**: `xlsx-sidecar.exe`·`win-ocr.exe`·`win-quicklook.exe`를 **패키징 전에** 서명해야 합니다. 워크플로가 서명→electron-builder가 패키징하는 순서.
- `latest.yml`의 `path:`가 설치 파일명과 일치하는지 검사(업스트림 `:143`)는 그대로 씁니다.
- **선택**: `GENOFFICE_WIN_ARM64=1`(업스트림 `electron-builder.cjs:46`·`:50`-`:52`) — arm64 는 7-Zip BCJ 필터가 필요(`ELECTRON_BUILDER_7Z_FILTER=BCJ`). x64와 arm64는 **사이드카 target 경로가 다르므로** 별도 cargo 빌드가 필요합니다(`:54` `winSidecarTarget`).

#### 빌드 워크플로 안의 publish — 업스트림 방식 [직접확인]

업스트림 빌드 워크플로는 **자체적으로 릴리스에 첨부**합니다. 릴리스는 미리 만들어져 있어야 합니다.

- 업스트림 `mac-build.yml:264`-`:270` · `linux-build.yml:367`-`:373` · `windows-build.yml:205`-`:210`가 동일 패턴:
  1. `TAG` 형식 검증(`^v[0-9]+\.[0-9]+\.[0-9]+(-[...])?$`, 아니면 exit 1)
  2. `gh release view "$TAG"` — 릴리스가 없으면 `"no release $TAG: publish it first"`로 exit 1
  3. **버전 대조** — `[ "v$built" = "$TAG" ] || { echo "built $built, but the release is $TAG"; exit 1; }` → **빌드 버전과 릴리스 태그가 다르면 실패** (게이트로 재사용)
  4. `gh release upload "$TAG" <자산> $feed --clobber` — 피드 yml까지 함께 첨부
- **→ 릴리스(태그) 생성과 빌드·첨부를 분리**하는 것이 이 구조의 핵심입니다. 사람이 승인한 태그로 릴리스를 먼저 만들고, 각 플랫폼 빌드가 그 릴리스에 첨부합니다. **태그 push만으로 릴리스가 자동 생성되도록 하지 않습니다.**
- 리허설 자산은 **삭제하지 않고 `--clobber`로 교체**하는 규칙을 유지합니다(유비온 릴리스 운영 규칙과 동일).

#### `release-publish.yml` (신규)
- **필요 조건**: provider가 `github`가 아닌 경우(C안)에는 피드 yml을 별도 서버에 올려야 하므로 이 워크플로가 필수입니다. A안(공개 GitHub 릴리스)에서는 빌드 워크플로의 `gh release upload`로 충분하고, 이 워크플로는 **피드 검증 + promote** 역할로 축소됩니다.
- 입력: 빌드 워크플로의 산출물(artifact) + 태그.
- 처리: 피드 yml 생성(`latest.yml`/`latest-mac.yml`/`latest-linux.yml`/`beta*.yml`) → 업로드 → 피드 검증(버전·파일명·해시 일치).
- **provider별 분기** (§3.5).

#### `promote-stable.yml` (신규)
- beta 릴리스의 산출물을 stable 피드로 승격. **forward-only**(되돌림 없음)를 `scripts/update-feed-utils.cjs`의 가드로 강제.

### 3.4 산출물 매트릭스

| 대상 | 파일 | 서명 | 피드 파일 |
|---|---|---|---|
| mac arm64 | `.dmg` + `.zip` | Developer ID + notarize (§2.4) | `latest-mac.yml` |
| mac x64 | `.dmg` + `.zip` | 동일 | (별도 아키텍처 표기 확인 필요) |
| linux x64 | `.AppImage`·`.deb`·`.rpm` | 없음 | `latest-linux.yml` |
| windows x64 | `-Setup-<ver>.exe` | code signing + **extraResources 서명** | `latest.yml` |
| windows arm64 | `-Setup-<ver>.exe` | 동일 | (별도) |

### 3.5 피드(publish) 구조 — 3안

| 안 | 구성 | 장점 | 위험·조건 |
|---|---|---|---|
| **A. public GitHub 릴리스 저장소** | `provider: 'github'`, 별도 public 저장소 | 토큰 불필요(`updater.ts:995`-`:997` 전제 유지). 피드 파일 자동 생성 | **공개 전환 = 저장소 설정 변경 = ✓ 승인 대상.** 개발 중에도 릴리스 노트·브랜드가 노출 |
| **B. private GitHub + 토큰** | `provider: 'github'` + 토큰 | 파일 분리 | **electron-updater의 github provider는 public 전제**(§2.3) → 토큰을 클라이언트에 배포해야 함 = 시크릿 배포 문제. **조용히 실패**(업데이트 실패를 사용자가 모름) |
| **C. private 피드 서버(S3/generic)** | `provider: 's3'` 또는 `'generic'` + 자체 URL | 소스 저장소와 완전 분리, 공개 범위 통제 | 피드 URL이 앱에 박힘 → **URL 변경 = 기존 사용자 업데이트 경로 차단**. 자체 서버 운영 필요(이 저장소 밖) |

→ **§5 결정 4에서 A/B/C 중 하나를 확정해야 Layer 2가 구현됩니다.** 기본값 제안은 **A**(공개 릴리스 저장소)이지만, 공개 전환이 계획서 §6.6.1의 공개 전 점검 5개와 연결되므로 **사람 결정을 기다립니다.** [추정]

**provider가 `github`가 아닌 경우 주의**: `electron-builder.cjs:1003`-`:1005`를 덮어쓰는 것은 훅 1개입니다. 훅 예산 0개를 지키려면 **overlay가 아니라 config 파일 인자(`-c.publish=…`) 또는 전용 overlay 스크립트로 분리**해야 하며, 어느 쪽이든 훅 대장(`PATCHES.md` 계열)에 등록해야 합니다. → §5 결정 9.

### 3.6 시크릿 목록 (이름만 · 값 미기재 · 등록은 승인 후)

| 시크릿 이름 | 용도 | 필요한가 | 상태 |
|---|---|---|---|
| `APPLE_ID` | 공증용 Apple ID | mac Developer ID 도입 시 **필요** | 미등록 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 공증용 앱 전용 비밀번호 | 동일 | 미등록 |
| `APPLE_TEAM_ID` | 공증용 Team ID | 동일 | 미등록 |
| `APPLE_CERTIFICATE_P12_BASE64` | Developer ID 인증서(임포트 방식) | 방식 선택 시 필요 | 미등록 |
| `APPLE_CERTIFICATE_PASSWORD` | 위 P12 비밀번호 | 동일 | 미등록 |
| `WIN_SIGN_CERT_P12_BASE64` | Windows 코드서명 인증서 | Windows 서명 시 필요 | 미등록 |
| `WIN_SIGN_CERT_PASSWORD` | 위 P12 비밀번호 | 동일 | 미등록 |
| `GENOFFICE_GOOGLE_CLIENT_ID` | Drive 클라이언트 | §5 결정 5 | 미등록 |
| `GENOFFICE_GOOGLE_CLIENT_SECRET` | Drive 클라이언트 | 동일 | 미등록 |
| `GITHUB_TOKEN` | 릴리스 생성(저장소 기본값) | github provider 시 필요 | 기본 제공 |

- `APPLE_KEYCHAIN_PROFILE`은 **로컬 전용**입니다(`notarize-dmg.js:17` 로컬 키체인 프로필). CI 시크릿으로 등록하지 않습니다.
- 업스트림 워크플로는 Drive 비밀값이 **설정되어 있지 않으면 빌드가 경고 후 Drive 없이 배포**하도록 되어 있습니다(업스트림 `mac-build.yml:110`·`windows-build.yml:113`·`linux-build.yml:134`). → §5 결정 5에서 Drive를 빼면 이 비밀값 2종이 불필요해집니다.
- **시크릿 등록은 저장소 설정 변경이며 승인 전 금지입니다.** 위 표는 **이름만으로 결정하기 위한 목록**입니다.

### 3.7 배포 순서 — 서버 선배포 → beta → stable

`docs/plan.md` §7-8 위험 8의 "자동 업데이트와 서버 계약의 호환성"에 대한 운영 답입니다.

1. **서버 선배포** — 서버가 기존(구버전) 클라이언트 계약을 유지한 채 먼저 배포. 업데이트를 켜기 전에 서버를 준비해야 구버전 클라이언트가 깨지지 않습니다.
2. **beta 채널 검증** — beta 피드로만 배포. 업데이트가 실제로 동작하는지(설치·교체·재시작), 서버 계약 불일치가 없는지 확인.
3. **stable 승격** — beta 검증 통과 후 stable로 승격.
4. **롤백** — 업데이트는 **되돌릴 수 없습니다**(사용자가 이미 받은 버전은 남음). 그래서 롤백의 실질은 "다음 릴리스로 수리를 배포"입니다. 서버 쪽 롤백은 별도(§7).

→ **따라서 서버 선배포와 릴리스는 한 사람이 순서를 통제해야 합니다.** 자동 업데이트를 켜는 시점이 서버 배포보다 뒤여야 합니다.

### 3.8 롤백

| 대상 | 롤백 방법 | 비고 |
|---|---|---|
| 릴리스(애플리케이션) | 이전 태그로 재빌드·재배포 (버전 낮추기는 불가 — forward-only) | 산출물 재현성 검증 필요(§8) |
| 업데이트 피드 | `latest.yml`을 이전 버전으로 되돌리는 것은 **사용자가 이미 받은 업데이트를 되돌리지 못함.** 실질적 롤백 = 새 패치 릴리스 | 프로모션 가드와 정합 |
| mac 서명 | Developer ID 인증서 취소/회수 시 기존 빌드가 무효 → 새 서명자 필요 → **서명자 종속**(`docs/plan.md` §8.1-14) | 키 교체 경로를 초기 설계에 포함 |
| Windows 서명 | 동일(서명자 종속) | |
| 서버 | `docs/plan.md` §6.6.5 및 서버 런북 참조(유비온 서버 문서는 이 저장소 대상이 아님) | 이 저장소 밖 |

### 3.9 훅 예산과 게이트

- 이 저장소의 목표는 **업스트림 훅 0개**입니다(`docs/plan.md` §6.6.1-5, §8.1-17). 현재 `electron-builder.cjs`의 ad-hoc 3줄(`:986`-`:988`)과 `dmg.sign`(`:989`)은 업스트림 **원본 파일**의 값이라 훅이 아닙니다. → **Developer ID 전환은 "훅 추가"가 아니라 "훅 0개 상태에서 값 교체"로 가능**하며, 훅 예산을 쓰지 않습니다.
- `publish` provider 교체(§3.5)만 훅 1개 후보입니다. → 훅이 필요하면 대장에 파일·줄·목적·되돌리는법·회차를 기록하는 **새 저장소용 대장 구조**를 함께 만들어야 합니다(`docs/plan.md` §6.6.1·§8.1-17: 유비온의 `check-patches`는 `IGNORED_PREFIXES`가 회사 계층 경로를 하드코딩하므로 그대로 쓸 수 없음 → **checker 스크립트 자체가 훅 1개**).
- **게이트 목록(릴리스 전)**: ① 서명 검증 ② 피드 yml 정합성(버전·파일명·해시) ③ extraResources 존재·서명 확인 ④ **산출물 바이너리 문자열 스캔**(키·사내 엔드포인트·개발자 경로 잔존 — 공개 전환 게이트, `docs/plan.md` §6.6.1-2) ⑤ 대장/훅 상한 검사.

---

## 4. 실행 순서 (Phase 0)

| # | 작업 | 선행 조건 | 산출물 |
|---|---|---|---|
| 1 | §5 결정 1·2·3·4 확정 (사람) | — | 결정 기록 |
| 2 | `ci.yml` 이식 + v0.12.11 대조 | — | `.github/workflows/ci.yml` |
| 3 | 브랜드 3축 확정 후 빌드 워크플로 3종 이식·수정 | 결정 7 | `mac-build`·`linux-build`·`windows-build` |
| 4 | `scripts/win-sign.cjs` 작성 | 결정 1·2 | `scripts/win-sign.cjs` |
| 5 | `release-publish.yml`·`promote-stable.yml` 작성 | 결정 4 | 워크플로 2개 |
| 6 | 시크릿 등록 | **승인 후** | 저장소 시크릿 |
| 7 | **절차 문서 갱신** — `docs/releasing.ko.md`(정본)·`.claude/skills/release-ieumoffice/SKILL.md`·관련 결정 기록 | 1-4 | 문서 2종 + 결정 기록 |
| 8 | beta 릴리스 1회 + 업데이트 실검증 | 1-7 | beta 태그·릴리스 |
| 9 | 서버 선배포 → stable 승격 | 서버 준비 | stable 릴리스 |

**1번(사람 결정)이 끝나야 3·4·5번의 형태가 확정됩니다.** 그 전까지는 워크플로 이식(2번)만 진행해도 무방합니다.

---

## 5. 사람이 결정해야 하는 항목

| # | 결정 | 근거 | 미정이면 |
|---|---|---|---|
| 1 | **Windows 서명 방식** — `scripts/win-sign.cjs` 직접 작성 + CSC_LINK, 또는 KeyLocker 등 | `electron-builder.cjs:958`·`:963`·`:970`, 파일 부재 | Windows production 릴리스 불가 |
| 2 | **Windows 코드서명 인증서 종류·보유 주체·갱신 절차** | §2.5, §8.1-14 | 서명자 종속 리스크 |
| 3 | **mac Developer ID 보유 주체 + 공증 자격 + CI 인증서 임포트 방식** (p12 import vs keychain) | `electron-builder.cjs:986`-`:989`, `notarize-dmg.js:14`-`:23` | mac MDM 배포 불가 |
| 4 | **릴리스 피드 저장소 공개 여부 + provider(A/B/C)** | §3.5, `electron-builder.cjs:995`-`:1005` | 자동 업데이트 전부 불가 |
| 5 | **Google Drive 클라이언트 포함 여부** | 업스트림 워크플로 `mac-build.yml:93`-`:94` 등 | 비밀값 2종 필요 여부 |
| 6 | **win-ocr.exe·win-quicklook.exe 유지 여부** | `electron-builder.cjs:110`-`:111`·`:117`·`:128` | 빌드 대상·서명 대상 |
| 7 | **제품명 슬러그 확정** (산출 파일명·앱 ID·핸들러 3축) | §2.3, `docs/plan.md` §8.1-8/10 | 첫 릴리스 후 되돌릴 수 없음 |
| 8 | **mac hardened runtime entitlement 추가 필요 여부** (실기 확인) | `entitlements.mac.plist` 2개뿐 | 공증·실행 실패 |
| 9 | **`publish` provider 덮어쓰기를 훅 1개로 쓸지, config 인자로 분리할지** | §3.5, §3.9 | 훅 예산 0 유지 여부 |
| 10 | **enterprise ring 운영 여부** (stable/beta 2채널로 부족한지) | `updater.ts:747` `CHANNEL_FEED` | 채널 설계 확정 |
| 11 | **mac 자체 업데이트 스테이징 경로(결정 0097) 유지 여부** | `mac-update.ts:154`, `updater.ts:955`·`:960` | 서명 후에도 그대로 써도 동작함(무해) |

---

## 6. 하지 않는 것

- 서버 설정 변경, 저장소 공개 전환, 시크릿 등록, Actions 설정 변경 — **모두 승인 전 금지**.
- 저장소 설정 변경 중 **저장소 공개 전환은 별도 ✓ 승인**입니다(`docs/plan.md` §8.1-18).
- 이 PR은 **문서만**입니다. 코드·워크플로·시크릿은 포함하지 않습니다.
- 업스트림 워크플로를 "그대로 가져오기" — 업스트림 `main`과 `v0.12.11`은 313커밋 차이이므로 **대조 후에만** 가져옵니다.

---

## 7. 서버 운영 관점 (참고 · 이 저장소 밖)

- 서버는 `bot`·`gateway`·nginx로 구성되며 **이 저장소 밖**에 있습니다(`docs/plan.md` §5.1).
- 피드를 자체 서버(`generic`/`s3`)에 두는 안(C)을 고르면, **피드 서버의 가용성이 업데이트 가용성이 됩니다**. nginx·인증서·장애 대응이 이 저장소의 릴리스와 직결됩니다.
- 업데이트를 켜기 전(§3.7 1단계)에 서버가 구버전 계약을 유지하는지 확인해야 합니다.

---

## 8. 열린 질문 · 검증 못 한 것

- **[미확인]** 업스트림 `main`의 워크플로가 `v0.12.11` 코드에서 그대로 동작하는지는 **스텝 단위 대조가 필요**합니다. 이 문서에서는 스크립트 존재 여부만 확인했습니다(§2.1).
- **[미확인]** `notarize-dmg.js`가 CI용으로 `APPLE_ID` 3종 방식만 지원하는 상황에서, **Developer ID 인증서를 CI에 어떻게 임포트할지**(p12 → keychain → keychain 프로필)는 실행 순서와 credential 방식에 따라 달라집니다. §5 결정 3의 세부 사항.
- **[미확인]** `scripts/update-feed-utils.cjs`의 주석이 참조하는 `mac-release-upload.cjs`·`promote-stable.cjs`가 업스트림 어디에도 없습니다. 피드 업로드·promote는 **신규 작성 필요**입니다.
- **[미확인]** 빌드 산출물의 재현성(같은 소스·툴체인 → 같은 해시)은 이 저장소에서 아직 측정하지 않았습니다. 해시는 항상 직접 계산해 기록해야 합니다.
- **[보고]** mac 자체 업데이트가 ad-hoc 서명에서도 동작한다는 근거는 `docs/plan.md` §6.6.2(devops m292 정정, research 재확인)에 있습니다.

---

## 9. 이 문서와 계획서의 관계

- `docs/plan.md` §6.6.3 `:436`과 §8.1-14 `:530`에 **`scripts/win-sign.cjs` 선행 조건 한 줄이 이미 반영**되어 있습니다(계획서 PR #1 머지본). → **이 PR은 `docs/plan.md`를 수정하지 않습니다.** 계획서 후속 정리와 충돌하지 않도록, 선행 조건은 이 문서 §2.5·§3.3에 자세히 기술합니다.
- 이 문서가 다루지 않은 계획서 항목(브랜드 3축 결정 시점·공개 전환 점검 5개·multitenancy·IdP)은 `docs/plan.md`에 그대로 유효합니다.
- **릴리스 절차의 정본은 여전히 `docs/releasing.ko.md`입니다.** 이 문서는 "무엇을 어디에 만들 것인가"(구조·근거·결정 필요 항목)만 다룹니다. 절차·승인·판단 기준은 정본 문서와 스킬이 그대로 governs하며, 서명 도입 등 절차 자체가 바뀌는 경우에만 그쪽을 갱신합니다(§4-7).
