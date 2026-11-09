# 일반 기업용 오피스 앱 — 조사·계획서

> **상태: 조사 완료 · 계획서 초안.** 대상 리포 `scottnaddle/ieumoffice-enterprise`(private, Apache-2.0, `main`) — m262 지시대로 `docs/plan.md`로 PR(base `main`, 브랜치 `plan/enterprise-edition-v0`) 제출. **머지 금지.**
> 기준 코드: `scottnaddle/ubion-office` main `01b4efe4` (2026-11-09 확인) · 조사 2026-11-09 14:0x KST · 읽기 전용(코드·서버·설치·저장소 설정 변경 없음)
> 표기: **[직접확인]** 이 문서를 쓴 조사자가 직접 확인 · **[보고]** 다른 담당자 보고 · **[추정]** 규모·기간은 추정 · **[미확인]** 확인되지 않음

---

## 0. 한 줄 요약

유비온오피스는 **이음오피스(IeumOffice, Apache-2.0) 위에 얹은 "회사 오버레이"**다. 일반 기업용 앱은 (1) 새 저장소, (2) 업스트림 추종 구조를 **공통 코어 + 제품 오버레이**로 바꾸고, (3) "하드코딩된 정책"을 **런타임 테넌트 설정**으로 바꾸는 것이 핵심 작업이다. [직접확인] 코드의 **유비온 고유 문자열 374건 중 285건(76%)은 식별자 이름**이고, URL 리터럴은 **2건뿐**이다 — 즉 대부분은 이름·구조 문제이지 동작 로직 문제가 아니다. [추정] MVP 4~6주.

---

## 1. 목표 · 비목표

### 목표
- 이음오피스 기반, **어떤 기업도 자기 환경(인증·지식·템플릿·모델)에 맞춰 운영**할 수 있는 제품.
- 기능 3종: 내부 지식관리 · 계정관리 · 문서 템플릿 관리.
- 유비온오피스와 **같은 업스트림을 함께 추종**하되, 업그레이드 비용이 이중으로 안 나가야 한다.

### 비목표 (이번 단계)
- 코드·서버·설치·저장소 설정 변경 없음 (조사·계획만).
- 멀티테넌트 SaaS화 (MVP에서는 기업별 단독 설치 권장 — §5).
- Windows 서명, 실기 설치 스모크 (별도 과제 — api 보고).
- 기존 유비온오피스 동작 변경.

---

## 2. 사용자 · 시나리오

| 시나리오 | 필요 기능 | 현재 코드 근거 |
|---|---|---|
| 임직사가 사내 wiki에서 문서 검색 | 지식관리 | `packages/ubion-wiki/src/` 11파일 (read-only bridge) |
| 임직사가 SSO로 로그인 | 계정관리 | **현재 Daou/coco 고정** — OIDC/SAML/LDAP 없음 (api m253) |
| 매니저가 사내 템플릿을 배포 | 템플릿 관리 | `company/templates/` — 빌드 내장, 서버 API 없음 (api m253) |
| 임직사가 사내 모델 사용 | 계정관리 | LiteLLM per-user virtual key (`packages/company-policy/src/auth/litellm-key.ts`) |

[직접확인] **현재 계정 모델은 Daou 1:1 코드로 고정** — `packages/company-policy/src/auth/daou-dm-auth.ts`(83줄), `schema.ts:53-54` `daouServerUrl`. 일반 기업용 SSO로 가려면 이 계층 전체가 교체 대상이다.

---

## 3. 코드 경계: 유비온 전용 vs 일반화 가능

### 3.1 규모 측정 [직접확인]

`packages/company-policy` · `packages/ubion-staff-login` · `packages/ubion-wiki` · `packages/ubion-video` 의 `src/`에서 `ubion|Ubion|유비온|coco|Daou|daou` 출현 라인 **374건**을 분류한 결과:

| 분류 | 라인 수 | 비율 | 의미 |
|---|---:|---:|---|
| **식별자 이름만** (`UbionProfile`, `ubionVideoOpen`, IPC 채널명 등) | 285 | 76% | 이름 변경. 동작 불변 |
| Daou/coco 참조 | 87 | 23% | 실제 통합 지점 (아래 §3.3) |
| **URL 리터럴** | **2** | **0.5%** | 아래 2줄뿐 |

