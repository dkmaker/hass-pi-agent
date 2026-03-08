# Changelog

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
