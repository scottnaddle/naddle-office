# 일반 기업용 오피스 앱 — 조사·계획서

> **상태: 조사 완료 · 계획서 v1.** @api·@devops 검토 반영, @qa가 @web 대신 임시 수행한 클라이언트 조사 반영.  대상 리포 `scottnaddle/naddle-office`(private, Apache-2.0, `main`) — m262 지시대로 `docs/plan.md`로 PR(base `main`, 브랜치 `plan/enterprise-edition-v0`) 제출. **머지 금지.**
> 기준 코드: `scottnaddle/ubion-office` main `01b4efe4` (2026-11-09 확인) · 조사 2026-11-09 14:0x KST · 읽기 전용(코드·서버·설치·저장소 설정 변경 없음)
> 표기: **[직접확인]** 이 문서를 쓴 조사자가 직접 확인 · **[보고]** 다른 담당자 보고 · **[추정]** 규모·기간은 추정 · **[미확인]** 확인되지 않음

---

## 0. 한 줄 요약

유비온오피스는 **이음오피스(IeumOffice, Apache-2.0) 위에 얹은 "회사 오버레이"**다. 일반 기업용 앱은 (1) 새 저장소, (2) 업스트림 추종 구조를 **공통 코어 + 제품 오버레이**로 바꾸고, (3) "하드코딩된 정책"을 **런타임 테넌트 설정**으로 바꾸는 것이 핵심 작업이다. [직접확인] 코드의 **유비온 고유 문자열 374건 중 285건(76%)은 식별자 이름**이고, URL 리터럴은 **2건뿐**이다 — 즉 대부분은 이름·구조 문제이지 동작 로직 문제가 아니다. [직접확인] **주입 seam 4개(`DaouClient`·`OfficeBrokerClient`·`RelayClient`·`WikiApiClient`)가 이미 새 기능 3종(계정·지식·모델)에 대응한다** — 설정 런타임화만 해결하면 어댑터를 붙이는 방식으로 일반화가 진행되고 대형 재작성은 필요 없다(§3.3.1). [보고] 서버 쪽도 api가 같은 4개 축의 인터페이스(`IdentityProvider`·`KnowledgeSource`·`ModelGateway` 등)를 제시했고, 유비온 전용을 `adapters/ubion`으로 격리해 나중에 얹도록 설계했다(§5.1).
[직접확인] **배포 관점에서 mac 자체 업데이트는 ad-hoc 서명에서도 동작한다**(devops m292 정정 반영). 이전 판이 인용한 업스트림 주석은 현재 코드와 어긋났고, 실제 구현(`mac-update.ts`)은 Squirrel.Mac이 아닌 자체 스테이징 경로이며 차단 사유는 파일시스템 3조건이다(§6.6.2). **MVP 4~6주 [추정]** — 기간은 전부 추정이며 아래 §6 로드맵에만 있고, 근거는 §3·§6.5의 코드 확인 결과다.

§3.7의 업스트림 훅 **정확히 21개**는 단정 숫자가 아니라 아래 명령으로 재현된다 [직접확인]: `git diff --name-only --diff-filter=M b8cb8564b...HEAD` 에서 `company/`·`packages/company-policy/`·`packages/ubion-*/`·`docs/` 를 제외하고 `package-lock.json`(generated)도 제외하면 21개가 나온다. §3.1의 374건은 `grep -rn 'ubion\|Ubion\|유비온\|coco\|Daou\|daou' --include='*.ts' --include='*.tsx' packages/company-policy/src packages/ubion-staff-login/src packages/ubion-wiki/src packages/ubion-video/src | grep -v test` 의 출현 라인 수다.

---

## 1. 목표 · 비목표

### 목표
- 이음오피스 기반, **어떤 기업도 자기 환경(인증·지식·템플릿·모델)에 맞춰 운영**할 수 있는 제품.
- 기능 3종: 내부 지식관리 · 계정관리 · 문서 템플릿 관리.
- 유비온오피스와 **같은 업스트림을 함께 추종**하되, 업그레이드 비용이 이중으로 안 나가야 한다.

### 제품 결정 (scott-air15, 2026-11-09)

| # | 결정 | 계획서에 반영되는 곳 |
|---|---|---|
| 1 | **유비온과 별개 프로젝트.** 다만 이 앱이 나중에 유비온에도 적용될 만큼 유연해야 함 | §4 구조 — 코어+오버레이 + 테넌트 설정. §9 관계 |
| 2 | **고객을 특정하지 않고 오픈소스로 배포** | §1 비목표(유비온 전용 하드코딩 제거), §10 라이선스(Apache-2.0 파생·NOTICE 동봉), §6.6.1 공개 전 점검 |
| 3 | **자체 설치가 어려운 경우 우리가 제공하는 클라우드 환경을 함께** | §5 배포 모델 — self-host(A) + 제공형 클라우드 병행 |
| 4 | **제품명 '나들오피스'** | §8.1-8 — 상표·도메인 확인 필요, 리포명 변경 계획 |
| 5 | **자동 업데이트 피드 운영 필요** | §6.6.3·§6.6.4 — 서명·채널·피드 호스팅·롤백 |
| 6 | **새 리포는 처음 코드를 어떻게 채울지 미정** | §8.1-11 — 아래 §4.5 선택지 |

[직접확인] 결정 2는 **리포를 private으로 두는 현재 상태와 상충**한다 — `scottnaddle/naddle-office`는 private이고, 공개 전환은 저장소 설정 변경이라 ✓ 승인 대상이다(§6.6.1·§8.1).

### 비목표 (이번 단계)
- 코드·서버·설치·저장소 설정 변경 없음 (조사·계획만).
- 멀티테넌트 SaaS화 (MVP에서는 기업별 단독 설치 권장 — §5).
- Windows 서명, 실기 설치 스모크 (별도 과제 — api 보고).
- 기존 유비온오피스 동작 변경.
- **공개 배포 준비 자체** (결정 2의 오픈소스 배포는 계획 단계까지만 — §6.6.1의 공개 전 점검 항목이 선행).

---

## 2. 사용자 · 시나리오

| 시나리오 | 필요 기능 | 현재 코드 근거 |
|---|---|---|
| 임직원이 사내 wiki에서 문서 검색 | 지식관리 | `packages/ubion-wiki/src/` 11파일 (read-only bridge) |
| 임직원이 SSO로 로그인 | 계정관리 | **현재 다우(Daou)/coco 고정** — OIDC/SAML/LDAP 없음 (api m253) |
| 매니저가 사내 템플릿을 배포 | 템플릿 관리 | `company/templates/` — 빌드 내장, 서버 API 없음 (api m253) |
| 임직원이 사내 모델 사용 | 계정관리 | LiteLLM per-user virtual key (`packages/company-policy/src/auth/litellm-key.ts`) |

[직접확인] **현재 계정 모델은 다우(Daou) 1:1 코드로 고정** — `packages/company-policy/src/auth/daou-dm-auth.ts`(83줄), `schema.ts:53-54` `daouServerUrl`. 일반 기업용 SSO로 가려면 이 계층 전체가 교체 대상이다.

---

## 3. 코드 경계: 유비온 전용 vs 일반화 가능

### 3.1 규모 측정 [직접확인]

`packages/company-policy` · `packages/ubion-staff-login` · `packages/ubion-wiki` · `packages/ubion-video` 의 `src/`에서 `ubion|Ubion|유비온|coco|Daou|daou` 출현 라인 **374건**을 분류한 결과:

| 분류 | 라인 수 | 비율 | 의미 |
|---|---:|---:|---|
| **식별자 이름만** (`UbionProfile`, `ubionVideoOpen`, IPC 채널명 등) | 285 | 76% | 이름 변경. 동작 불변 |
| 다우(Daou)/coco 참조 | 87 | 23% | 실제 통합 지점 (아래 §3.3) |
| **URL 리터럴** | **2** | **0.5%** | 아래 2줄뿐 |

패키지별:

| 패키지 | src 파일 | 라인 | 유비온/다우(Daou) 출현 |
|---|---:|---:|---:|
| `packages/company-policy` | 58 | 9,754 | 257 |
| `packages/ubion-video` | 39 | 8,490 | 78 |
| `packages/ubion-wiki` | 11 | 1,260 | 25 |
| `packages/ubion-staff-login` | 4 | 251 | 14 |

### 3.2 하드코딩된 URL — **2건뿐, 둘 다 이미 정책으로 덮어써짐** [직접확인]

| 위치 | 값 | 이미 존재하는 우회 경로 |
|---|---|---|
| `packages/company-policy/src/wiki.ts:6` | `https://lms.ubion.global/api/wiki` | `wiki.ts:38,44` → `envBase(env) ?? policy.baseUrl ?? DEFAULT` (정책이 우선) |
| `packages/ubion-video/src/themes/loader.ts:38` | `https://bot.ubion.global/video-themes/v1/manifest.json` | `loader.ts:86` → env로 base 교체 가능 |

**해석**: 엔드포인트 하드코딩 문제는 이미 해결돼 있다. 문제는 **정책이 빌드 시점에 고정된다는 것**이다 (아래 §3.4).

### 3.3 실제 통합 지점 (일반화가 필요한 진짜 경계) [직접확인]

| 지점 | 파일:줄 | 일반화 방향 |
|---|---|---|
| 다우(Daou) 웹 로그인 + DM 코드 | `packages/company-policy/src/auth/daou-dm-auth.ts`(83줄) | `DaouClient` 인터페이스(`:17-21`: `userSeq()`, `readChallengeCode()`)가 이미 **주입 지점** — 이 부분만 IdP별로 교체 |
| 다우(Daou) 서버 URL | `packages/company-policy/src/schema.ts:53-54,136,141` | 정책 필드. 값 교체는 쉬움, **프로토콜이 coco 전용** |
| 로그인 세션 파티션 | `packages/company-policy/src/main.ts:61,517-528` | `OFFICE_DAOU_PARTITION` — IdP별 쿠키 파티션 개념으로 일반화 |
| 위키 grant 계약 | `packages/company-policy/src/auth/wiki-session-grant.ts`(109줄) | `wss1` 3세그먼트 토큰(`:15-18`) — **지식 소스별 계약이 다를 수 있음** |
| 키체인 항목 | `packages/company-policy/src/auth/key-store.ts:44-45` | `ubion.litellm.key` / `ubion.litellm.expiresAt` — 이름만 |
| 정책 endpoint **5종** | `company/policy/company.policy.json`의 `endpoint.baseUrl`(`:11`)·`video.baseUrl`(`:82`)·`wiki.baseUrl`(`:86`)·`staffLogin.baseUrl`(`:95`)·`staffLogin.daouServerUrl`(`:96`) | `https://llm.ubion.global/v1` · `https://lms.ubion.global/video-api` · `https://lms.ubion.global/api/wiki` · `https://bot.ubion.global` · `https://coco.ubion.co.kr` — 전부 공개 도메인이며 IP·토큰류 없음 |