패키지별:

| 패키지 | src 파일 | 라인 | 유비온/데아우 출현 |
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
| Daou 웹 로그인 + DM 코드 | `packages/company-policy/src/auth/daou-dm-auth.ts`(83줄) | `DaouClient` 인터페이스(`:17-21`: `userSeq()`, `readChallengeCode()`)가 이미 **주입 seam** — 이 接口만 IdP별로 교체 |
| 데아우 서버 URL | `packages/company-policy/src/schema.ts:53-54,136,141` | 정책 필드. 값 교체는 쉬움, **프로토콜이 coco 전용** |
| 로그인 세션 파티션 | `packages/company-policy/src/main.ts:61,517-528` | `OFFICE_DAOU_PARTITION` — IdP별 쿠키 파티션 개념으로 일반화 |
| 위키 grant 계약 | `packages/company-policy/src/auth/wiki-session-grant.ts`(109줄) | `wss1` 3세그먼트 토큰(`:15-18`) — **지식 소스별 계약이 다를 수 있음** |
| 키체인 항목 | `packages/company-policy/src/auth/key-store.ts:44-45` | `ubion.litellm.key` / `ubion.litellm.expiresAt` — 이름만 |
| 정책 endpoint 4종 | `company/policy/company.policy.json:11,82,86,95-96` | `llm.ubion.global` · `lms.ubion.global/video-api` · `lms.ubion.global/api/wiki` · `bot.ubion.global` · `coco.ubion.co.kr` |

### 3.4 ★ 가장 중요한 구조적 발견 — 정책은 **빌드 시점 상수** [직접확인]

```
packages/company-policy/src/index.ts:1   import policy from '../../../company/policy/company.policy.json'
packages/company-policy/src/store.ts:1   import rawPolicy from '../../../company/policy/company.policy.json'
packages/company-policy/src/brand.ts:1    import brand  from '../../../company/brand.json'
```

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

- `packages/ai-provider/src/` 6개 (registry·provider-selection·media·image-backend·search-settings·legacy-settings)
- `apps/shell/src/` 5개 (index.ts·default-app.ts·updater.ts·Home.tsx·SettingsModal.tsx·KbAskPanel.tsx)
- `packages/ui/src/` 2개 (use-skill-proposals.tsx·AiModelPicker.tsx)
- 패키지·앱별: `packages/ai-provider/src/` 6개(registry·provider-selection·media·image-backend·search-settings·legacy-settings) · `apps/shell/src/` 6개(index.ts·default-app.ts·updater.ts·Home.tsx·SettingsModal.tsx·KbAskPanel.tsx) · `packages/ui/src/` 2개(use-skill-proposals.tsx·AiModelPicker.tsx) · `packages/pipelines/src/slides/templates/catalog.ts` · `packages/i18n/src/product.ts` · `packages/cli/src/names.ts` · `packages/electron-utils/src/user-skills-bridge.ts` · `apps/slides/src/renderer/ai/TemplateGallery.tsx` · `apps/shell/electron-builder.cjs`

**중요 관찰** [직접확인]: 회사가 기능을 붙이는 방식은 **업스트림 파일에 import 1줄을 심는 패턴**이다 —
```
apps/shell/src/renderer/src/Home.tsx:8-10   import { UbionHeaderBrand, ... } from '@ubion/company-policy/header-profile'
packages/ui/src/use-skill-proposals.tsx:40   import { companyPanelSkills } from '../../ubion-wiki/src/renderer'
apps/shell/src/main/index.ts:112             import { initCompanyMain, initCompanyPolicy } from '@ubion/company-policy/main'
```
즉 **업스트림 훅 21개는 제품 기능이 아니라 "회사 기능의 진입점"**이다. 업스트림 동기화 시 매번 이 21줄을 다시 충돌 해결해야 한다.

