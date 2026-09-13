# Changelog

## [1.1.0](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.10...v1.1.0) (2026-09-13)


### Chores

* **beta:** sync tile to 1.1.0-beta.10 [skip ci] ([b789d05](https://github.com/dkmaker/hass-pi-agent/commit/b789d05b1cbeadf073897875bb422d81da5dfa3e))
* **main:** release 1.1.0 ([7483444](https://github.com/dkmaker/hass-pi-agent/commit/7483444c5bd210134d23b1fc3306069967632ddf))
* **main:** release 1.1.0 ([225d7e3](https://github.com/dkmaker/hass-pi-agent/commit/225d7e3fb51d1c430c2bbb02d8b8b9164f4cf657))
* release 1.1.0 ([1a76ca3](https://github.com/dkmaker/hass-pi-agent/commit/1a76ca3ba2fbca06203af9ead8455d30a2ef5bb9))

## [1.1.0-beta.10](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.9...v1.1.0-beta.10) (2026-09-13)


### Bug Fixes

* frame the HA agent as an assistant, not a developer ([819dc15](https://github.com/dkmaker/hass-pi-agent/commit/819dc1505759a187809063a9e9bbe3b81eccdfde))
* **webapp:** show drawer AI/theme actions on mobile only ([84538d9](https://github.com/dkmaker/hass-pi-agent/commit/84538d9d54cac6838d6cdc11607f2a36698660df))

## [1.1.0-beta.9](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.8...v1.1.0-beta.9) (2026-09-13)


### Bug Fixes

* keep the HA agent in scope — don't make changes unprompted ([9f07fb4](https://github.com/dkmaker/hass-pi-agent/commit/9f07fb4201e5c0eb6a72b4c1726265cde4f0d5d3))

## [1.1.0-beta.8](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.7...v1.1.0-beta.8) (2026-09-13)


### Features

* scope chat sessions per HA user (privacy) with parallel per-user sessions ([b5570b4](https://github.com/dkmaker/hass-pi-agent/commit/b5570b403015622dcb389717d32ba47140eba8c6))

## [1.1.0-beta.7](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.6...v1.1.0-beta.7) (2026-09-13)


### CI

* build add-on images with buildx on native runners (drop home-assistant/builder) ([2b3ab8a](https://github.com/dkmaker/hass-pi-agent/commit/2b3ab8a295d4256965709b0339d501a2e244624a))

## [1.1.0-beta.6](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.5...v1.1.0-beta.6) (2026-09-13)


### CI

* pin builder to 2026.02.1 (2026.06.0 has no builder image) ([73d2968](https://github.com/dkmaker/hass-pi-agent/commit/73d2968acc3b72a038abfe126646da8c6fa2bff3))

## [1.1.0-beta.5](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.4...v1.1.0-beta.5) (2026-09-13)


### Bug Fixes

* drawer — show AI settings & theme as controls, not chat rows ([df8733e](https://github.com/dkmaker/hass-pi-agent/commit/df8733e3c2ea607fb34a1ca77ba5aa40707cc670))

## [1.1.0-beta.4](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.3...v1.1.0-beta.4) (2026-09-13)


### Bug Fixes

* enforce a bash timeout — default 60s, hard cap 600s ([0474102](https://github.com/dkmaker/hass-pi-agent/commit/047410211a5792dcad338f2c96c6c74d450c7062))
* remove the unused Set up conventions row from chat history ([c9e7944](https://github.com/dkmaker/hass-pi-agent/commit/c9e794479e1c889ca2409ac0985a0c1e5d2360e4))
* restore the open session on reconnect ([719219c](https://github.com/dkmaker/hass-pi-agent/commit/719219cd35d45f4515b5bde2498c8a5a8f6fdfd7))

## [1.1.0-beta.3](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.2...v1.1.0-beta.3) (2026-09-13)


### Features

* center only the chat messages in a 900px column ([3a4f052](https://github.com/dkmaker/hass-pi-agent/commit/3a4f05254c96b316d680b2336ec3aa5ee5838880))
* mobile — hide the top header, move the menu to a bottom-left burger ([479a61d](https://github.com/dkmaker/hass-pi-agent/commit/479a61de9acfa73d6e1d3152e0977f119457f44a))

## [1.1.0-beta.2](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta.1...v1.1.0-beta.2) (2026-09-13)


### Features

* configure web search in-app (mirror the AI provider flow) ([3566003](https://github.com/dkmaker/hass-pi-agent/commit/35660039f45ad074a59cf22808fbd1799b45b565))


### Bug Fixes

* websearch validation test call needs max_tokens&gt;=16 (Perplexity) ([9e4c342](https://github.com/dkmaker/hass-pi-agent/commit/9e4c342b7bcbdd72574bdeffbe670c3e82ceb16a))

## [1.1.0-beta.1](https://github.com/dkmaker/hass-pi-agent/compare/v1.1.0-beta...v1.1.0-beta.1) (2026-09-13)


### Features

* add an optional web_search tool for the agent ([1b637ae](https://github.com/dkmaker/hass-pi-agent/commit/1b637ae9781420f9d22c97cb804930bd64b95900))

## [1.1.0-beta](https://github.com/dkmaker/hass-pi-agent/compare/v1.0.1...v1.1.0-beta) (2026-09-12)


### Features

* add a beta pre-release add-on channel ([#52](https://github.com/dkmaker/hass-pi-agent/issues/52)) ([66bbef4](https://github.com/dkmaker/hass-pi-agent/commit/66bbef4f3885ea69c7daafe3e434866810a41170))
* drive the beta channel with release-please (pre-release versioning) ([#53](https://github.com/dkmaker/hass-pi-agent/issues/53)) ([f937e16](https://github.com/dkmaker/hass-pi-agent/commit/f937e16fe7f83c521b9919d9fe21f1dc6bf47c58))