### 3.3.1 이미 존재하는 주입 seam — 어댑터 후보 목록 [직접확인]

`grep -rn "export interface .*Client|export interface .*Adapter|export interface .*Provider"` 결과, 호출자가 주입하는 형태의 인터페이스만 추렸다. **메서드 집합이 작아 이미 분리 가능한 지점**이다.

| seam | 파일:줄 | 메서드 | 일반화 방향 |
|---|---|---|---|
| `DaouClient` | `packages/company-policy/src/auth/daou-dm-auth.ts:18` | `userSeq()` · `readChallengeCode()` | **IdP 후보 1번** — OIDC/SAML 구현체가 이 2개만 제공하면 됨 |
| `OfficeBrokerClient` | `packages/company-policy/src/auth/office-broker-client.ts:134` | `dmChallenge()` · `dmToken()` · `refresh()` · `logout()` · `me()` | 인증 제공자 추상화의 중심 계약. `me()`가 프로필·역할을 반환 → **IdP 중립 프로필 모델의 정의 지점** |
| `RelayClient` | `packages/company-policy/src/auth/relay-client.ts:97` | `challenge()` · `token()` · `litellmKey()` · `exchangeTeamsHandoff()` | 모델 게이트웨이(LiteLLM) 추상화 지점. `exchangeTeamsHandoff`는 팀 온보딩 — 일반 제품의 계정관리에 그대로 대응 |
| `WikiApiClient` | `packages/ubion-wiki/src/client.ts:41` | `baseUrl()` · `getSession()` | **지식 소스 어댑터 후보 1번** — Confluence/SharePoint/Notion 등 각 1개 구현 |
| `VideoApiClient` | `packages/ubion-video/src/client.ts:80` | `createJob()` · `getJob()` · `cancelJob()` · `getResult()` · `streamEvents()` | 영상 렌더 서비스 계약. 일반 제품에는 선택 기능 |
| `RenderClient` | `packages/ubion-video/src/render-client.ts:169` | `validate()` · `createRender()` · `getJob()` · `cancelJob()` · `getArtifacts()` · `previewTts()` | 로컬 렌더 경로. 제품 선택 기능 |

**[직접확인] 확인 명령**: `grep -rn "export interface .*Client\|export interface .*Adapter\|export interface .*Provider" --include="*.ts" packages/company-policy/src packages/ubion-staff-login/src packages/ubion-wiki/src packages/ubion-video/src | grep -v test`

**해석** [추정]: **주입 seam은 이미 충분하다.** `DaouClient`·`OfficeBrokerClient`·`RelayClient`·`WikiApiClient` 4개가 새 기능 3종(계정·지식·모델)에 정확히 대응한다. 즉 §3.4의 설정 런타임화만 해결하면 **어댑터 구현을 붙이는 방식**으로 일반화가 진행될 수 있고, 대형 재작성은 필요 없다. 반면 `MediaAdapter`(`packages/company-policy/src/media.ts:11`)는 `id`·`kind` 2필드짜리 데이터 타입이라 seam이 아니라 **값 객체**다 — 이번 범위 밖.

### 3.4 ★ 가장 중요한 구조적 발견 — 정책은 **빌드 시점 상수** [직접확인]

[직접확인] 확인 명령: `grep -rn "import .* from '.*\.json'" --include="*.ts" packages/company-policy/src packages/ubion-wiki/src packages/ubion-video/src packages/ubion-staff-login/src | grep -v test` → **정적 JSON import 5건**:

```
packages/company-policy/src/index.ts:1          import policy      from '../../../company/policy/company.policy.json'
packages/company-policy/src/store.ts:1          import rawPolicy   from '../../../company/policy/company.policy.json'
packages/company-policy/src/brand.ts:1           import brand       from '../../../company/brand.json'
packages/company-policy/src/auth/config.ts:1    import rawAuthConfig from '../../../../company/auth.config.json'
packages/ubion-video/src/flow/templates.ts:14  import bundled     from '../../../../company/video-themes/manifest.json'
```

**따라서 정적 import는 정책 3건만이 아니라 5건**이고, `auth.config.json`·`video-themes/manifest.json`도 bake된다.

정적 import → JSON이 **번들에 bake**된다. 런타임에 테넌트 설정을 갈아끼울 방법이 없다.

이미 런타임 우회 경로는 **2개만** 존재한다 [직접확인]:
- `packages/company-policy/src/auth/wiki-env-file.ts:19-20,98` — `UBION_WIKI_TOKEN` / `UBION_WIKI_USER_SEQ` / `UBION_WIKI_ENV_FILE` (`~/.config/ubion/wiki.env`)
- `packages/company-policy/src/auth/env-key-file.ts` — LiteLLM 키 env 파일

**해석**: 이 2개 패턴이 "테넌트 런타임 설정"의 선례다. 일반 제품의 핵심 작업은 `company.policy.json` 정적 import를 **테넌트 설정 로더(로컬 파일 + 관리자 배포)**로 바꾸는 것이다. [추정] 이 한 항목이 가장 큰 비용이다.

### 3.5 브랜드 문자열 — 2곳만 실제 하드코딩 [직접확인]

- `packages/company-policy/src/header-profile.tsx:107` — `deptText(profile) ?? '유비온'` (직접 하드코딩)
- `packages/company-policy/src/strings.ts:21,34` — `aboutNotice`: "유비온오피스는 이음오피스를 포크해 개발되었습니다." / "UbionOffice was developed by forking IeumOffice."
- `packages/company-policy/src/header-profile.tsx`의 유비온 출현 **51건 중 46건은 `UbionProfile`·`ubionProfile`·`ubionStaffLoginOpen` 같은 식별자 이름**이다 — 대량 치환으로 처리 가능.

문자열은 이미 `COMPANY_STRINGS`(ko/en)로 중앙화돼 있어 [직접확인] `packages/company-policy/src/strings.ts:8-39` — 다국어·브랜드 교체 지점이 이미 존재한다.

### 3.6 템플릿 — 빌드 내장 [직접확인]

- `packages/company-policy/src/templates/ubion-proposal-global.ts`, `ubion-proposal-koica-pmc.ts` — **유비온 고유 문서 템플릿** (이름·내용 모두 제품 고유)
- `packages/company-policy/src/templates/slide-catalog.generated.ts` — `company/scripts/gen-slide-catalog.mjs`가 `company/templates/slide-catalog/catalog.json` → TS 상수 생성 [직접확인]
- `packages/company-policy/src/templates/gallery-tabs.tsx:55` — `PROPOSAL_PACK_ID = 'ubion-proposal-global'` 하드코딩
- `company/templates/packs/` — 패키지 정의

**해석**: 슬라이드 템플릿 12종(`NOTICE` 기준, 업스트림 저작물)은 **재사용 가능**. `ubion-proposal-*` 2종만 제품 고유 → 일반 제품에서는 테넌트 배포 카탈로그로 대체.

### 3.7 업스트림 훅 21개 — 두 제품이 함께 추종할 때 최대 병목 [직접확인]

`company/PATCHES.md:46` — 업스트림 파일 수정 **상한 21개** (`check-patches`가 22개를 실패시킨다). [직접확인] `git diff --diff-filter=M b8cb8564b...HEAD`의 업스트림 경로 변경 파일은 22개이고 `package-lock.json`(generated)이 제외 대상 → **정확히 21개**. 목록:

**[직접확인] 확인 명령**: `git diff --name-only --diff-filter=M b8cb8564b...HEAD` 에서 `company/`·`packages/company-policy/`·`packages/ubion-*/`·`docs/` 를 제외하고 `package-lock.json`(generated)도 제외하면 **21개**가 나온다.

| 위치 | 개수 | 파일 |
|---|---:|---|
| `apps/shell/` | 7 | `electron-builder.cjs` · `src/main/default-app.ts` · `src/main/index.ts` · `src/main/updater.ts` · `src/renderer/src/Home.tsx` · `src/renderer/src/KbAskPanel.tsx` · `src/renderer/src/SettingsModal.tsx` |
| `packages/ai-provider/src/` | 6 | `image-backend.ts` · `legacy-settings.ts` · `media.ts` · `provider-selection.ts` · `registry.ts` · `search-settings.ts` |
| `packages/ui/src/` | 2 | `AiModelPicker.tsx` · `use-skill-proposals.tsx` |
| `apps/slides/src/renderer/ai/` | 1 | `TemplateGallery.tsx` |
| `packages/cli/src/` | 1 | `names.ts` |
| `packages/electron-utils/src/` | 1 | `user-skills-bridge.ts` |
| `packages/i18n/src/` | 1 | `product.ts` |
| `packages/pipelines/src/slides/templates/` | 1 | `catalog.ts` |
| (루트) | 1 | `package.json` |
| **합계** | **21** | 7+6+2+1+1+1+1+1+1 = **21** ✓

**중요 관찰** [직접확인]: 회사가 기능을 붙이는 방식은 **업스트림 파일에 import 1줄을 심는 패턴**이다 —
```
apps/shell/src/renderer/src/Home.tsx:8-10   import { UbionHeaderBrand, ... } from '@ubion/company-policy/header-profile'
packages/ui/src/use-skill-proposals.tsx:40   import { companyPanelSkills } from '../../ubion-wiki/src/renderer'
apps/shell/src/main/index.ts:112             import { initCompanyMain, initCompanyPolicy } from '@ubion/company-policy/main'
```
즉 **업스트림 훅 21개는 제품 기능이 아니라 "회사 기능의 진입점"**이다. 업스트림 동기화 시 매번 이 21줄을 다시 충돌 해결해야 한다.

**해석**: 두 제품이 같은 업스트림을 따라가려면, 이 21개 훅이 **양쪽 제품에서 동일하게 유지**되거나(공통 코어), **제품별로 갈라져** 충돌 비용이 배수가 된다. → §4 옵션 A/B/C의 결정 요인.

**★ 훅 절감은 기대하지 말 것 — @qa 분류가 정정 (m311) [보고]**
qa가 21개를 나눠 봤다: **메커니즘 13개**(updater·electron-builder·posttest·index 초기화·i18n/product·default-app·cli/names·SettingsModal·ai-provider 6개 — 거의 무조건 필요) + **기능 8개**(지식 3·템플릿 2·Home.tsx·AiModelPicker 표시명 — 탑재 여부별). [직접확인] **로그인·지식·템플릿·잠금 AI를 모두 탑재하면 21개 전부가 메커니즘으로 재사용된다 → 훅 수는 줄어들지 않는다.**
[직접확인] 남은 UBION 하드코딩은 '사내 AI' 문구·`ubion-*` 채널명·위키 프롬프트의 '회사(UBION)' 문자열 정도 — **전부 설정화 대상**.
→ **의미**: §4 옵션 C의 "제품 오버레이는 훅 없음"은 **총량 절감이 아니라 충돌 면의 분리**로 읽어야 한다. **21개 상한은 낮출 목표가 아니라 새 저장소에서 유지·관리할 대상 목록**이다(§6.6.1의 checker 재작성 = 훅 1개는 그대로 유효).