**해석**: 두 제품이 같은 업스트림을 따라가려면, 이 21개 훅이 **양쪽 제품에서 동일하게 유지**되거나(공통 코어), **제품별로 갈라져** 충돌 비용이 배수가 된다. → §4 옵션 A/B/C의 결정 요인.

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
1. 새 리포가 확정됐고 [직접확인] §3.7에서 훅 21개가 매 동기화 병목임을 확인했다. B는 이 비용을 정확히 두 배로 만든다.
2. §3.4에서 정책이 빌드 상수임을 확인했다. 이걸 해결하지 않으면 "어떤 기업도 자기 환경에 맞춰 운영"이라는 목표 자체가 불가능하다 — 이건 구조 선택보다 **선행 조건**이다.
3. A는 가장 싸지만 §3.1의 374건이 계속 유비온 저장소에 쌓여, 새 리포 분리(m250)와 어긋난다.

**단, 순서가 중요하다** [추정]:
- **Phase 0에 §3.4(런타임 테넌트 설정)를 먼저 해결한다.** 이게 있어야 코어를 제품 오버레이로 쪼갤 수 있다. 설정을 못 런타임화한 채로 쪼개면 두 곳에 설정이 생긴다.
- 코어 분리는 새 리포가 생기고, 첫 일반 고객의 요구(어떤 IdP·어떤 지식 소스)가 concretize된 뒤에 한다. 지금 쪼개면 추측으로 API를 확정하게 된다.

---

## 5. 배포 모델 (api 보고 + 코드 근거 결합)

api 보고(m254) 권고: **MVP는 A(기업별 단독 설치)**, 검증 후 C(하이브리드). 코드 근거로 보강:

- [직접확인] 현재 서버는 단일 인스턴스 전제 — `company/docs/office-broker.md:45,136-143`, `office/store.ts` JSON 파일 세션, challenge/handoff는 **메모리**.
- [직접확인] `Audit`는 메모리 1000개 + stdout (`audit.ts:1-8`) — 영구 보존 없음.
- [직접확인] 사용자 DB·역할·SCIM 없음. `BOT_ROOMS`은 정적 allowlist(`main.ts:30`).
- [직접확인] 멀티테넌트는 현재 JSON store + in-memory challenge와 **양립 불가**(api m254 위험 목록).

**→ MVP는 기업별 단독 설치가 맞다.** 현재 아키텍처에서 가장 가까운 형태이고, 데이터 격리·컴플라이언스가 가장 쉽다. 멀티테넌트 SaaS로 직행하면 store/auth/routing/audit 재작성이 필요하다.

---

## 6. 로드맵 (상대 순서, 기간은 [추정])

| Phase | 내용 | 기간 [추정] | 선행 조건 |
|---|---|---|---|
| **0. 기반 분리** | ① **정책을 런타임 설정으로** (§3.4 — 정적 import → 테넌트 설정 로더) ② `auth.config.json`/`brand.json` 스키마 일반화 ③ `DaouClient` seam 확인·정리 ④ audit 스키마 ⑤ Docker Compose | 1~2주 | 없음 (여기서 시작) |
| **1. MVP** | OIDC SSO+역할+SCIM basic · 지식 read-only 어댑터 1종 · 템플릿 카탈로그 read-only · 테넌트별 LiteLLM · 영구 audit | 4~6주 | Phase 0 |
| **2. 확장** | 지식 수집·ACL·검색 · 템플릿 작성·승인 · SAML/LDAP · 관리 UI · 쿼터·비용 · 멀티테넌트/하이브리드 | 6~10주 | Phase 1 + 첫 고객 요구 |

[추정] 파일 수: 서버 20~35 · 인프라 10~20 · 클라이언트 15~25 (api m254와 대체로 일치).

**우리 몫 추가** [추정]: 위 표에 다음을 더한다 —
- 테넌트 설정 로더 + 관리 UI: 클라이언트/인프라 8~12
- `company-policy` 패키지에서 유비온 고유 코드 분리(`ubion-proposal-*` 템플릿, 데아우 전용 모듈): 클라이언트 5~8
- 공통 코어 저장소 분리(신규 리포 생성 후): 2~3주

---

## 6.5 클라이언트·배포 관점 (web 차트로 배정됨 — 미수신, research가 코드 근거로 보완)

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
| 자산 이름 | `${productName}-Setup-${version}.${ext}` (`:919-921`) | `brand.json`의 `productName`에서 파생 → **브랜드만 바꾸면 신규로 산출** |
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

