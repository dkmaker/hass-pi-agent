# Changelog

## [1.0.1](https://github.com/dkmaker/hass-pi-agent/compare/v1.0.0...v1.0.1) (2026-09-12)


### Features

* collapsible tool blocks with a mandatory agent reason ([f09166a](https://github.com/dkmaker/hass-pi-agent/commit/f09166ad8645c2ff583f9844c8f5488284d878cf))


### Bug Fixes

* anchor chat messages to the bottom (normal chat layout) ([41b8655](https://github.com/dkmaker/hass-pi-agent/commit/41b8655d83ec0219785cc626d31bbd44175427b4))
* call Supervisor API directly in the add-on (WS proxy is unauthorized) ([a0bfee9](https://github.com/dkmaker/hass-pi-agent/commit/a0bfee92ac68e248894c59f6648199126f146405))
* empty details:{} rendered blank tool blocks (ha_yaml/notes/mutations) ([c8fa059](https://github.com/dkmaker/hass-pi-agent/commit/c8fa059ee5fdebaf518db0674c5bd944a45d6a0d))
* ha_yaml list returned empty text for a domain filter with configs ([e06a1d1](https://github.com/dkmaker/hass-pi-agent/commit/e06a1d100d8ef8f9fbf35c0653b0122d53301b49))
* hotfix 1.0.1 — Supervisor API, chat layout, empty/blank tool blocks, collapsible tools ([9da7fae](https://github.com/dkmaker/hass-pi-agent/commit/9da7fae920f2dfa5fc10d9dac53df97bf2b3e869))


### Chores

* release 1.0.1 ([88ac524](https://github.com/dkmaker/hass-pi-agent/commit/88ac5243dcd5fcca77dc01f2b1014c4d34d74281))

## [1.0.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.13.1...v1.0.0) (2026-09-12)


### Features

* **addon:** package embedded web chat engine; cut over from ttyd + pi-service ([8699a08](https://github.com/dkmaker/hass-pi-agent/commit/8699a084ee68017e89c9083cb6bf84d544ac1a00))
* custom markdown schemes for entity chips + inline icons ([e08b3d5](https://github.com/dkmaker/hass-pi-agent/commit/e08b3d5a27e6419dd52d856a2973e5642e76fc03))
* defineHaTool base registrar + migrate devices/areas/automations to structured render ([4c18bf3](https://github.com/dkmaker/hass-pi-agent/commit/4c18bf35a44edd6b45f458bdea2cb471145496a7))
* group AI config under a collapsed section + document manual-edit caveat ([b9fce10](https://github.com/dkmaker/hass-pi-agent/commit/b9fce10b6b59cbcb92432e97734c68d54c9f5425))
* in-app provider/model/API-key setup (welcome + COG), validation-gated ([12f3910](https://github.com/dkmaker/hass-pi-agent/commit/12f39107526fbdda350e467aca143caf6ed4b451))
* locale-aware relative-time column type (reltime) ([6eb924e](https://github.com/dkmaker/hass-pi-agent/commit/6eb924e2fee8757fe3361ca825dab5713d23aeb7))
* mark structured tool results as already-rendered to prevent echo ([019f77b](https://github.com/dkmaker/hass-pi-agent/commit/019f77bb20e141650d1de8c3a90b92f4969494c7))
* migrate blueprints + shopping_list to structured render ([a78bd98](https://github.com/dkmaker/hass-pi-agent/commit/a78bd98213527fec893d26dbefebe52df39848bd))
* migrate integrations/notifications/tags/categories to structured render ([021cbf3](https://github.com/dkmaker/hass-pi-agent/commit/021cbf311fc94c8e8596ebb5b2039d21232f3ea1))
* migrate scripts/scenes/labels/zones/people to structured render ([b08256a](https://github.com/dkmaker/hass-pi-agent/commit/b08256a9b1693cef10d27d7f290a016cd46f25c5))
* persist AI config to Supervisor options (survives restart/reinstall) ([490d247](https://github.com/dkmaker/hass-pi-agent/commit/490d247eaabc5fec82f5566d8f81abf6973ff62b))
* Pi Agent 1.0.0 — web chat engine, in-app setup, rich tool rendering ([3e5e59b](https://github.com/dkmaker/hass-pi-agent/commit/3e5e59b780d73e5bbcc73e102596170df036eb96))
* **server:** embedded pi-SDK round-trip proof against live VM ([ba9ea93](https://github.com/dkmaker/hass-pi-agent/commit/ba9ea9373b02d15a4d8c39d67061709ef83be0b5))
* **server:** in-process pi_agent.ask (queued fresh-context one-shot + logbook) ([9cde965](https://github.com/dkmaker/hass-pi-agent/commit/9cde96552672d46900e21fae7a002f9677a4b698))
* **server:** model from add-on config only (PI_DEFAULT_PROVIDER/PI_DEFAULT_MODEL) ([06e2fd4](https://github.com/dkmaker/hass-pi-agent/commit/06e2fd4caa97a347cc063af14a05099ba12efbf5))
* **server:** real engine WS on /ws + thinking-spinner events; npm run engine ([0579282](https://github.com/dkmaker/hass-pi-agent/commit/057928243703bb03ebb705e6e9b745502064c514))
* **sessions:** real /new, /sessions list + resume via SessionManager ([c49e50d](https://github.com/dkmaker/hass-pi-agent/commit/c49e50d6e522c663d9621774a821f355fb463b95))
* teach the agent entity tokens (system prompt + tool-content emission) ([dede1f1](https://github.com/dkmaker/hass-pi-agent/commit/dede1f1b57e051bed23abe7051625d92557f7178))
* unified structured tool-render layer (foundation + ha_entities proof) ([b11a6b3](https://github.com/dkmaker/hass-pi-agent/commit/b11a6b3843d1e727d4a88ea962438d692b5dcae1))
* **webapp:** /setup wizard — first-class stepped onboarding ([d3a1eed](https://github.com/dkmaker/hass-pi-agent/commit/d3a1eedeb2b8dfa4bb306b603c64eff9328f2796))
* **webapp:** /setup wizard persists conventions via ha_policies ([82d1507](https://github.com/dkmaker/hass-pi-agent/commit/82d1507d7f562749d8143ece5565718e61305da0))
* **webapp:** add Norwegian, Swedish, German GUI locales ([02f5a0b](https://github.com/dkmaker/hass-pi-agent/commit/02f5a0bcfa1dd7df44ed1532dd3fbcc189b0fb12))
* **webapp:** auto session topic + session-list pagination ([3c9c2d6](https://github.com/dkmaker/hass-pi-agent/commit/3c9c2d66132392d2967e24256c3254ed5e2831f4))
* **webapp:** explicit light/dark/auto theme toggle ([0281c7e](https://github.com/dkmaker/hass-pi-agent/commit/0281c7e904d6f93b77db54fc7ac7e4c8b513b16b))
* **webapp:** follow Home Assistant's active theme when embedded (ingress bridge) ([2ddb8d0](https://github.com/dkmaker/hass-pi-agent/commit/2ddb8d09b7d0dc63a750ddeac5338d09fa895422))
* **webapp:** hide thinking content — show animated 'Thinking …' indicator ([1e31c68](https://github.com/dkmaker/hass-pi-agent/commit/1e31c68389aef0f1f38bd96d6c77d89fec795b74))
* **webapp:** hide tool args by default; (i) button opens raw request/response modal ([e0a5734](https://github.com/dkmaker/hass-pi-agent/commit/e0a57349482fc765a502490948da75fe5a103163))
* **webapp:** live stats overview widget on the new-chat screen ([0085aa0](https://github.com/dkmaker/hass-pi-agent/commit/0085aa0c207c45beeae6dd23b6a7c9c53cf096a2))
* **webapp:** localize GUI (Danish/English) ([704cc38](https://github.com/dkmaker/hass-pi-agent/commit/704cc386a68676ec91da82ced2a2b797a3bbdb4b))
* **webapp:** localized tool-call header with icon + name + tooltip (Phase 1) ([270a130](https://github.com/dkmaker/hass-pi-agent/commit/270a130eb8ab3c7964079415f0dd740b2b267c29))
* **webapp:** mock chat app + mock WS server (Lit + @material/web, HA MD3) ([428933b](https://github.com/dkmaker/hass-pi-agent/commit/428933b9257ab315fe8773064919e4944ef64b29))
* **webapp:** real MDI icons via @mdi/js, drop emojis ([51b9c06](https://github.com/dkmaker/hass-pi-agent/commit/51b9c06980a73217600c3114ff7b6ca4034882b1))
* **webapp:** render markdown headings (#..######) ([e018ee2](https://github.com/dkmaker/hass-pi-agent/commit/e018ee239d788bee7721a1a947824c549dd603ec))
* **webapp:** render tool output as markdown (tables/lists) + drop empty bubbles ([540901d](https://github.com/dkmaker/hass-pi-agent/commit/540901df7cf04f37a91fdd7909e3f9171b08c832))
* **webapp:** session drawer (/sessions) + new chat (/new) ([58e9f1e](https://github.com/dkmaker/hass-pi-agent/commit/58e9f1e596d26b19309f4a385b43d6b86776b391))
* **webapp:** slash-command suggestions when composer is just '/' ([de9087c](https://github.com/dkmaker/hass-pi-agent/commit/de9087ca5c7685612376e295f4e414395b27ad22))
* **webapp:** thinking indicator sits on the background (no bubble), smaller ([60e5eb2](https://github.com/dkmaker/hass-pi-agent/commit/60e5eb2aaa299f1a7ea586f32d7110baa817a48c))


### Bug Fixes

* don't repeat welcome title in provider-setup head ([22e7ef7](https://github.com/dkmaker/hass-pi-agent/commit/22e7ef76029278a917b032dea7774ebe8603723b))
* reject invalid keys in validation + restore last-good key on failure ([3462c57](https://github.com/dkmaker/hass-pi-agent/commit/3462c57d98398821106be4612b2dc53c8a29bb0f))
* **server:** isolate auth from global ~/.pi — API keys from add-on config only ([7d5169c](https://github.com/dkmaker/hass-pi-agent/commit/7d5169cff2141ec9778cf92c8e1aa88b89ee9913))
* **webapp:** composer input is single-line height (matches send button) at rest ([8119ab3](https://github.com/dkmaker/hass-pi-agent/commit/8119ab3b0ded204025f72b8249b6635c3b3d5276))
* **webapp:** enable touch scrolling of history on iOS Safari ([ec74613](https://github.com/dkmaker/hass-pi-agent/commit/ec74613bcd7c3eadd98d16d83a3705cead57125f))
* **webapp:** fill full panel width (remove 860px max-width cap) ([779b947](https://github.com/dkmaker/hass-pi-agent/commit/779b947e0941fe1c9855adafd79c92283663c821))
* **webapp:** generate session topic in the user's language ([1d9d2ef](https://github.com/dkmaker/hass-pi-agent/commit/1d9d2efa02f95098192f2f5ef1511cb56f9648d6))
* **webapp:** ingress-relative WebSocket URL ([648cdc5](https://github.com/dkmaker/hass-pi-agent/commit/648cdc5581ab88e58e3fc3ed3e19b9c41ec6b663))
* **webapp:** no-store on index.html so refresh always gets latest build ([44d5aae](https://github.com/dkmaker/hass-pi-agent/commit/44d5aae5d8b4479f28c00f0354f5a137993c7832))
* **webapp:** set box-sizing inside shadow roots (composer + tool-block) ([f4d204f](https://github.com/dkmaker/hass-pi-agent/commit/f4d204fd9a31658a64e1eb61319420824915e7c1))
* **webapp:** sync header height with HA (--header-height bridge) ([a3226d4](https://github.com/dkmaker/hass-pi-agent/commit/a3226d483494ee77b204f0b28ea02984d6f0d17b))


### Code Refactoring

* **extension+server:** embed system prompt in code; load HA extension explicitly ([119fecf](https://github.com/dkmaker/hass-pi-agent/commit/119fecf41b2042720c91edad4b3801eb2d65ade3))


### Chores

* ignore .pi/lean.json (machine-local, not committed) ([bb36748](https://github.com/dkmaker/hass-pi-agent/commit/bb36748fa28b8777c4852bc745abeb49633107df))
* release Pi Agent 1.0.0 ([300cb49](https://github.com/dkmaker/hass-pi-agent/commit/300cb492feb09cb09e953a9fafa82c9b85631c80))
* remove unused hide_thinking option (web engine always hides thinking) ([be1ce07](https://github.com/dkmaker/hass-pi-agent/commit/be1ce0754baa3251f7f408997e9870f570d306da))
* track .pi/lean.json ruleset (declared committed, travels via git) ([0548bc7](https://github.com/dkmaker/hass-pi-agent/commit/0548bc733a5e4ef1740fcc63e2b05c1ddbe706f8))

## [0.13.1](https://github.com/dkmaker/hass-pi-agent/compare/v0.13.0...v0.13.1) (2026-09-11)


### Bug Fixes

* ha_yaml AST writer (no more YAML corruption) + clearer ha_scripts update error ([cad3d6e](https://github.com/dkmaker/hass-pi-agent/commit/cad3d6e9b211b986f77a4fe9745637647c3ab509))
* **ha-scripts:** update reports the real cause, not a blanket 'not found' ([815f910](https://github.com/dkmaker/hass-pi-agent/commit/815f910fc065ce92340d2a99ac61415d79b8818a))
* **ha-yaml:** mutate YAML via library AST, never by line-splicing ([2aaf874](https://github.com/dkmaker/hass-pi-agent/commit/2aaf8746c69ee2ab451c8355dd9b6c4e250100cb))

## [0.13.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.12.1...v0.13.0) (2026-09-11)


### Features

* hide_thinking option, container-only write-guard, resume session on start ([3a79c48](https://github.com/dkmaker/hass-pi-agent/commit/3a79c486d602e135a7dfe487a5c48921f7a6429f))

## [0.12.1](https://github.com/dkmaker/hass-pi-agent/compare/v0.12.0...v0.12.1) (2026-09-11)


### Bug Fixes

* coerce stringified object tool-params (GLM tool-arg serialization) ([0b366af](https://github.com/dkmaker/hass-pi-agent/commit/0b366afe3ef5d2dda8f8ed150810c43ca538722c))
* coerce stringified object tool-params before schema validation ([5e1879d](https://github.com/dkmaker/hass-pi-agent/commit/5e1879d3f1863c096fd0ae9c070c7d63e53766b3))

## [0.12.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.11.0...v0.12.0) (2026-09-11)


### Features

* add filesystem write-guard for built-in write/edit/bash tools ([19b7819](https://github.com/dkmaker/hass-pi-agent/commit/19b7819e54a34c88ad799ce748fbf123f5773ecc))
* add write_guard config options + user docs ([73dd9ea](https://github.com/dkmaker/hass-pi-agent/commit/73dd9ea27c87d992239c56a8035f9c219ab25585))
* filesystem write-guard + agent scratch dir ([1209ba0](https://github.com/dkmaker/hass-pi-agent/commit/1209ba075103a232be99f34c3a131f75493fd3e0))
* move agent cwd + data to /homeassistant/agent scratch dir ([32c7c64](https://github.com/dkmaker/hass-pi-agent/commit/32c7c64fda0cccab26726c389b41391c4d0f3acd))
* teach write boundaries + ha_notes responsibility in system prompt ([59b5c02](https://github.com/dkmaker/hass-pi-agent/commit/59b5c029854030a2c85321fbe355656d5a6edb39))


### Bug Fixes

* resolve write allowlist fresh + honor declared-but-missing includes ([2a21250](https://github.com/dkmaker/hass-pi-agent/commit/2a21250790131b0e40c2c76f82d8d7a72c941922))

## [0.11.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.10.2...v0.11.0) (2026-09-11)


### Features

* agent notes and YAML entity manager tools ([b1e22cd](https://github.com/dkmaker/hass-pi-agent/commit/b1e22cdd7cdad29541de917d7b2ac5cafaf22bd0))
* automatic pre-mutation backups with JSONL changelog ([27e7ae2](https://github.com/dkmaker/hass-pi-agent/commit/27e7ae2e9bb0956b41e1952c20f75ed5925dc155))
* dedicated password fields for API keys with translations ([18c4b7f](https://github.com/dkmaker/hass-pi-agent/commit/18c4b7f937116764278ee6753e89a5fa823cfc5d))
* reconcile stale branches, bump SDK 0.85.1, native tool prompts ([fd2d04e](https://github.com/dkmaker/hass-pi-agent/commit/fd2d04e44e6619fb4f530e9900a98c0b2d14173c))


### Bug Fixes

* add label and ha_tool_docs pointer to new tools ([740e789](https://github.com/dkmaker/hass-pi-agent/commit/740e7895f3467833f98cc2468dbd0ea1e5ad5c6c))


### Code Refactoring

* native promptSnippet/promptGuidelines, remove ha_tool_docs and questionnaire ([9464d63](https://github.com/dkmaker/hass-pi-agent/commit/9464d635a43eb87b1b23f0c5afe827dbf8254910))


### Chores

* bump pi coding agent SDK 0.78.0 -&gt; 0.85.1 ([042ad81](https://github.com/dkmaker/hass-pi-agent/commit/042ad812884cdda5cfbc997f39ca72e469bcec04))
* **deps:** bump actions/checkout from 6 to 7 ([53df1ad](https://github.com/dkmaker/hass-pi-agent/commit/53df1ad8205958d7b927ecd660f570415aed6010))
* **deps:** bump actions/checkout from 6 to 7 ([ab8371e](https://github.com/dkmaker/hass-pi-agent/commit/ab8371e4ecfdce4c2a4cb8d81f15bc9fa3af6b42))
* gitignore .pi/lean.json (machine-local per user preference) ([bcd25fe](https://github.com/dkmaker/hass-pi-agent/commit/bcd25fe70394d967d4e1eb21e5e85e525e560fb2))
* move dev scripts from skill to dev-scripts/, rewrite deploy workflow ([6c8637b](https://github.com/dkmaker/hass-pi-agent/commit/6c8637b99e6a7062be999f4b798a6deff556bf73))
* pin ha-core/ha-frontend submodules to release tags, refresh schemas ([b8c8a6b](https://github.com/dkmaker/hass-pi-agent/commit/b8c8a6bec9b0985554167c81e6e722e31a14c44b))
* pin submodules to release tags (2026.9.1), refresh schemas ([90bcf19](https://github.com/dkmaker/hass-pi-agent/commit/90bcf1960e10fbde6fdc0bdd5511f19c3814076e))
* pre-trust /homeassistant and skip pi version check in add-on ([4eb210f](https://github.com/dkmaker/hass-pi-agent/commit/4eb210f15d7d2e65710a63f90f56d41d41d3ada1))
* purge unused pi planner/package/git state files ([3d2f37a](https://github.com/dkmaker/hass-pi-agent/commit/3d2f37aeceee1d4dea1caf1d9c2eeb5180afd10d))
* purge unused pi planner/package/git state files ([8081295](https://github.com/dkmaker/hass-pi-agent/commit/8081295c8ba94976c71eb9b9b5cbb8d8785ddc81))
* remove vestigial docs/homeassistant mirror ([f22a851](https://github.com/dkmaker/hass-pi-agent/commit/f22a8515ba1ec68b5f87af6f211e0226f4228d5a))
* surface refactor + chore commits in release changelog ([4ad400d](https://github.com/dkmaker/hass-pi-agent/commit/4ad400d8d1f01901138342431fb3bcf226f12c49))

## [0.10.2](https://github.com/dkmaker/hass-pi-agent/compare/v0.10.1...v0.10.2) (2026-05-30)


### Bug Fixes

* resolve HA Core version from /core/info instead of supervisor info ([4d5d31c](https://github.com/dkmaker/hass-pi-agent/commit/4d5d31c1fbde61d5c1a40a9f56e6ca7e46b63908))

## [0.10.1](https://github.com/dkmaker/hass-pi-agent/compare/v0.10.0...v0.10.1) (2026-05-30)


### Bug Fixes

* migrate to [@earendil-works](https://github.com/earendil-works) pi 0.78.0 and typebox 1.x ([ab0a0d2](https://github.com/dkmaker/hass-pi-agent/commit/ab0a0d25ead734e01074619fc7a770c997a60ac3))

## [0.10.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.9.2...v0.10.0) (2026-03-09)


### Features

* add HA status line in TUI footer and MQTT client tools ([#28](https://github.com/dkmaker/hass-pi-agent/issues/28)) ([25e8bc7](https://github.com/dkmaker/hass-pi-agent/commit/25e8bc754f343b06d9bf96d898ed3d3438391f29))


### Bug Fixes

* clean up legacy extension copy from volume on startup ([#25](https://github.com/dkmaker/hass-pi-agent/issues/25)) ([61cba5a](https://github.com/dkmaker/hass-pi-agent/commit/61cba5a15bc65e60980e35d3d7d92c3c59b6251b))
* policy [object Object] rendering and entity update undefined ([#27](https://github.com/dkmaker/hass-pi-agent/issues/27)) ([51a1268](https://github.com/dkmaker/hass-pi-agent/commit/51a126841e36efc6541eee5c0c7f006134e35cd5))

## [0.9.2](https://github.com/dkmaker/hass-pi-agent/compare/v0.9.1...v0.9.2) (2026-03-08)


### Bug Fixes

* load extension from Docker image via --extension flag ([#23](https://github.com/dkmaker/hass-pi-agent/issues/23)) ([f3675ee](https://github.com/dkmaker/hass-pi-agent/commit/f3675eee9a205ef199212092828d2fec0c99d85c))

## [0.9.1](https://github.com/dkmaker/hass-pi-agent/compare/v0.9.0...v0.9.1) (2026-03-08)


### Bug Fixes

* ensure release-please triggers Docker build automatically ([#20](https://github.com/dkmaker/hass-pi-agent/issues/20)) ([89cde15](https://github.com/dkmaker/hass-pi-agent/commit/89cde15cfd74c381a4d7254d5911abcadb201ef0))
* sync extension source into addon build context before deploy ([#22](https://github.com/dkmaker/hass-pi-agent/issues/22)) ([53a6f51](https://github.com/dkmaker/hass-pi-agent/commit/53a6f516965039c24c89667f167cab33c3147890))

## [0.9.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.8.0...v0.9.0) (2026-03-08)


### Features

* align output formatting across all 34 HA tools ([#17](https://github.com/dkmaker/hass-pi-agent/issues/17)) ([c2c18cd](https://github.com/dkmaker/hass-pi-agent/commit/c2c18cddc239f812010484774047374d919c5e5d))


### Bug Fixes

* add missing extension files (ha-policies, questionnaire, lib/policies) ([#18](https://github.com/dkmaker/hass-pi-agent/issues/18)) ([36cb0c5](https://github.com/dkmaker/hass-pi-agent/commit/36cb0c5827e3fd9f4ac01a451e51da5da535711c))
* add programmatic confirmation gate to all destructive operations ([234d41d](https://github.com/dkmaker/hass-pi-agent/commit/234d41d712a06fa81fc9e7b0f084d8932a310a0a))
* add programmatic confirmation gate to all destructive operations ([d13e9c1](https://github.com/dkmaker/hass-pi-agent/commit/d13e9c133183a39c968713af7c8fb8b9035670f5))

## [0.8.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.7.0...v0.8.0) (2026-03-08)


### Features

* add ha_tool_docs, slim tool descriptions, addon-side context gathering ([fba79a3](https://github.com/dkmaker/hass-pi-agent/commit/fba79a38e2f6b1c0bfdd4ffcca236ae7e4f96025))
* add ha_tool_docs, slim tool descriptions, addon-side context gathering ([2f33e0f](https://github.com/dkmaker/hass-pi-agent/commit/2f33e0f51f9a446cf6670f7b2c10ead4ce75c95b))


### Bug Fixes

* trigger Docker build on release publish instead of tag push ([e0d6482](https://github.com/dkmaker/hass-pi-agent/commit/e0d648239adc5f6c85e2c8dc9e1604cbd8f8d506))
* trigger Docker build on release publish instead of tag push ([a438c4b](https://github.com/dkmaker/hass-pi-agent/commit/a438c4b3fbd82e064eb8d2404c9677bd1e1511fd))

## [0.7.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.6.0...v0.7.0) (2026-03-08)


### Features

* show visible startup status message with mock fallback for dev mode ([bd4cb92](https://github.com/dkmaker/hass-pi-agent/commit/bd4cb9293199c6997bb4ab0da319a5a001877cbf))
* show visible startup status message with mock fallback for dev mode ([ee76315](https://github.com/dkmaker/hass-pi-agent/commit/ee7631583cd99ab44b95fd1355bb0ba6230daead))

## [0.6.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.5.0...v0.6.0) (2026-03-08)


### Features

* add 13 new tools, slim AGENTS.md (v0.5.0) ([e6e831f](https://github.com/dkmaker/hass-pi-agent/commit/e6e831f92d59224794de36a3fd6ae54acb61d33e))
* add card schema extractor for Lovelace dashboard cards ([1a0c1bf](https://github.com/dkmaker/hass-pi-agent/commit/1a0c1bfce225bf814146cf61c76740b3927c40fc))
* add ha_addons, ha_backups, ha_system tools ([d30e6d4](https://github.com/dkmaker/hass-pi-agent/commit/d30e6d4211802268765856124006d78dd638b340))
* add ha_dashboards tool for Lovelace dashboard management ([d422a0f](https://github.com/dkmaker/hass-pi-agent/commit/d422a0ff758e9f15a88df6e2f42b2e0ef7b9a261))
* add ha_docs tool with shipped index + on-demand content ([50b1c52](https://github.com/dkmaker/hass-pi-agent/commit/50b1c52c8cba7038e85829b77bba57144f92fde9))
* add ha_graph tool — entity & configuration relationship graph engine ([3d93361](https://github.com/dkmaker/hass-pi-agent/commit/3d93361bda2f9b30e64044851451eee54cb88bc7))
* add pagination to ha_docs get action (offset + max_lines) ([1c342b4](https://github.com/dkmaker/hass-pi-agent/commit/1c342b49fccdc5e3c0f106a19699cb12243b3367))
* add pi_agent.ask service via custom component ([a643d1d](https://github.com/dkmaker/hass-pi-agent/commit/a643d1d850a9fcbc21bac81d3f394317f6e86570))
* add regenerate-ids action to ha_entities tool ([f9f9ea0](https://github.com/dkmaker/hass-pi-agent/commit/f9f9ea015543b44dbce4eb94b814de54c5281023))
* add repository.yaml for HA add-on store ([1adee16](https://github.com/dkmaker/hass-pi-agent/commit/1adee16623d734a5e1ec1630d330bdccff45f192))
* build Pi Agent Docker add-on with s6-overlay services ([a40e6cb](https://github.com/dkmaker/hass-pi-agent/commit/a40e6cb617b17a970f73ef7d8f287f5ce3e992df))
* configurable provider/model for pi_agent.ask service ([3a70a0d](https://github.com/dkmaker/hass-pi-agent/commit/3a70a0dfeee71f29a5c8acc75c902da014018fc6))
* configurable provider/model for pi_agent.ask service ([dbf232f](https://github.com/dkmaker/hass-pi-agent/commit/dbf232f5f193fbfec555a8c54eabec55943dcd06))
* dynamic context injection, system prompt, tmux fix, pin pi version ([2c7fc79](https://github.com/dkmaker/hass-pi-agent/commit/2c7fc791c15108ca0ea8dbcf0c52ac6f3d5cca59))


### Bug Fixes

* tmux extended-keys-format csi-u for Pi compatibility ([947cb00](https://github.com/dkmaker/hass-pi-agent/commit/947cb007a4e618ff6907406e8beb182d5009db8a))
* use Git Trees API for docs index (no 1000-item limit), fetch docs too ([1ea4b07](https://github.com/dkmaker/hass-pi-agent/commit/1ea4b07cadc674dcc9fdf86bc9f6ff632623f579))
* use supervisorApi (WebSocket) for context gathering, add icon ([17bd4e9](https://github.com/dkmaker/hass-pi-agent/commit/17bd4e964ea1ff17befbfed6d515856581cd0e6f))

## [0.2.0](https://github.com/dkmaker/hass-pi-agent/compare/v0.1.13...v0.2.0) (2026-03-08)


### Features

* add card schema extractor for Lovelace dashboard cards ([1a0c1bf](https://github.com/dkmaker/hass-pi-agent/commit/1a0c1bfce225bf814146cf61c76740b3927c40fc))
* add ha_addons, ha_backups, ha_system tools ([d30e6d4](https://github.com/dkmaker/hass-pi-agent/commit/d30e6d4211802268765856124006d78dd638b340))
* add ha_dashboards tool for Lovelace dashboard management ([d422a0f](https://github.com/dkmaker/hass-pi-agent/commit/d422a0ff758e9f15a88df6e2f42b2e0ef7b9a261))
* add ha_docs tool with shipped index + on-demand content ([50b1c52](https://github.com/dkmaker/hass-pi-agent/commit/50b1c52c8cba7038e85829b77bba57144f92fde9))
* add ha_graph tool — entity & configuration relationship graph engine ([3d93361](https://github.com/dkmaker/hass-pi-agent/commit/3d93361bda2f9b30e64044851451eee54cb88bc7))
* add pagination to ha_docs get action (offset + max_lines) ([1c342b4](https://github.com/dkmaker/hass-pi-agent/commit/1c342b49fccdc5e3c0f106a19699cb12243b3367))
* add regenerate-ids action to ha_entities tool ([f9f9ea0](https://github.com/dkmaker/hass-pi-agent/commit/f9f9ea015543b44dbce4eb94b814de54c5281023))
* add repository.yaml for HA add-on store ([1adee16](https://github.com/dkmaker/hass-pi-agent/commit/1adee16623d734a5e1ec1630d330bdccff45f192))
* build Pi Agent Docker add-on with s6-overlay services ([a40e6cb](https://github.com/dkmaker/hass-pi-agent/commit/a40e6cb617b17a970f73ef7d8f287f5ce3e992df))
* dynamic context injection, system prompt, tmux fix, pin pi version ([2c7fc79](https://github.com/dkmaker/hass-pi-agent/commit/2c7fc791c15108ca0ea8dbcf0c52ac6f3d5cca59))


### Bug Fixes

* tmux extended-keys-format csi-u for Pi compatibility ([947cb00](https://github.com/dkmaker/hass-pi-agent/commit/947cb007a4e618ff6907406e8beb182d5009db8a))
* use Git Trees API for docs index (no 1000-item limit), fetch docs too ([1ea4b07](https://github.com/dkmaker/hass-pi-agent/commit/1ea4b07cadc674dcc9fdf86bc9f6ff632623f579))
* use supervisorApi (WebSocket) for context gathering, add icon ([17bd4e9](https://github.com/dkmaker/hass-pi-agent/commit/17bd4e964ea1ff17befbfed6d515856581cd0e6f))

## Changelog