---

## 4. 업스트림 추종 구조 선택지

| | A. 모노 오버레이 | B. 포크 2개 | C. 공통 코어 + 제품 오버레이 |
|---|---|---|---|
| 구조 | 저장소 1개, `company/` + `packages/company-*` 그대로. 새 제품은 **브랜딩·설정만 교체** | 업스트림을 각각 포크 | **공통 코어 저장소**(업스트림 추종 + 일반화된 `packages/company-*`) + 제품별 얇은 오버레이 저장소 |
| 업스트림 업그레이드 | 1회 | **2회** | 1회(코어에서만) |
| 훅 21개 충돌 | 1회 | **2회** | 1회(코어) — 제품 오버레이는 훅 없음 |
| 테넌트별 배포 | 빌드마다 설정 교체 필요 | 동일 | **설정 파일 교체만으로 가능**(런타임 설정 목표) |
| 유비온 코드 오염 | 높음(신규 기능이 유비온 저장소에 계속 쌓임) | 중간 | **낮음**(유비온 고유 코드는 유비온 오버레이로) |
| 초기 비용 | 낮음 | 중간 | 높음 |
| 운영 비용 | 낮음 | **높음** | 중간 |
| [추정] 공수 | 1~2주 | 2~3주 | 4~6주 |

### 추천: **C (공통 코어 + 제품 오버레이)** — 단, 단계적

이유(근거):
0. **[직접확인] §3.3.1의 주입 seam 4개가 이미 새 기능 3종에 대응한다.** → 공통 코어를 쪼갰을 때 각 제품은 **어댑터 구현체만** 갖게 되고, 공통 코어는 거의 손대지 않는다. 이 구조가 C의 비용을 낮춘다.
1. 새 리포가 확정됐고 [직접확인] §3.7에서 훅 21개가 매 동기화 병목임을 확인했다. B는 이 비용을 정확히 두 배로 만든다.
2. §3.4에서 정책이 빌드 상수임을 확인했다. 이걸 해결하지 않으면 "어떤 기업도 자기 환경에 맞춰 운영"이라는 목표 자체가 불가능하다 — 이건 구조 선택보다 **선행 조건**이다.
3. A는 가장 싸지만 §3.1의 374건이 계속 유비온 저장소에 쌓여, 새 리포 분리(m250)와 어긋난다.

**단, 순서가 중요하다** [추정]:
- **Phase 0에 §3.4(런타임 테넌트 설정)를 먼저 해결한다.** 이게 있어야 코어를 제품 오버레이로 쪼갤 수 있다. 설정을 못 런타임화한 채로 쪼개면 두 곳에 설정이 생긴다.
- 코어 분리는 새 리포가 생기고, 첫 일반 고객의 요구(어떤 IdP·어떤 지식 소스)가 구체화(명확해지는) 뒤에 한다. 지금 쪼개면 추측으로 API를 확정하게 된다.

### 4.5 새 리포의 첫 코드를 어떻게 채울까 (결정 6) [추정]

리포는 비어 있다(Apache-2.0 LICENSE + README). 세 갈래:

| 옵션 | 방법 | 장점 | 단점 | 공수 [추정] |
|---|---|---|---|---|
| **A. 업스트림에서 직접** | 이음오피스 업스트림(`pblsketch/openoffice`) v0.12.11을 그대로 받아 **새 overlay 계층**을 그 위에 만든다 | 이력·유비온 코드 오염 없음. 결정 2(오픈소스 배포)에 가장 적합 | 업스트림 훅 예산을 **새로** 정의해야 함(§6.6.1) | 2~3주 |
| **B. ubion-office에서 분기** | 현재 ubion-office의 overlay를 그대로 가져와 일반화한다 | 시작점 확보, 이미 검증된 훅·정책 계층 활용 | **유비온 이력이 섞여 들어간다**(결정 2와 충돌). 유비온 고유 코드 제거 작업이 별도 발생 | 1~2주 + 정리 2~3주 |
| **C. 공통 코어를 먼저 만들고** | ubion-office의 공통 부분을 코어 저장소로 추출한 뒤, 새 리포는 그 코어를 참조 | §4 옵션 C의 최종 형태를 한 번에 만든다 | 리포 2개가 동시에 움직여야 함 — **Phase 0 정책 런타임화가 먼저**여야 성립(§4 선행조건) | 4~6주 |

**추천: A, 단 Phase 0의 정책 런타임화 설계와 함께.** [추정] 결정 2(고객 불특정·오픈소스 배포)는 **유비온 이력이 담긴 저장소를 기반 삼으면 방해**가 된다. A가 가장 깨끗하고, B의 "이미 검증된 계층" 이점은 §3.3.1의 seam 목록이 대체한다 — 어댑터 4개(`DaouClient`·`OfficeBrokerClient`·`RelayClient`·`WikiApiClient`)가 이미 분리 가능한 지점을 명시해 준다.

**결정 6은 사람이 답해야 한다.** 위 A/B/C 중 어느 것을 택할지는 업스트림 추종 구조(§4)와 새 리포의 역할을 동시에 정하므로, **추천안만으로 결정하지 않는다.**

---

## 5. 배포 모델 (api 보고 + 코드 근거 결합)

api 보고(m254) 권고: **MVP는 A(기업별 단독 설치)**, 검증 후 C(하이브리드). 코드 근거로 보강:

- [직접확인] 현재 서버는 단일 인스턴스 전제 — `company/docs/office-broker.md:45,136-143`, `office/store.ts` JSON 파일 세션, challenge/handoff는 **메모리**.
- [직접확인] `Audit`는 메모리 1000개 + stdout (`audit.ts:1-8`) — 영구 보존 없음.
- [직접확인] 사용자 DB·역할·SCIM 없음. `BOT_ROOMS`은 정적 allowlist(`main.ts:30`).
- [직접확인] 멀티테넌트는 현재 JSON store + in-memory challenge와 **양립 불가**(api m254 위험 목록).

**→ MVP는 기업별 단독 설치가 맞다.** 현재 아키텍처에서 가장 가까운 형태이고, 데이터 격리·컴플라이언스가 가장 쉽다. 멀티테넌트 SaaS로 직행하면 store/auth/routing/audit 재작성이 필요하다.

**결정 3(자체 설치가 어려운 경우 우리가 제공하는 클라우드 환경) — 병행 구조 [추정]**. 결정 3은 "둘 중 하나"가 아니라 **병행**이다. 권장 형태:
- **자체 설치(A)** = 기본값. 데이터 격리·컴플라이언스·고객 소유.
- **제공형 클라우드(C)** = 자체 설치가 어려운 고객(데이터 주권 문제, 운영 인력 부족)에 제공. 이때 **테넌트 격리는 데이터 평면별로** — 고객 테넌트마다 격리된 DB·오브젝트 스토리지·키를 배정하고, 제어 평면(중앙 관리·과금·온보딩)만 공유한다.
- [추정] 이 형태는 api m254가 말한 "하이브리드(control plane + dedicated data plane)"와 같고, **A→C 순서**가 자연스럽다. **C를 먼저 만들면 멀티테넌트 재작성을 먼저 만나게 된다**(§7 위험 5) — A를 먼저 검증하고 C는 그 위에 얹는다.
- [미확인] 제공형 클라우드의 요금·SLA·주권 리전 요구는 아직 없다 → §8 결정 항목.

### 5.1 서버 구조 — api 조사 결과 반영 (m280) [보고]

> [보고] api가 2026-11-09 14:2x KST에 서버 차트 결과를 보냈다. 아래는 그 내용이며, **research가 코드로 재검증하지 않은 [보고]**다. §3의 클라이언트 측 근거와 별개.

**권장 구조: 테넌트별 데이터 플레인 + 중앙 컨트롤 플레인**

| 평면 | 위치 | 담당 | 저장하는 것 |
|---|---|---|---|
| Control plane | 우리가 제공하는 클라우드 | 테넌트 registry · entitlement/license · 릴리스·업데이트 manifest · 상태·과금·지원 | **테넌트 콘텐츠·키·세션은 저장하지 않음.** 서명된 entitlement/release manifest만 발급 |
| Data plane | 고객 셀프호스트 **또는** 우리 전용 인스턴스 | nginx + bot/broker + wiki gateway + Postgres + Redis + S3 호환 스토리지 + worker(+선택 search) | 테넌트별 DB/schema·bucket·secret·namespace 분리 |

**[보고] 최소 MVP 구성**: nginx + bot/broker + Postgres + S3 + worker. Redis는 인스턴스 2개 이상 또는 공유 rate-limit이 필요할 때. 검색은 기존 gateway로 시작. 단일 노드 개발은 JSON adapter 유지 가능.

**[보고] 테넌트 설정**: `tenant.yaml`(브랜드·IdP·knowledge source·model gateway·template registry·retention·feature flags) + secret refs. 서명·검증된 설정만 받고 **repo에 비밀값 금지**.

**[보고] SaaS 모드**: control plane은 서명된 entitlement/release manifest만 발급하고, data plane이 **pull**한다. control plane으로의 인바운드 접근이 없다. 텔레메트리는 opt-in.

**[보고] 서버 Phase 0 산출물**
1. 인터페이스: `IdentityProvider`(OIDC Authorization Code+PKCE 우선, SAML 후속) · `Directory`/SCIM · `KnowledgeSource` · `TemplateRegistry` · `ModelGateway` · `AuditSink`
2. Postgres 스키마(tenants/users/roles/identities/sessions·revocations/templates/audit) · Redis(rate-limit·challenge·cache) · S3(templates·knowledge assets)
3. durable audit + request-id · health/ready · migrations · backup/restore
4. config schema·feature flags. **유비온 전용은 `adapters/ubion`(Daou web+DM, wiki, LiteLLM)으로 격리**해 나중에 얹을 수 있게
5. 오픈소스 위생: 이음오피스 업스트림에서 새 이력으로 시작(ubion-office 이력 미포함)·내부 도메인/IP/비밀값 제외·`.env.example`만·secret scanning·Apache-2.0/NOTICE
6. 업데이트 서버: 서명된 manifest(channel/version/sha256/min OS/notes) · immutable artifact · rollback 포인터 · staged rollout. 클라이언트는 서명·해시 검증

**[보고] 서버 측 위험**
- 현재 JSON store·in-memory challenge는 **다중 인스턴스와 양립 불가** → Phase 0에서 Postgres/Redis 어댑터 필요.
- 테넌트 격리는 MVP에서 **공유 row-level이 아니라 DB/schema·bucket·secret 분리**. 공유 SaaS는 격리·노이즈·데이터 레지던시 검증 후.
- **위키 gateway 소스가 이 저장소 밖**이라 공개 전 라이선스·소유권 확인 필요.
- **다우 DM·`sub`는 코어가 아니라 Ubion adapter로.** 코어 인증은 OIDC/SAML.
- 업데이트 피드는 공급망 표면 — 코드 서명·해시·롤백 없이는 운영하지 않음.