## 7. 위험 · 미확인

### 위험
1. **★ 업스트림 훅 21개 이중 병목** — §3.7. 두 제품을 따로 추종하면 충돌 해결이 배가된다.
2. **★ 정책이 빌드 상수** — §3.4. 런타임 설정으로 못 바꾸면 "기업별 운영" 목표가 불가능. Phase 0 최우선.
3. **지식 게이트웨이 소스가 저장소 밖** — [보고] api m254. `ubion-wiki-gateway`가 127.0.0.1:8794에서 도는 **외부 서비스**. 이 저장소엔 읽기 전용 계약(`/v1/search|page|recent|index`)만 보인다 → **지식 어댑터 일반화 범위를 이 저장소만으로 확정할 수 없다.**
4. **데아우 `sub`/profile/role을 다른 IdP로 매핑하는 계약 미정** — [보고] api m254. 서버 `sub` = Daou userSeq (`office/broker.ts`) [직접확인] `company.policy.json:96` `daouServerUrl`.
5. **멀티테넌트와 현재 저장 모델 양립 불가** — [직접확인] §5.
6. **템플릿 원격 실행은 서명 검증 전 금지** — [보고] api m254. 스크립트/프레젠테이션 템플릿은 실행 가능한 코드를 포함할 수 있어, 배포 경로에 서명 검증이 없으면 임의 코드 실행 위험.
7. **Windows 서명·오프라인 설치는 별도 과제** — [보고] api m254 + §6.2의 기존 미서명 상태.

### 미확인 (이 저장소에서 확인할 수 없음)
- [미확인] 지식 게이트웨이 내부 구현 → 어댑터 경계 확정 불가 (3번).
- [미확인] 첫 일반 고객이 IdP·지식 소스·배포 형태 중 무엇을 요구하는지 → Phase 1 범위 확정 불가.
- [미확인] **@web의 클라이언트·배포 조사 결과 미수신**(2026-11-09 14:15 KST 기준). §6.5는 research가 직접 확인한 코드 근거로 보완했지만, web이 보는 "기능별 앱 내 붙는 위치"·"기업별 설정 파일 방식"·"훅 21개 중 범용 제품에 필요한 것/불필요한 것" 세 항목은 web 관점으로 교차 검증이 필요하다.
- [미확인] 새 리포에 이음오피스 코드를 가져오는 방식·시점 — m262는 "계획서 결론 뒤"로만 확정. 코어 저장소로 쓸지 제품 저장소로 쓸지(§4 옵션 B/C)는 미결.
- [미확인] 자동 업데이트 피드 정책 — 현재 꺼짐 상태이며 일반 제품에서는 필수(§6.5.2).
- [미확인] 서버가 어디까지 일반화돼야 하는지 — `bot-server`는 이 저장소 밖.

---

## 8. 결정이 필요한 질문 (한 번에)

**scott-air15에게**
1. ~~새 리포 이름·소유자·공개 범위~~ → **확정됨(m261·m262·m263)**: `scottnaddle/ieumoffice-enterprise`, private, 기본 브랜치 `main`, Apache-2.0 LICENSE + README만 있는 빈 리포. 저장소 설정 변경 불필요(답 m263).
2. **유비온오피스와 새 제품의 관계** — (a) 새 리포가 공통 코어 + 유비온 오버레이 둘 다, (b) 새 리포가 일반 제품 전용이고 공통 코어는 ubion-office에 남음, (c) 업스트림 추종을 별도 코어 저장소로. → §4 옵션 B/C 선택과 직결.
3. 대상 고객 규모(수십~수천 명?) — self-host 적합성 판단.
4. 배포形态: 클라우드 제공 vs 각 기업 자체 설치.

**개발·운영 결정**
5. 데아우 계정 모델을 OIDC로 대체할 때, `sub`(userSeq)·프로필·역할을 IdP 중립으로 바꾸는 계약 — 서버 쪽 결정 필요 (api 영역).
6. 훅 21개를 공통 코어에 남기고 양쪽 제품이 공유할지, 제품별로 갈라질지. → 업그레이드 비용을 결정한다.
7. 멀티테넌트를 언제引入할지(MVP는 self-host로 가도 되는지).

