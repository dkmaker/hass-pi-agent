"""Pi Agent integration — registers pi_agent.ask service."""
import logging

import aiohttp
import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "pi_agent"
ADDON_HOST = "local-pi-agent"
ADDON_PORT = 9199
SERVICE_ASK = "ask"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("question"): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Pi Agent integration."""

    async def handle_ask(call: ServiceCall) -> None:
        """Handle pi_agent.ask service call — fire and forget."""
        question = call.data["question"]
        url = f"http://{ADDON_HOST}:{ADDON_PORT}/ask"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json={"question": question},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 202:
                        _LOGGER.info("Pi Agent accepted question")
                    else:
                        error = await resp.text()
                        _LOGGER.error(
                            "Pi Agent error (%s): %s", resp.status, error
                        )
        except aiohttp.ClientError as err:
            _LOGGER.error("Pi Agent connection error: %s", err)

    hass.services.async_register(
        DOMAIN,
        SERVICE_ASK,
        handle_ask,
        schema=SERVICE_SCHEMA,
    )

    _LOGGER.info("Pi Agent service registered")
    return True