**[보고] 서버 규모 [추정]**: Phase 0 1~2주 · Phase 1 4~6주 · Phase 2 6~10주 — §6 로드맵과 동일.

**[추정] 코드 경계와의 연결**: api의 `IdentityProvider`·`KnowledgeSource`·`ModelGateway` 인터페이스는 §3.3.1의 클라이언트 seam(`DaouClient`·`OfficeBrokerClient`·`RelayClient`·`WikiApiClient`)과 **서버·클라이언트가 같은 4개 축으로 나뉜다.** `adapters/ubion` 격리는 §9의 "유비온 고유 코드는 유비온 오버레이로" 원칙을 서버 쪽에 적용한 것이고, 결정 1(나중에 유비온에도 적용 가능)의 기술적 근거가 된다.

---

## 6. 로드맵 (상대 순서, 기간은 [추정])

| Phase | 내용 | 기간 [추정] | 선행 조건 |
|---|---|---|---|
| **0. 기반 분리** | ① **정책을 런타임 설정으로** (§3.4 — 정적 import → 테넌트 설정 로더) ② `auth.config.json`/`brand.json` 스키마 일반화 ③ **주입 seam 4개 정리** (§3.3.1 — `DaouClient`·`OfficeBrokerClient`·`RelayClient`·`WikiApiClient`) ④ audit 스키마 ⑤ Docker Compose ⑥ **릴리스 파이프라인·서명·업데이트 피드 설계** (§6.6.4) ⑦ 새 overlay 계층·훅 예산 규칙 (§6.6.1) ⑧ **새 리포에 NOTICE 동봉** (§10 — 새 리포 `main`에 아직 NOTICE가 없음) | 1~2주 | 없음 (여기서 시작) |
| **1. MVP** | **기존 seam에 어댑터 구현** (§3.3.1) — OIDC 구현체(`DaouClient`·`OfficeBrokerClient` 대체) + 역할·SCIM basic · 지식 read-only 어댑터 1종(`WikiApiClient` 대체) · 템플릿 카탈로그 read-only · 테넌트별 LiteLLM(`RelayClient` 대체) · 영구 audit | 4~6주 | Phase 0 |
| **2. 확장** | 지식 수집·ACL·검색 · 템플릿 작성·승인 · SAML/LDAP · 관리 UI · 쿼터·비용 · 멀티테넌트/하이브리드 | 6~10주 | Phase 1 + 첫 고객 요구 |

[추정] 파일 수: 서버 20~35 · 인프라 10~20 · 클라이언트 15~25 (api m254와 대체로 일치).

**우리 몫 추가** [추정]: 위 표에 다음을 더한다 —
- 테넌트 설정 로더 + 관리 UI: 클라이언트/인프라 8~12
- `company-policy` 패키지에서 유비온 고유 코드 분리(`ubion-proposal-*` 템플릿, 다우 전용 모듈): 클라이언트 5~8
- 공통 코어 저장소 분리(신규 리포 생성 후): 2~3주

---

## 6.5 클라이언트·배포 관점 (web에 배정 — 미수신, research가 코드 근거로 보완)

> **[미확인]** @web의 클라이언트 조사 결과가 아직 @research에게 오지 않았다(2026-11-09 14:15 KST 기준). 아래는 research가 저장소에서 직접 확인한 **코드 근거만**이다. web 결과가 도착하면 이 절을 갱신한다.

### 6.5.1 기능 게이팅은 이미 런타임 해제 가능 [직접확인]

- `packages/company-policy/src/index.ts:17` — `policy.updates.enabled !== true` 로 업데이트 경로 차단
- `packages/company-policy/src/env.ts:2` — `isPolicyEnforced()`
- `packages/company-policy/src/video.ts` / `wiki.ts` — `resolveVideoApiSettings(env)` / `resolveWikiApiSettings(env)`가 **env → 정책 → 기본값** 순으로 해석
- `packages/ubion-video/src/config.ts:16-19` — `resolveVideoConfig(env)`가 정책으로부터 baseUrl을 얻고 env는 base만 바꿀 수 있음(기능을 켤 수는 없음)

**해석**: **기능 on/off 해제와 엔드포인트 교체는 이미 런타임에 가능**하다. 결손은 "정책 파일 자체가 정적 import라 빌드 상수"라는 §3.4 한 가지뿐이다. → 일반화 작업의 표면적을 크게 줄여 준다.

### 6.5.2 기업별 설치·배포 [직접확인]

| 항목 | 현재 | 일반 제품 관점 |
|---|---|---|
| NSIS 설치 방식 | `oneClick: false`, `allowToChangeInstallationDirectory: true` (`apps/shell/electron-builder.cjs:914-915`) | 사용자가 설치 경로 선택 → **임의 경로 설치 가능**(enterprise 배포에 적합) |
| 자산 이름 | `${productName}-Setup-${version}.${ext}` (`:919-921`) | `brand.json`의 `productName`에서 파생 → **브랜드만 바꾸면 신규로 산출**. 단 **productName은 영문**이어야 한다(URL 경로, §6.6.4-2의 3축) |
| 앱 ID·바로가기 | `brand.json`의 `appId`·`desktopName`·`winProgIdPrefix` | 테넌트별 **동시 설치 충돌** 가능 → 테넌트별 appId 규칙 필요 |
| 자동 업데이트 | **꺼짐** (`company/policy/build-hook.cjs` 주석: "TEMPORARY (Scott): updates stay off until the company generic update feed exists") | 일반 제품은 **자체 피드 필요** → §8 결정 항목 |
| 로그 경로 | `packages/company-policy/src/main.ts:318` → `~/Library/Logs/ubion-office` | 브랜드별 경로로 분리해야 다중 제품 동시 설치가 안전 |

### 6.5.3 기업별 설정을 런타임 파일로 빼는 방식 — 선례 2개 [직접확인]

| 선례 | 위치 | 형태 |
|---|---|---|
| 위키 세션 | `packages/company-policy/src/auth/wiki-env-file.ts:99` | `${homedir}/.config/ubion/wiki.env`, `UBION_WIKI_ENV_FILE`로 경로 재정의 |
| LiteLLM 키 | `packages/company-policy/src/auth/env-key-file.ts:106` | `${homedir}/.config/ubion/litellm.env` |

**해석**: **테넌트 설정을 사용자 홈의 JSON/ENV 파일로 두는 패턴이 이미 검증돼 있다.** 일반화는 이 패턴을 `company.policy.json` 전체로 확장하는 것이고, 파일 위치·권한(모드 600)·경로 재정의 규칙을 재사용하면 된다. [추정] 이것이 §6 Phase 0 ①의 설계 근거다.

---

### 6.5.4 기능별 부착점 — @qa 결과 (web 임시 대행) [보고]

> [보고] orchy m299로 @qa가 @web 대신 임시 수행. 대상 `ubion-office` main `01b4efe4`, 읽기 전용·설치 금지. **[직접확인] 표기는 qa가 파일:줄 근거로 구분** — research가 소스에서 재확인한 항목을 표시했다.

| 기능 | 부착 지점 | 비고 |
|---|---|---|
| **계정·로그인** | 창=`packages/ubion-staff-login`(자체 패키지, `extraResources`로 실림 — `paths.ts:6-12`가 `resourcesPath`에서 읽음). main 연결=`company-policy/src/main.ts` `createStaffLoginMain`(`staffLogin.enabled` 게이트), 초기화=`index.ts:9557` `initCompanyMain`. UI 진입=`Home.tsx` 헤더 프로필 카드 + `header-profile.tsx:356` '로그인 관리…' + 다리 `user-skills-bridge.ts:222` | **[직접확인] 이미 런타임 리소스 방식** — `paths.ts:6-12`가 `opts.isPackaged ? join(resourcesPath,…) : join(appPath,…)` |
| **지식 패널** | AI 패널 스킬 목록 `use-skill-proposals.tsx:40,86`(`companyPanelSkills`) / 스킬·프롬프트 `ubion-wiki/src/renderer.ts:14,22`(`wiki_search/page/recent`) / 빈 KB 폴백 `KbAskPanel.tsx:81,688-689,1000` / IPC 다리 `user-skills-bridge.ts:217-218` | [보고] 새 '내부 지식관리'는 이 4군데가 부착면 |
| **템플릿** | 갤러리 탭 `TemplateGallery.tsx:29,265-266` / 등록 API `packages/pipelines/src/slides/templates/catalog.ts` `registerCompanyTemplates` / 회사 템플릿 `company-policy/src/templates/`(`slide-catalog`·`ubion-proposal-*`·`gallery-tabs`; `brand.ts:3`이 side-effect import로 전 프로세스 등록) | [보고] |

[직접확인] research 교차 확인: `packages/ubion-staff-login/src/paths.ts:6-12`의 런타임 리소스 분기, `packages/company-policy/src/brand.ts:1`(brand JSON 정적 import)과 `:3`(side-effect import) — **qa의 부착점 표기는 저장소와 일치한다.**

### 6.5.5 기업별 설정 외부화 — @qa 2층 구조 [보고 + 직접확인]

[보고] qa의 결론: **현재 3개 설정이 모두 빌드타임 번들** — policy(`store.ts:1` 정적 import, 주입점은 `init.ts:68` `options.raw`이나 기본은 미사용) / brand(`brand.ts:1` 정적 + `build-hook.cjs:22` 설치자 신원) / auth.config(`auth/config.ts:1` + `build-hook.cjs:21` 딥링크 스킴).

**[직접확인] §3.4 정적 import 5건과 정합한다.** qa가 말한 "설정 3종"은 policy·brand·auth.config이고, §3.4의 5개 import **줄**은 policy이 `index.ts:1`·`store.ts:1` **2곳**에서 옵니다 → 4줄 + `video-themes/manifest.json` 1줄 = 5줄. **양쪽 숫자가 충돌하지 않는다.**

**[추정] 2층 구조 — 신원(빌드) vs 정책(런타임)**
- **빌드타임 유지**: `appId`·`productName`·파일 연결(`.desktop`·바로가기)·딥링크 스킴 — **설치자에 심기는 값**이므로 테넌트가 바꿀 수 없어야 한다.
- **런타임화 대상**: 앱 내 정책·브랜드·인증 제공자. qa가 짚은 **선례**가 이미 있다 — `packages/ubion-staff-login/src/paths.ts:6-12`가 시작 시 `resources`의 JSON을 읽는 패턴. 즉 **설정 주입 지점이 이미 런타임 리소스 읽기 형태로 존재**하므로, policy·brand를 같은 형태로 옮기는 것은 새 발상이 아니라 **기존 패턴 확장**이다.
- [추정] 단 `product.ts`와 `build-hook.cjs`의 brand 참조도 런타임 값 수용으로 손봐야 한다.