### 8.1 추가 결정 항목 (신규 리포 확정에 따라)

8. **브랜드·상표 — 제품명.** 리포 이름은 `ieumoffice-enterprise`로 확정되었으나, Apache-2.0 §6은 원 저작의 상호·상표·제품명 사용을 허용하지 않는다(§10 인용). 리포명·설명의 출처 표기는 허용 범위지만, **배포되는 앱의 제품명·로고는 별도여야 한다.** → 결정 필요: 새 제품의 상표명(예: `EnterpriseOffice`), 로고 제작(현재 `company/brand/icon`은 `UbionOffice` 기준 — `brand.json`의 `icon.source` 참조).
9. **자동 업데이트 피드.** 현재 꺼짐(`company/policy/build-hook.cjs` 주석). 일반 제품은 테넌트별 업데이트가 사실상 필수 → 자체 피드 운영 방식(제어판·패키지 저장소·수동 배포) 결정 필요.
10. **테넌트별 appId 규칙.** `brand.json`의 `appId`·`desktopName`·`winProgIdPrefix`가 동일하면 두 제품이 같은 컴퓨터에 동시 설치될 때 충돌한다. 유비온(`global.ubion.office`)과 일반 제품의 appId 분리 규칙 필요.
11. **새 리포의 첫 코드.** m262는 "이음오피스 코드는 계획서 결론 뒤"로 확정. 리포가 **공통 코어**가 되는지, **일반 제품 전용**이 되는지에 따라 §4의 구조 선택이 결정된다 → 이 결정이 §4 B/C를 가른다.
12. **설정 파일 위치 규칙.** 선례(`~/.config/ubion/*.env`)를 일반 제품으로 확장할 때 경로 규칙(`~/.config/<tenantId>/…`?)과 파일 모드(600)·경로 재정의 규칙을 어떻게 정할지.

---

## 9. 유비온오피스와의 관계 (공유 · 분리 기준)

| 영역 | 유비온 | 일반 제품 | 근거 |
|---|---|---|---|
| 업스트림 | 공유 | 공유 | 이음오피스 Apache-2.0 (§10) |
| 훅 21개 | 유지 | **공통 코어에서 공유** 권장 | §3.7 — 이중 병목 방지 |
| 데아우 인증 | 유지 | **OIDC로 교체** | §3.3 — 데아우는 유비온 그룹웨어 |
| 정책·브랜드 | `company.policy.json` 고정 | **테넌트 런타임 설정** | §3.4 — 핵심 분기점 |
| `ubion-proposal-*` 템플릿 | 유지 | 제외(테넌트 배포로 대체) | §3.6 |
| 브랜드 문자열 | '유비온' 고정 | 테넌트별 | §3.5 — `strings.ts` 중앙화 활용 |
| 서버 | `bot.ubion.global` | 기업별 자체 설치(추천) | §5 |

**분리 기준 한 줄**: **데아우·유비온 문자열·유비온 전용 템플릿은 유비온 오버레이로.** 나머지(업스트림 훅, `packages/company-policy`의 구조, 브릿지 패턴)는 공통 코어.

---

## 10. 라이선스 (Apache-2.0 · NOTICE)

[직접확인] 이 저장소는 Apache-2.0 (`LICENSE:2-4`, `LICENSE:190` "Copyright 2026 Mainfunc, Inc."). `NOTICE`의 "IeumOffice modifications" 절:

> "IeumOffice (https://github.com/pblsketch/openoffice) is a modified version of GenOffice (https://github.com/genspark-ai/genoffice), the work this file's opening notice refers to. Files of the original work have been changed, added and removed by the IeumOffice contributors; the repository history records each change. The modifications are licensed under the Apache License, Version 2.0, like the original work."

