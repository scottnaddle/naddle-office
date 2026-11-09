# 나들오피스 (NaddleOffice)

나들오피스는 **이음오피스(IeumOffice)** 를 기반으로 만든 일반 기업용 오피스 앱입니다. 특정 회사에 종속되지 않고, 기업이 자기 환경의 인증·지식 소스·모델 게이트웨이·템플릿을 설정해 운영할 수 있는 것을 목표로 합니다.

- **내부 지식관리**: 사내 위키/문서 소스를 연결해 검색·열람
- **계정관리**: OIDC/SAML 등 기업 IdP와 역할·계정 관리
- **문서 템플릿 관리**: 기업별 템플릿 카탈로그 배포·갱신
- **배포**: 기업별 셀프호스트와 제공형 클라우드를 함께 지원하는 하이브리드 구조

이 저장소는 초기 개발 단계입니다. 계획과 범위는 [`docs/plan.md`](../docs/plan.md)를 참고하세요.

## 출처와 라이선스

이 저장소는 [IeumOffice](https://github.com/pblsketch/openoffice) 업스트림 `v0.12.11`을 기반으로 시작했습니다. IeumOffice는 [GenOffice](https://github.com/genspark-ai/genoffice)에서 파생된 Apache-2.0 프로젝트입니다.

- 라이선스: [Apache-2.0](../LICENSE)
- 업스트림 고지: [NOTICE](../NOTICE) (원문 유지)
- 나들오피스 고지: [NOTICE-NADDLE.md](../NOTICE-NADDLE.md)
- 이 문서는 GitHub에서 업스트림 `README.md`보다 먼저 표시됩니다. 루트 `README.md`·`README.en.md`는 업스트림 원문이며 이 저장소에서 수정하지 않습니다.

IeumOffice·GenOffice의 이름과 로고는 각 원저작자의 상표입니다. 이 프로젝트는 그 상표를 제품명이나 로고로 사용하지 않으며, Apache-2.0 §6이 허용하는 범위에서 출처를 설명하는 목적으로만 사용합니다.

---

# NaddleOffice

NaddleOffice is an enterprise office application built on **IeumOffice**. It is designed to be configured for each organization's own identity provider, knowledge source, model gateway, and document templates.

- **Internal knowledge**: connect and search company knowledge sources
- **Account management**: enterprise IdP (OIDC/SAML), roles, and account lifecycle
- **Template management**: organization-specific template catalogs and updates
- **Deployment**: self-hosted per organization or a managed cloud, in a hybrid structure

This repository is in early development. See [`docs/plan.md`](../docs/plan.md) for the plan and scope.

## Origin and license

This repository starts from [IeumOffice](https://github.com/pblsketch/openoffice) upstream `v0.12.11`. IeumOffice is an Apache-2.0 project derived from [GenOffice](https://github.com/genspark-ai/genoffice).

- License: [Apache-2.0](../LICENSE)
- Upstream notices: [NOTICE](../NOTICE) (kept verbatim)
- NaddleOffice notices: [NOTICE-NADDLE.md](../NOTICE-NADDLE.md)
- This file is shown by GitHub before the upstream `README.md`. The root `README.md` and `README.en.md` are upstream files and are not modified in this repository.

The names and logos of IeumOffice and GenOffice are trademarks of their respective owners. This project does not use them as a product name or logo; they are used only to describe origin, as permitted by Apache-2.0 §6.