**[보고] 배포 선택지 2안**
- **(a) 기업별 설치 파일** (현 구조) — `build-hook` 파라미터화.
- **(b) 범용 바이너리 + 기업 설정 파일 프로비저닝** — (b)는 런타임 외부화의 전제. 업데이트 피드는 **기업별 generic feed**가 필요하고, 현재 `updater.ts`가 R0로 전면 차단한다. [직접확인] `company/PATCHES.md:90`에 **`provider: generic` 기반 피드로 전환**하는 계획이 이미 명시돼 있다 → (b)의 피드 전제와 **기존 계획이 일치**한다.

### 6.5.6 21훅 중 일반 제품에 필요한 것 — @qa 분류 [보고]

[보고] qa의 분류:
- **메커니즘 13개(거의 무조건 필요)** — `updater.ts`·`electron-builder.cjs`·`package.json` posttest·`index.ts`(초기화)·`i18n/product.ts`·`default-app.ts`·`cli/names.ts`(브랜드 주입)·`SettingsModal.tsx`·ai-provider 6개(제공자 잠금).
- **기능 8개(탑재 여부별)** — `use-skill-proposals`·`user-skills-bridge`·`KbAskPanel`(지식) / `catalog.ts`·`TemplateGallery`(템플릿) / `Home.tsx`(프로필 카드 필요, 영상 카드 선택) / `AiModelPicker` 표시명(문구만, 선택).
- **[직접확인] 결론**: 로그인+지식+템플릿+잠금 AI를 **다-functions 탑재하면 21개 전부가 메커니즘으로 재사용**된다 → **훅 수는 줄어들지 않는다.**
- [직접확인] 훅 본문에 남은 UBION 하드코딩은 '사내 AI' 문구·`ubion-*` 채널명·위키 프롬프트의 '회사(UBION)' 문자열 정도 — **전부 설정화 대상.**

[직접확인] **이건 §3.7의 예상과 반대다.** §3.7은 "공통 코어에 훅을 두면 새 제품은 훅을 0개 상속"한다고 가정했는데, qa의 분류는 **기능을 다 넣으면 훅이 그대로 남는다**고 말한다. → **결론: 훅 절감은 기대하지 말아야 하고, 대신 훅을 "기계적으로 재사용 가능한 것"으로 정규화하는 것이 목표**여야 한다. §3.7의 21개 상한은 **낮출 목표가 아니라 새 저장소에서 유지·관리할 대상 목록**이다.

---

## 6.6 배포·릴리스 (devops 검토 요청 반영)

> §6.6은 @devops 검토 대상(orchy m267). 아래는 research가 저장소에서 직접 확인한 **코드 근거**다.

### 6.6.1 유비온 회사 계층을 따라오지 않는다는 전제 [직접확인]

m267 지시대로, 새 제품에는 `company/`·`packages/company-policy`·`packages/ubion-*`가 **따라오지 않는다.** [직접확인] 이 저장소에서 그 계층이 실제로 잡고 있는 것:

| 계층 | 현재 역할 | 새 제품에서의 처리 |
|---|---|---|
| `company/policy/build-hook.cjs` | electron-builder 후크 — 브랜드·버전·feed 게이트 | **대체 필요**(§6.6.3) |
| `company/brand.json` | 제품 신원(appId·productName·exe·아이콘) | 재설계(이름·로고 미결 — §8.1-8) |
| `company/policy/company.policy.json` | 정책 스키마 + endpoint | **런타임 설정으로** (§3.4) |
| `company/auth.config.json` | ubt1·virtualKey TTL | 재설계(신규 인증 모델) |
| `company/templates/`·`company/video-themes/` | 빌드 내장 카탈로그 | 테넌트 배포 카탈로그로 (§3.6) |
| `company/scripts/check-patches.mjs` | 업스트림 21개 훅 상한 검사 | **대체 필요** — 새 제품의 훅 예산 정의. **[직접확인 devops m292] 대장 구조도 새로 만들어야 한다**: 파일·줄·목적·되돌리는법·회차가 업스트림 기준. 게다가 `check-patches.mjs`의 `IGNORED_PREFIXES`가 **회사 계층 경로를 하드코딩**하므로, 새 저장소에서는 overlay 경로명이 달라져 **checker 스크립트 자체를 새 저장소용으로 다시 짜야 한다 → 이것 자체가 훅 1개**다 |
| `company/security/.gitleaksignore` | 푸시 게이트 | 재사용 가능 |
| `company/PATCHES.md` | 훅 대장 | 재사용 가능(제품별 별도 대장 권장) |
| `company/docs/` | 배포 체크리스트·런북·Windows 빌드 | **재설계** (서버 endpoint·브랜드 전부 다름). **[직접확인 devops m292]** 유비온 서버(nginx allowlist·bot·gateway) 전용이라 그대로 이식하면 안 된다. 이식 시 **서버 배포 문서(체크리스트·런북)와 빌드 경로 문서(Windows 크로스 빌드)를 분리**하는 게 낫다 — 서버 쪽은 tenant별로 달라지고, 빌드 쪽은 서버와 무관하게 재사용 가능 |

**[추정] 핵심**: 새 리포에는 upstream을 그대로 받고 **새로운 overlay 계층**을 만드는 구조가 필요하다.

**★ 결정 2(고객 불특정·오픈소스 배포) → 공개 전 점검 항목** [추정]:
1. **이력 제외** — `ubion-office`의 커밋 이력·브랜치·PR·태그를 새 리포로 가져오지 않는다. §4.5 옵션 A가 이 조건을 충족한다.
2. **비밀 제외** — 키·토큰·내부 서버 주소·개인 경로·사내 도메인(`*.ubion.*`)이 코드·문서·설정·히스토리에 남지 않았는지 전체 검사. [직접확인] 현재 계획서도 IP·토큰·개인경로 0건으로 동일 기준을 적용했다. **[추정 devops m294] 산출물 바이너리 스캔을 추가** — 공개 릴리스 저장소를 대비하면 **소스 스캔만으로는 부족**하다. 빌드 산출물(DMG·EXE·app.asar) 자체에 키·엔드포인트·사내 도메인·개발자 경로가 문자열로 박혀 있을 수 있으므로 **릴리스 직전 바이너리 문자열 스캔을 게이트로 둔다.**
3. **내부 도메인 제외** — `llm.ubion.global`·`lms.ubion.global`·`bot.ubion.global`·`coco.ubion.co.kr` 등 사내 엔드포인트는 **기본값으로 남기면 안 된다.** 일반 제품의 기본값은 비어 있거나 예시값이어야 하고, 실제 값은 테넌트 설정에서만 온다(§3.4).
4. **기여·보안·릴리스 정책** — 공개 저장소이므로 `CONTRIBUTING.md`·`SECURITY.md`(신고 경로)·릴리스/서명 절차가 필요하다. [직접확인] 업스트림에 이미 이 파일들이 있다 — Apache-2.0 §4(a)(b)(c)(d)와 함께 동봉 대상.
5. **공개 전환 자체가 저장소 설정 변경** — ✓ 승인 대상이며, 위 1~4가 통과한 뒤에야 실행한다. `check-patches`의 "21개 훅 상한" 규칙은 유비온의 것이므로, 새 제품의 훅 예산(훅 목록 + 상한 + 되돌리는법)을 새로 정의해야 한다. 이건 §3.7의 병목과 직결된다 — **공통 코어에 훅을 두면 새 제품은 훅을 0개 상속**받는다.
6. **릴리스 파리프라인/서버 공개 전환** — ✓ 승인 대상(§6.6.4-5·§8). **[직접확인 devops m294]** 새 저장소는 **Actions가 이미 활성**(`{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}`, 워크플로 0개)이라 **워크플로 추가·실행에 저장소 설정 변경 승인이 필요 없다.** `ubion-office`가 꺼져 있었던 것은 그 저장소의 상태이고 새 저장소에는 해당하지 않는다.

### 6.6.2 업스트림의 자동 업데이트는 켜져 있다 [직접확인]

- `apps/shell/src/main/updater.ts:748` — `CHANNEL_FEED = { stable: 'latest', beta: 'beta' }`. GitHub provider가 pre-release를 beta 채널로 쓴다.
- `apps/shell/src/main/updater.ts:958-971` — macOS는 자체 스테이징 업데이터 경로가 있다(`stageMacUpdate` → 앱 옆에 풀고 교체).
- `apps/shell/electron-builder.cjs` — `publish` provider 설정이 업스트림 기본으로 들어 있고, `latest.yml`(Windows NSIS)·`beta-mac.yml`(macOS)·`beta-linux.yml`을 릴리스에 올리는 구조.
- **유비온은 이걸 끈다**: `company/policy/build-hook.cjs:457-461` — `policy.updates.enabled !== true`면 `config.publish = null`, `nsis.publish = null`, `rpm.publish = null` → **피드가 아예 구워지지 않는다.** 주석: "TEMPORARY (Scott): updates stay off until the company generic update feed exists."

**[직접확인] macOS 자체 업데이트 — ad-hoc 서명에서도 동작한다 (devops m292 정정 반영).**
이 항목은 이전 판이 **틀렸다.** 근거가 업스트림 주석(`electron-builder.cjs:978-988`)이었는데, 그 주석은 **현재 코드와 어긋난다.** 실제 구현 기준:
- **`apps/shell/src/main/mac-update.ts:146-172` `installMacStaging`** — "Points electron-updater's Mac download at `stage` instead of **Squirrel.Mac**". Squirrel.Mac은 **쓰이지 않는다.** electron-updater의 `updateDownloaded`를 가로채 앱 옆에 zip을 풀어 교체하고 `update-downloaded`를 직접 발행한다.
- **`mac-update.ts:57-66` `macSelfUpdateBlock`** — 실제 차단 사유는 **3가지 파일시스템 조건**뿐이다: `not-an-app-bundle`(앱 번들이 아닌 경로 실행) · `translocated`(격리 경로 실행) · `read-only`(설치 폴더 쓰기 불가). **ad-hoc 서명은 차단 목록에 없다.**
- **`mac-update.ts:20-21`** — "Nothing here adds or strips the quarantine flag: the app downloads the zip itself, so the files never carry one and the new version opens without the Gatekeeper prompt the first install needed." → 스테이징 경로는 **격리 플래그 없이** 새 버전을 연다.
- `updater.ts:958`(차단 판정)·`:963`(`installMacStaging` 호출) — **릴리스 페이지로 유도하지 않는다.** `updater.ts:704`의 "릴리스 페이지"는 **수동 설치** 진입점 설명이다.

→ **결론: macOS 자체 업데이트 경로는 그대로 쓸 수 있다.** 막히는 것은 서명이 아니라 위 3가지 실행 조건이다. **릴리스 페이지로 우회시키는 경로를 새로 만들 필요도 없다.**
[직접확인] mac 서명(ad-hoc `identity='-'`·`hardenedRuntime=false`·`notarize=false`·`dmg.sign=false`)은 **자체 업데이트를 막는 요소가 아니다.** → §6.6.3의 mac 결정에서 **이유만** 바뀐다.