**Apache-2.0 §4(derivative works) 관점** [직접확인 LICENSE 조문 확인]:
- 수정·배포 **허용**. 수정본도 Apache-2.0으로 배포 가능.
- 조건: **라이선스·NOTICE·변경 사실 명시**(§4a/4b/4c), 원작자专利·상표권 부여 없음(§3), 보증 없음(§7).
- `NOTICE`는 §4d상 **파생 배포물에 반드시 포함**. 파생물은 원 NOTICE를 **복사**해야 하며 원 NOTICE를 "수정본으로 대체"할 수 없다. → 새 제품도 `NOTICE`의 "IeumOffice modifications" 절과 "GenOffice ... Copyright 2026 Mainfunc, Inc."을 **그대로 포함**해야 한다.
- **상표는 Apache-2.0이 부여하지 않는다** (§6). `NOTICE`도 명시: "The Apache License 2.0 grants no rights to the names or logos 'IeumOffice', '이음오피스' or 'GenOffice' (section 6)."
  → **새 제품은 '이음오피스'/'IeumOffice'/'GenOffice' 명칭·로고를 쓰면 안 된다.** 별도 제품명 필요 (가칭 `enterprise-office`는 **가칭일 뿐**).
- 서드파티: 슬라이드 템플릿 12종 = MIT(frontend-slides) · 폰트 = SIL OFL 1.1 · 내장 스킬 5종 = MIT/Apache-2.0 · Lucide = ISC/MIT · Roboto = Apache-2.0 · Unicode UCD = Unicode-3.0 · rhwp = MIT · hangul = BSD-3. → **모두 상용·재배포 가능하나 각 라이선스 문구를 유지·동봉**해야 한다. [직접확인 `NOTICE` 전문]

**⚠ 리포명에 대한 주의** [직접확인]: 확정된 리포 이름은 `ieumoffice-enterprise`다. Apache-2.0 §6은 라이선스 소유자의 상호·상표·제품명 사용 권한을 부여하지 않되, **원 저작의 출처를 설명하는 데 필요한 통상적 사용은 허용**한다. 리포명·설명에 "IeumOffice 기반"이라 쓰고 NOTICE를 그대로 복사하는 것은 §6이 허용하는 출처 표기 범위에 든다. 그러나 **"IeumOffice Enterprise"를 상용 제품명·로고로 쓰면 상표 사용 문제가 된다.** → §8 결정 항목으로 §12에 추가.

**결론** [추정]: 라이선스는 **장벽이 아니다.** Apache-2.0 파생물이므로 새 상용 제품으로 판매 가능하고, 전제조건은 (1) LICENSE+NOTICE 동봉·수정사실 명시 (2) 이음오피스/GenOffice 상표 미사용 (3) 서드파티 고지 유지. **지금 필요한 유일한 조치는 새 제품의 브랜드 자산을 만드는 것**이고, 그것은 [추정] `company/brand.json`이 이미 파라미터화돼 있어(`productName`·`appId`·`executableName`·`protocolName`·`icon`) **재사용 가능한 구조**다.

[직접확인] `LICENSE` §4(a)–(d) 전문 확인 — §4(a) 라이선스 사본 동봉 · §4(b) **수정 파일에 변경 사실 명시** · §4(c) 원작의 저작권·특허·상표·저작자 표시 유지(파생물과 무관한 것은 제외 가능) · §4(d) NOTICE의 저작자 표시를 **읽을 수 있는 사본으로** 포함(NOTICE 파일·소스/문서·표시 중 1곳 이상. NOTICE에 고유 저작자 표시를 추가할 수는 있어도 **NOTICE를 수정본으로 대체할 수 없음**). §6 전문: "This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file."

---

## 11. 조사 범위 · 하지 않은 것

- **읽기 전용만 했다.** 코드·서버·설치·저장소 설정 변경 없음. 커밋·푸시 없음. PR 없음 (m252).
- **열지 않은 것**: 비밀값·토큰·세션·env/secrets 파일. 서버는 상태·로그·문서만 봤다. 설치·빌드 실행 없음.
- **확인하지 못한 것**: §7 미확인 4건 + 지식 게이트웨이 내부 구현.
- **내 추정 vs 확인 구분**: §3.7의 훅 분류, §6의 기간·파일 수, §10의 "장벽이 아니다"는 모두 [추정]/[직접확인 LICENSE 조문] 기반 판단.
