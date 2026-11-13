# NaddleOffice notices

NaddleOffice (나들오피스) is an independent enterprise office application. It is based on IeumOffice (https://github.com/pblsketch/openoffice), an Apache-2.0 project derived from GenOffice (https://github.com/genspark-ai/genoffice).

This repository includes the upstream IeumOffice source and its original `LICENSE` and `NOTICE` files. The upstream `NOTICE` is kept verbatim. This file adds only the NaddleOffice attribution and does not replace the upstream notice.

IeumOffice and GenOffice may be trademarks or names of their respective owners. NaddleOffice does not claim any rights to those names or logos. They are used only to describe the origin of this work, as permitted by Apache-2.0 §6.

NaddleOffice additions are licensed under the Apache License, Version 2.0. See `LICENSE` for the full license text.

## Built-in skills: five in NOTICE, seven in builtin-skills.json

The upstream `NOTICE` is kept verbatim. Its "Built-in skills" section says that `apps/shell/resources/builtin-skills` holds "the five skills shipped with the app" and lists those five third-party skills with their sources and licenses: `meeting-minutes`, `internal-comms`, `humanizer`, `copy-editing` and `find-skills`.

`apps/shell/resources/builtin-skills/builtin-skills.json` lists seven skills. They are the same five third-party skills plus two skills that IeumOffice wrote later and licenses under Apache-2.0: `administration-report` and `administration-report-draft`. Their source in that file is `ieumoffice`. They are not third-party material, so the upstream `NOTICE` skills section does not list them. Both numbers are correct: five third-party skills, seven built-in skills in total. This file does not change the upstream `NOTICE` to say seven.

## Built-in template manifest

`packages/ui/src/authoring/builtin-templates.json` is the built-in template manifest. It is a separate ledger and is not part of the skill count above. It records, for each built-in template, its id, version, license, source, author, locale and, when a form file ships with it, the file path and its sha256.

- Document briefs (`document-brief`): 견적서, 품의서, 지출결의서, 회의록 and 업무 보고. Written by NaddleOffice, Apache-2.0. No form file yet.
- Slide designs (`slide-design`): the twelve designs that the upstream `NOTICE` already credits to frontend-slides (https://github.com/zarazhangrui/frontend-slides, MIT License, Copyright (c) 2025 Zara Zhang, read at commit 9906a34d640d2111f724544cbc50f7f130569ae1). The manifest only records their provenance; the attribution in the upstream `NOTICE` still applies.
- Form skills (`form-skill`): none are built in. This kind is reserved for organization template packs imported by the user.

The manifest does not include official Microsoft, Google or Hancom templates, fonts or forms, or forms from template marketplaces.