### 6.6.3 서명·업데이트 피드·채널 — 결정 사항

| 결정 | 현재 상태 [직접확인] | 일반 제품에 필요한 것 |
|---|---|---|
| **mac 서명** | ad-hoc(`identity='-'`)·hardenedRuntime off·notarize off | **Developer ID + notarize** 필요 — 단 **이유가 "자체 업데이트 불가"가 아니다**(ad-hoc에서도 자체 업데이트는 동작한다, §6.6.2). 진짜 이유는 **Gatekeeper 마찰(첫 실행 "열기" 우회 반복) + 기업 MDM 배포 불가** |
| **Windows 서명** | 유비온 릴리스는 **미서명** (PE 인증서 테이블 비어 있음 — `ubion-office` 11-08 인수인계 §6.2). 업스트림은 `GENOFFICE_WIN_SIGN_MODE`(`test`=자체서명 PFX, `production`=DigiCert KeyLocker) 경로를 제공(`electron-builder.cjs:945-954`) | **production 서명 필수** — "알 수 없는 게시자" 경고로는 기업 MDM 배포 불가. §8 결정 |
| **자동 업데이트 피드** | 유비온은 **끔**(publish=null). 업스트림은 GitHub provider + `latest.yml` | **자체 피드 필요**. GitHub provider·S3·자체 서버 중 선택 → §8 결정. **[직접확인] 제약**: electron-updater의 `github` provider는 **토큰 없이 동작하는 공개 저장소 전제**다(`updater.ts:55-56` "the repository is public, which is why no token or feed URL has to be injected"). **private 릴리스 저장소를 쓰면 토큰이 필요**하고 토큰을 클라이언트에 넣는 것은 시크릿 배포 문제가 된다 → **private 릴리스 저장소를 쓸 경우 `s3`/`generic` provider로 피드를 분리하는 쪽이 안전**. **[직접확인 devops m294] 게다가 private 저장소 + github provider 조합은 실패가 조용하다** — 업데이트 실패를 사용자가 모른 채 넘어간다. **릴리스 피드 저장소를 소스 저장소와 분리할지 여부 자체가 결정 항목**(§8.1-21) |
| **업데이트 채널** | `stable`/`beta` 2개 | 채널 개념 재사용 가능. 단 enterprise는 "ring"(테스트→필로트→전체) 운영이 필요할 수 있음 → §8 결정 |
| **Windows 서명자 종속** | — | [직접확인] `ubion-office` 11-08 인수인계 §6.2 릴리스 노트에 이미 명시됨 — 서명 없으면 나중 업데이트가 서명자에 종속. **서명 키 교체 경로(코드서명 인증서 교체)를 초기 설계에 포함해야 한다** |
| **릴리스 자산** | `UbionOffice-Setup-0.12.11-ubion.1.exe`(NSIS x64, 미서명) 등 | 새 제품은 **자사 앱ID·서명·피드**로 별도 자산. 기존 자산은 **삭제하지 않는다**(windows-build.md §7 규칙) |

### 6.6.4 빌드·배포 경로 재설계 방향 [추정] — [직접확인] 코드 근거 포함

1. **빌드 훅**: `company/policy/build-hook.cjs` 대체 — 브랜드·버전·피드 게이트를 **새 overlay 훅**으로. 업스트림 `publish` 설정을 그대로 쓰되(업스트림이 이미 켜 둠), 회사 정책으로 끄지 않는다 — generic 제품이라 업데이트가 기본이어야 한다.
2. **자산 네이밍**: `brand.json`의 `productName`에서 파생(`${productName}-Setup-${version}.${ext}`, `electron-builder.cjs:919-921`) → 브랜드만 바꾸면 신규 산출. 앱ID·프로토콜 핸들러·바로가기도 동시 분리(§8.1-10).
   - **[직접확인] devops m292 보강 — `publish` 대상은 상수 하드코딩**: `electron-builder.cjs:29-30`의 `REPO_OWNER='pblsketch'` / `REPO_NAME='openoffice'`가 `config.publish`(`:1001-1006`)에 쓰인다. 브랜드만 바꿔서는 **릴리스 저장소가 업스트림을 가리킨 채** 남는다.
   - **해결 방식(업스트림 훅 0개)**: `build-hook.cjs`가 `config.publish` 설정(`electron-builder.cjs:1001`) **뒤에** 호출(`:1013`)되므로, 새 overlay 훅이 `config.publish`를 **덮어쓸 수 있다** → 업스트림 파일을 수정하지 않는다.
   - **확정값 (devops m301)**: `config.publish = [{ provider:'github', owner:'scottnaddle', repo:'naddle-office' }]` — **최종 이름으로.** (릴리스 저장소를 소스와 분리하기로 결정되면 그쪽 저장소명으로 교체.)
   - **[직접확인 devops m294] owner/repo는 **최종 이름**으로 확정**: `owner='scottnaddle'`, `repo='naddle-office'`. GitHub API가 이전 이름으로 307 리다이렉트하지만 **electron-updater가 쓰는 다운로드 URL은 리다이렉트를 따라가지 않을 수 있다** → **리다이렉트에 의존하지 않는다.** 리포명이 바뀌면 **자동 업데이트가 찾는 피드 경로도 바뀐다**는 점이 여기서 확인된다.
   - **[미확인] 새 결정**: 이 `repos`가 가리키는 **릴리스 저장소**는 소스 저장소와 다를 수 있다(**공개 소스 + 비공개 릴리스 분리**). 어느 쪽을 쓸지 §8 결정 항목에 추가(§8.1-21). private 릴리스 저장소를 쓰면 §6.6.3의 provider 제약(토큰 필요)이 걸린다.
   - **[직접확인 devops m306] 브랜딩 3축 분리** — 세 축은 규칙이 다르므로 **한 축만 바꿔지는 일이 없도록** 분리해 둔다.

| 축 | 값 | 출처 | 규칙 |
|---|---|---|---|
| **산출 파일명** | **영문** (`naddle` 계열) | `brand.json` `productName` → `${productName}-Setup-${version}.${ext}`(`electron-builder.cjs:919-921`)·`${productName}-${version}-${arch}.${ext}`(`:993` dmg) | 릴리스 자산명은 **URL 경로에 쓰인다.** `productName`이 한글이면 파일명에 비ASCII가 들어가 **URL 인코딩·역슬래시 처리에서 예기치 않은 형태**가 될 수 있다 → **반드시 영문** |
| **앱 ID·프로토콜 핸들러·바로가기** | **영문** (`naddle://` 계열) | `brand.json` `appId`(`global.ubion.office` 형식)·`protocolName`·`desktopName`·`winProgIdPrefix`·`packagedAppName`·`executableName` | 프로토콜 핸들러는 영문이어야 하고 **사전 등록·고유성**이 필요. 이미 설치된 앱과의 충돌 회피. **파일명 규칙과 규칙이 다르다**(파일명은 `productName`에서, 앱 ID는 `appId`/`ProgId`에서 따로 옴) |
| **표시명** | **한글** (`나들오피스`) | `brand.json` `productNameKo`(현재 `유비온오피스` 형식) | 화면·설치 UI에 노출 |

**[직접확인] 업스트림도 이미 이 구분을 쓴다** — 내부 이름은 `ieumoffice`(`packages/i18n/src/product.ts`·`package.json`), `brand.json`에는 `productName`과 `productNameKo`가 **별도 키**로 존재한다. 파일명 규칙은 `productName`에서, 앱 ID는 `appId`/`ProgId`에서 따로 온다 → **3축을 같은 축으로 취급하지 않는다.**

→ **이 3축의 확정 시점은 §8.1-8(영문 표기·상표·도메인)·§8.1-10(테넌트별 appId 규칙)에 묶어 공개 전에 처리한다.** 지금 한 축만 바뀌면 산출물명·업데이트 경로·설치 충돌이 어긋난다.
3. **설치 형태**: NSIS `oneClick:false` + `allowToChangeInstallationDirectory:true`(`:914-915`) → 사용자가 경로 선택, **임의 경로 설치 가능**. 기업 배포에 적합. [직접확인]
4. **샌드박스/코사인**: macOS는 공증 필수(위). Windows는 서명 + MDM 설치(MSIX는 미서명 앱에 부적합 → NSIS 유지 + 그룹 정책 배포).
5. **릴리스 파이프라인**: 기존 `ubion-office`는 GitHub Actions 비활성(`gh api` → `{"enabled":false}` [직접확인]) + Mac Studio 로컬 크로스 빌드(`ubion-office` 11-08 인수인계 §6.2). **[직접확인 devops m294 정정] 새 저장소는 Actions가 이미 활성**(`{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}`, 워크플로 0개) → **워크플로를 추가·실행하는 데 저장소 설정 변경 승인이 필요 없다.** m292에서 "새 저장소도 기본 비활성"이라고 한 것은 **틀렸고 여기로 철회한다.** 남는 승인 대상은 **서명 키**와 **릴리스 저장소 공개 범위**다. [직접확인] 다만 **업스트림의 windows-build 워크플로는 그대로 재사용할 수 없다** — 산출물명·자체서명 PFX 경로가 업스트림 기준(`IeumOffice-…`)이라 그대로 쓰면 **산출물 이름과 브랜드가 업스트림 이름으로 나간다.** 새 워크플로가 필요하다.
   - **[추정] 서명 키 관리를 초기 설계에 포함** (devops 동의): 피드가 없어서 자동화가 어려운 문제가 아니라, **서명 키 관리(보관·주입·교체·폐기)**와 **매핑(어떤 빌드가 어떤 키로 서명되는지)**가 없으면 "서명 교체" 시점에 **어떤 사용자가 갱신 불가 상태가 되는지 추적이 안 된다.** 키 교체 경로는 초기 설계에 넣는다.
   - **[직접확인] Windows 배포 방식**: MSIX는 미서명 앱에 부적합 → NSIS 유지가 맞다. **enterprise MDM은 NSIS + 그룹 정책 배포가 표준**이며, NSIS `allowToChangeInstallationDirectory:true`가 이미 켜져 있어 그대로 쓸 수 있다.

### 6.6.5 서버 운영 관점 (api 보고 인용)

