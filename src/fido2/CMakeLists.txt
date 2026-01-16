idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS . ../../pico-fido/src ../../pico-openpgp/src
    REQUIRES esp_tinyusb mbedtls efuse pico-keys-sdk
)
idf_component_set_property(${COMPONENT_NAME} WHOLE_ARCHIVE ON)