- [보고 api m254] 배포 모델 비교에서 **A(기업별 단독 설치)를 MVP 추천**. 현재 구조와 가장 가깝고 데이터 격리·컴플라이언스가 쉽다. 단점: 업그레이드·운영 부담.
- [직접확인] 현재 서버는 systemd/tsx/nginx + JSON 파일 + 파일 기반 secrets. Postgres/Redis/오브젝트 스토리지/마이그레이션/HA 없음.
- [직접확인] 감사 로그는 메모리 1000개 + stdout(`audit.ts:1-8`) → 기업 PoC 수준에서는 부족. [추정] 일반 제품 Phase 0에 최소 영구 audit + 요청 ID를 넣어야 한다.
- [추정] 자동 업데이트를 켜면 **클라이언트-버전 ↔ 서버-계약 호환성** 관리가 필요. 업스트림은 `latest.yml`로 버전만 맞추지만, 서버 API가 바뀌면 구버전 클라이언트가 깨진다 → 서버는 **하위 호환 API 유지**가 필요하고, 업데이트 채널과 서버 배포 순서를 함께 계획해야 한다.
- **[추정 → 확정] 권장 순서 (devops m292 보강 — 서버가 클라이언트보다 먼저)**: stable 채널로 먼저 나가면 구버전 클라이언트가 **즉시** 새 서버를 만나므로, **채널을 여는 것보다 서버 배포가 먼저**다.
  1) 서버가 **구버전 계약을 유지한 채** 먼저 배포(추가 호환 API)
  2) **beta 채널**로 클라이언트 검증
  3) 서버의 **구버전 지원 종료 시점을 먼저 공지**
  4) 그 뒤 **stable 릴리스**
  → 즉 **어떤 채널을 언제 열지**를 서버 배포와 함께 계획해야 한다.

---

## 7. 위험 · 미확인

### 위험
1. **★ 업스트림 훅 21개 이중 병목** — §3.7. 두 제품을 따로 추종하면 충돌 해결이 배가된다.
2. **★ 정책이 빌드 상수** — §3.4. 런타임 설정으로 못 바꾸면 "기업별 운영" 목표가 불가능. Phase 0 최우선.
3. **지식 게이트웨이 소스가 저장소 밖** — [보고] api m254. `ubion-wiki-gateway`는 별도 서버의 로컬 포트에서 도는 **외부 서비스**로, 이 저장소에는 코드가 없다. 이 저장소엔 읽기 전용 계약(`/v1/search|page|recent|index`)만 보인다 → **지식 어댑터 일반화 범위를 이 저장소만으로 확정할 수 없다.**
4. **다우(Daou) `sub`/profile/role을 다른 IdP로 매핑하는 계약 미정** — [보고] api m254. 서버 `sub` = Daou userSeq (`office/broker.ts`) [직접확인] `company.policy.json:96` `daouServerUrl`.
5. **멀티테넌트와 현재 저장 모델 양립 불가** — [직접확인] §5.
6. **템플릿 원격 실행은 서명 검증 전 금지** — [보고] api m254. 스크립트/프레젠테이션 템플릿은 실행 가능한 코드를 포함할 수 있어, 배포 경로에 서명 검증이 없으면 임의 코드 실행 위험.
7. **Windows 서명·오프라인 설치는 별도 과제** — [보고] api m254 + `ubion-office` 11-08 인수인계 §6.2의 기존 미서명 상태.
8. **★ 자동 업데이트와 서버 계약의 호환성** [추정] — 업데이트를 켜면 구버전 클라이언트가 새 서버 API와 어긋날 수 있다. 서버는 하위 호환 API를 유지해야 하고 업데이트 채널과 서버 배포 순서를 함께 계획해야 한다(§6.6.5). 유비온은 지금 피드가 꺼져 있어 이 문제를 아직 겪지 않았다.
9. ~~**★ macOS 자체 업데이트 불가**~~ → **[직접확인] 판정 뒤집힘 (devops m292)**. mac 자체 업데이트는 **ad-hoc 서명에서도 동작한다.** 실제 구현은 Squirrel.Mac이 아니라 `mac-update.ts:146-172`의 자체 스테이징 경로이며, 차단 사유는 서명이 아니라 `mac-update.ts:57-66`의 3가지 파일시스템 조건(`not-an-app-bundle`·`translocated`·`read-only`)이다. 근거가 되었던 업스트림 주석(`electron-builder.cjs:978-988`)은 **현재 코드와 어긋난다**(§6.6.2). 잔여 위험은 **Gatekeeper 마찰과 MDM 배포 불가**로 mac 서명 필요성의 이유만 바뀐다.
10. **릴리스 파이프라인 부재** [직접확인] — `ubion-office`는 GitHub Actions 비활성 + 로컬 크로스 빌드 대체. **[직접확인 devops m294]** 새 저장소는 Actions가 이미 활성이라 **파이프라인 infra는 준비돼 있고**, 남는 일은 **워크플로 작성 + 서명 키 관리 + 피드 구성**이다(§6.6.4).

### 미확인 (이 저장소에서 확인할 수 없음)
- [미확인] 지식 게이트웨이 내부 구현 → 어댑터 경계 확정 불가 (3번).
- [미확인] 첫 일반 고객이 IdP·지식 소스·배포 형태 중 무엇을 요구하는지 → Phase 1 범위 확정 불가.
- [보고] **@web의 클라이언트·배포 조사는 여전히 미수신.** orchy m299로 **@qa가 임시 수행**(읽기 전용·설치 금지, `ubion-office` main `01b4efe4`)해 m311로 결과를 보냈고, §6.5.4(기능 부착점)·§6.5.5(설정 외부화 2층 구조)·§6.5.6(21훅 분류)에 반영했다. **[직접확인] research가 qa의 파일:줄 근거를 소스에서 재확인**했다(`paths.ts:6-12` 런타임 리소스 분기·`brand.ts:1`/`:3`·`store.ts:1`·`auth/config.ts:1`·`PATCHES.md:90` `provider: generic` 계획·§3.4 정적 import 5줄). **web이 나중에 답하면 교차검증 표기**를 남긴다.
- [미확인] 새 리포에 이음오피스 코드를 가져오는 방식·시점 — m262는 "계획서 결론 뒤"로만 확정. 코어 저장소로 쓸지 제품 저장소로 쓸지(§4 옵션 B/C)는 미결.
- [미확인] 자동 업데이트 피드 정책 — 현재 꺼짐 상태이며 일반 제품에서는 필수(§6.5.2·§6.6.3).
- [보고] **@devops의 배포·릴리스 검토는 수신**(m292)해 §6.6에 반영했다. **핵심 정정 1건: §6.6.2의 "macOS 자체 업데이트 불가"가 사실과 달랐다** — mac 자체 업데이트는 ad-hoc 서명에서도 동작하며, 근거로 인용했던 업스트림 주석이 현재 코드와 어긋났다(§6.6.2·§6.6.3·§7-9). 나머지 6건은 보강이며 §6.6.1·§6.6.4·§6.6.5·§8.1에 반영했다. [직접확인] research가 devops의 코드 인용(`mac-update.ts:57-66`·`:146-172`·`:20-21`·`electron-builder.cjs:29-30`·`:1001-1013`·`updater.ts:748`·`build-hook.cjs:457-461`)을 **모두 소스에서 재확인**했다.
- [보고] **@api의 서버 조사 결과는 수신**해 §5.1에 반영했다. 다만 **research가 서버 코드로 재검증하지 않았다** — §5.1 전체가 [보고]다. 서버 코드가 이 저장소 밖에 있어 확인이 불가하다.
- [보고] **위키 gateway의 라이선스·소유권**은 저장소 밖이라 확인할 수 없다 — 공개 배포(결정 2) 전에 사람이 확인해야 한다.
- [미확인] 새 리포의 시그닝 키 보유 주체·갱신 절차·MDM 연동 방식.
- [미확인] 서버가 어디까지 일반화돼야 하는지 — `bot-server`는 이 저장소 밖.

---

## 8. 결정이 필요한 질문 (한 번에)

**scott-air15에게**
1. ~~새 리포 이름·소유자·공개 범위~~ → **확정됨(m261·m262·m263)**: `scottnaddle/naddle-office`(제품명 '나들오피스' 반영해 리포명 변경됨 — [직접확인] 2026-11-09 API가 `ieumoffice-enterprise` → `naddle-office`로 307 리다이렉트), private, 기본 브랜치 `main`, Apache-2.0 LICENSE + README만 있는 빈 리포. 저장소 설정 변경 불필요(답 m263). 리포명은 **제품명 계열**(`naddle-office`, 결정 4의 '나들오피스'와 스펠링 계열)로 변경됐다(m282).
2. **유비온오피스와 새 제품의 관계** — (a) 새 리포가 공통 코어 + 유비온 오버레이 둘 다, (b) 새 리포가 일반 제품 전용이고 공통 코어는 ubion-office에 남음, (c) 업스트림 추종을 별도 코어 저장소로. → §4 옵션 B/C 선택과 직결.
3. 대상 고객 규모(수십~수천 명?) — self-host 적합성 판단.
4. 배포 방식: 클라우드 제공 vs 각 기업 자체 설치.

**개발·운영 결정**
5. 다우(Daou) 계정 모델을 OIDC로 대체할 때, `sub`(userSeq)·프로필·역할을 IdP 중립으로 바꾸는 계약 — 서버 쪽 결정 필요 (api 영역).
6. 훅 21개를 공통 코어에 남기고 양쪽 제품이 공유할지, 제품별로 갈라질지. → 업그레이드 비용을 결정한다.
7. 멀티테넌트를 언제 도입할지(MVP는 self-host로 가도 되는지).

### 8.1 추가 결정 항목 (신규 리포 확정에 따라)


8. **브랜드·상표 — 제품명 '나들오피스' (결정 4).** Apache-2.0 §6은 원 저작의 상호·상표·제품명 사용을 허용하지 않되, **원 저작의 출처를 설명하는 데 필요한 통상적 사용은 허용**한다. 리포명·설명에 "IeumOffice 기반"이라 쓰고 NOTICE를 그대로 복사하는 것은 §6이 허용하는 출처 표기 범위에 든다. 그러나 **"IeumOffice Enterprise"를 상용 제품명·로고로 쓰면 상표 사용 문제가 된다** → 결정된 제품명은 **'나들오피스'**로 이 문제를 회피한다. **남은 확인(사람)**: '나들오피스'·'naddle'의 **상표·도메인 충돌 검색**(공개 전), 앱 ID·프로토콜 핸들러명(`UbionOffice`/`ubionoffice` 계열)의 분리 규칙. 리포명 변경(`ieumoffice-enterprise` → `naddle-office`)은 **이미 반영됨**[직접확인]. [미확인] 상표·도메인은 사람이 확인 필요.
- **★ 영문 표기·앱 ID는 공개 전에 최종 확정 (orchy m296)** — 영문 표기(`naddle`)는 **릴리스 파일명·앱 ID·프로토콜 핸들러에 영구히 박힌다.** 공개 후 바꾸면 **이미 배포된 버전의 업데이트 경로까지 영향**을 받는다(§6.6.4-2의 `config.publish` owner/repo도 마찬가지). → 공개 전 확인 항목이며, **'naddle'만 봤을 때 '나들오피스'로 헷갈리지 않는지**도 한 번 점검한다. 앱 ID·핸들러 규칙은 §8.1-10과 함께 확정.
9. **자동 업데이트 피드.** 현재 꺼짐(`company/policy/build-hook.cjs` 주석). 일반 제품은 테넌트별 업데이트가 사실상 필수 → 자체 피드 운영 방식(제어판·패키지 저장소·수동 배포) 결정 필요.
10. **테넌트별 appId 규칙.** `brand.json`의 `appId`·`protocolName`·`desktopName`·`winProgIdPrefix`가 동일하면 두 제품이 같은 컴퓨터에 동시 설치될 때 충돌한다. 유비온(`global.ubion.office`)과 일반 제품의 appId 분리 규칙 필요. **[직접확인] §6.6.4-2의 브랜딩 3축(산출 파일명=영문 `productName` / 앱 ID·핸들러=영문 `appId` 계열 / 표시명=한글 `productNameKo`)과 함께 확정한다** — 3축은 서로 다른 설정 키에서 오고 규칙도 다르다. 공개 전 확정 대상(§8.1-8).
11. **새 리포의 첫 코드 (결정 6).** §4.5의 A(업스트림에서 직접)·B(ubion-office에서 분기)·C(공통 코어 먼저) 중 택일. **추천은 A**이지만 결정 2(고객 불특정·오픈소스 배포)와 §4 구조 선택을 동시에 걸기 때문에 사람이 정한다. A·B는 §4의 공통 코어 여부와 직결된다.
12. **설정 파일 위치 규칙.** 선례(`~/.config/ubion/*.env`)를 일반 제품으로 확장할 때 경로 규칙(`~/.config/<tenantId>/…`?)과 파일 모드(600)·경로 재정의 규칙을 어떻게 정할지.
13. **mac 서명·공증** — ad-hoc(하드코딩 `identity='-'`, `notarize=false`)로는 기업 배포에 Gatekeeper 마찰이 크다. Developer ID + notarize 도입 여부·인증서 보유 주체·갱신 주기(§6.6.3).
14. **Windows 코드서명** — 현재 미서명이라 "알 수 없는 게시자" 경고가 기업 MDM 배포를 막는다. `production`(DigiCert KeyLocker 등) 도입 여부 + **서명 키 교체 경로**(코드서명 인증서 갱신 시 기존 설치본 업데이트가 서명자 종속에 걸리는 문제).
15. **업데이트 피드·채널** — GitHub provider / S3 / 자체 서버 중 무엇으로 배포할지, 채널은 stable·beta 2개로 충분한지 enterprise ring(테스트→필로트→전체) 운영이 필요한지. 피드가 없으면 자동화가 불가능하므로 **Phase 0에서 결정 필요**(§6.6.3·§6.6.4).
16. **릴리스 파이프라인** — `ubion-office`는 GitHub Actions가 비활성(`{"enabled":false}` [직접확인])이고 Mac Studio 로컬 크로스 빌드로 대체 중이다. **[직접확인 devops m294] 새 저장소는 Actions가 이미 활성**(`{"enabled":true}`, 워크플로 0개) → 저장소 설정 변경 승인은 불필요하고, **시그닝 키 관리 + 새 워크플로 작성**이 Phase 0 산출물이다(§6.6.4).
17. **새 업스트림 훅 예산** — 유비온의 `check-patches` 21개 상한 규칙을 따라오지 않는다면 새 제품의 훅 목록·상한·되돌리는법 규칙을 새로 정의해야 한다(§6.6.1).
18. **리포 공개 전환 시점** (결정 2) — private 유지하다가 공개 전 점검 5개(§6.6.1)를 통과하면 전환. **저장소 설정 변경이라 ✓ 승인 대상.**
19. **제공형 클라우드의 요금·SLA·데이터 주권 리전** (결정 3) — §5의 하이브리드 구조에서 제공할 서비스 수준.
20. **오픈소스 기여·보안 신고 경로** (결정 2) — 공개 저장소이므로 `CONTRIBUTING.md`·`SECURITY.md` 정책 확정.
21. **릴리스 저장소의 공개/비공개 분리** (devops m292) — `config.publish`가 가리키는 저장소가 소스 저장소와 같아야 하는지, 별도 private 릴리스 저장소로 분리할지. private면 github provider에 토큰이 필요해 `s3`/`generic` provider로 피드를 분리하는 쪽이 안전(§6.6.3).
22. **서명 키 보유 주체·갱신 절차·MDM 연동** — scott 결정 필요(보유 주체 불명, devops m292).
23. **enterprise ring 운영 여부** — 테스트→필로트→전체 ring이 필요한가. 현 `stable`/`beta` 2채널로 부족하면 `updater.ts:748` `CHANNEL_FEED` 수정 = **업스트림 훅 1개**이므로 훅 예산에 포함시켜 설계한다(§6.6.3).

---

## 9. 유비온오피스와의 관계 (공유 · 분리 기준)

| 영역 | 유비온 | 일반 제품 | 근거 |
|---|---|---|---|
| 업스트림 | 공유 | 공유 | 이음오피스 Apache-2.0 (§10) |
| 훅 21개 | 유지 | **공통 코어에서 공유** 권장 | §3.7 — 이중 병목 방지 |
| 다우(Daou) 인증 | 유지 | **OIDC로 교체** | §3.3 — 다우는 유비온 그룹웨어 |
| 정책·브랜드 | `company.policy.json` 고정 | **테넌트 런타임 설정** | §3.4 — 핵심 분기점 |
| `ubion-proposal-*` 템플릿 | 유지 | 제외(테넌트 배포로 대체) | §3.6 |
| 브랜드 문자열 | '유비온' 고정 | 테넌트별 | §3.5 — `strings.ts` 중앙화 활용 |
| 서버 | `bot.ubion.global` | 기업별 자체 설치(추천) | §5 |

**분리 기준 한 줄**: **다우(Daou)·유비온 문자열·유비온 전용 템플릿은 유비온 오버레이로.** 나머지(업스트림 훅, `packages/company-policy`의 구조, 브릿지 패턴)는 공통 코어.

---

## 10. 라이선스 (Apache-2.0 · NOTICE)

[직접확인] **인용 출처를 분명히 한다.**
- **LICENSE 조항** — 출처는 **`scottnaddle/ubion-office`의 `LICENSE`**(= Apache-2.0 전문, `LICENSE:2-4`, `LICENSE:190` "Copyright 2026 Mainfunc, Inc."). 새 리포 `scottnaddle/naddle-office`의 `main`에도 **같은 Apache-2.0 LICENSE가 이미 있다**(11357B, `gh api .../license` → `Apache-2.0`) [직접확인].
- **NOTICE** — 출처는 **`scottnaddle/ubion-office`의 `NOTICE`**. **새 리포에는 NOTICE 파일이 아직 없다**(현재 `main`은 LICENSE + README뿐) [직접확인] → §6.6.1에서 "NOTICE 동봉"을 Phase 0 항목으로 명시해야 한다.
- 아래 인용문은 전부 **`ubion-office`의 `LICENSE`·`NOTICE`** 기준이다.

`ubion-office`의 `NOTICE` 중 "IeumOffice modifications" 절:

> "IeumOffice (https://github.com/pblsketch/openoffice) is a modified version of GenOffice (https://github.com/genspark-ai/genoffice), the work this file's opening notice refers to. Files of the original work have been changed, added and removed by the IeumOffice contributors; the repository history records each change. The modifications are licensed under the Apache License, Version 2.0, like the original work."

**Apache-2.0 §4(derivative works) 관점** [직접확인 LICENSE 조문 확인]:
- 수정·배포 **허용**. 수정본도 Apache-2.0으로 배포 가능.
- 조건: **라이선스·NOTICE·변경 사실 명시**(§4a/4b/4c), 원작자 특허·상표권 부여 없음(§3), 보증 없음(§7).
- `NOTICE`는 §4d상 **파생 배포물에 반드시 포함**. 파생물은 원 NOTICE를 **복사**해야 하며 원 NOTICE를 "수정본으로 대체"할 수 없다. → 새 제품도 `NOTICE`의 "IeumOffice modifications" 절과 "GenOffice ... Copyright 2026 Mainfunc, Inc."을 **그대로 포함**해야 한다.
- **상표는 Apache-2.0이 부여하지 않는다** (§6). `NOTICE`도 명시: "The Apache License 2.0 grants no rights to the names or logos 'IeumOffice', '이음오피스' or 'GenOffice' (section 6)."
  → **새 제품은 '이음오피스'/'IeumOffice'/'GenOffice' 명칭·로고를 쓰면 안 된다.** 결정된 제품명은 **'나들오피스'**(결정 4)이며, 상표·도메인 확인은 사람이 해야 한다(§8.1-8).
- 서드파티: 슬라이드 템플릿 12종 = MIT(frontend-slides) · 폰트 = SIL OFL 1.1 · 내장 스킬 5종 = MIT/Apache-2.0 · Lucide = ISC/MIT · Roboto = Apache-2.0 · Unicode UCD = Unicode-3.0 · rhwp = MIT · hangul = BSD-3. → **모두 상용·재배포 가능하나 각 라이선스 문구를 유지·동봉**해야 한다. [직접확인 `NOTICE` 전문]


**결론** [추정]: 라이선스는 **장벽이 아니다.** Apache-2.0 파생물이므로 새 상용 제품으로 판매 가능하고, 전제조건은 (1) LICENSE+NOTICE 동봉·수정사실 명시 (2) 이음오피스/GenOffice 상표 미사용 (3) 서드파티 고지 유지. **지금 필요한 유일한 조치는 새 제품의 브랜드 자산을 만드는 것**이고, 그것은 [추정] `company/brand.json`이 이미 파라미터화돼 있어(`productName`·`appId`·`executableName`·`protocolName`·`icon`) **재사용 가능한 구조**다.

[직접확인] `LICENSE` §4(a)–(d) 전문 확인 — §4(a) 라이선스 사본 동봉 · §4(b) **수정 파일에 변경 사실 명시** · §4(c) 원작의 저작권·특허·상표·저작자 표시 유지(파생물과 무관한 것은 제외 가능) · §4(d) NOTICE의 저작자 표시를 **읽을 수 있는 사본으로** 포함(NOTICE 파일·소스/문서·표시 중 1곳 이상. NOTICE에 고유 저작자 표시를 추가할 수는 있어도 **NOTICE를 수정본으로 대체할 수 없음**). §6 전문: "This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file."

---

## 11. 조사 범위 · 하지 않은 것

- **읽기 전용만 했다.** 코드·서버·설치·저장소 설정 변경 없음. 커밋은 이 계획서 문서 1건뿐이고 코드 변경 없음. PR #1은 미병합 상태로 제출했다(m262 지시).
- **열지 않은 것**: 비밀값·토큰·세션·env/secrets 파일. 서버는 상태·로그·문서만 봤다. 설치·빌드 실행 없음.
- **확인하지 못한 것**: §7 미확인 4건 + 지식 게이트웨이 내부 구현.
- **내 추정 vs 확인 구분**: §3.7의 훅 분류, §6의 기간·파일 수, §10의 "장벽이 아니다"는 모두 [추정]/[직접확인 LICENSE 조문] 기반 판단.
