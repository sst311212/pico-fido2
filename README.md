# Pico FIDO2

This project transforms your Raspberry Pi Pico or ESP32 microcontroller into an integrated FIDO Passkey **and** OpenPGP smartcard, functioning like a standard USB Passkey for authentication and as a smartcard for cryptographic operations.

---

## Features

Pico FIDO2 includes the following features:

### FIDO2 / U2F / WebAuthn

- CTAP 2.1 / CTAP 1
- WebAuthn
- U2F
- HMAC-Secret extension
- CredProtect extension
- User presence enforcement through physical button
- User verification with PIN
- Discoverable credentials (resident keys)
- Credential management
- ECDSA and EDDSA authentication
- Support for SECP256R1, SECP384R1, SECP521R1, SECP256K1 and Ed25519 curves
- App registration and login
- Device selection
- Support for vendor configuration
- Backup with 24 words
- Secure lock to protect the device from flash dumps
- Permissions support (MC, GA, CM, ACFG, LBW)
- Authenticator configuration
- minPinLength extension
- Self attestation
- Enterprise attestation
- credBlobs extension
- largeBlobKey extension
- Large blobs support (2048 bytes max)
- OATH (based on YKOATH protocol specification)
- TOTP / HOTP
- Yubikey One Time Password
- Challenge-response generation
- Emulated keyboard interface
- Button press generates an OTP that is directly typed
- Yubico YKMAN compatible
- Nitrokey nitropy and nitroapp compatible
- Secure Boot and Secure Lock in RP2350 and ESP32-S3 MCUs
- One Time Programming to store the master key that encrypts all resident keys and seeds.
- Rescue interface to allow recovery of the device if it becomes unresponsive or undetectable.
- LED customization with Pico Commissioner.

### OpenPGP Smartcard

- OpenPGP card specification v3.4
- 3 key slots (Signature, Encryption, Authentication)
- RSA (2048, 3072, 4096), Ed25519, Curve25519, ECDSA (NIST P-256, P-384, P-521)
- Key generation on device
- Key import/export
- PIN and Admin PIN protection
- Reset and Unblock functions
- Works with GnuPG, SSH, S/MIME, and compatible tools
- CCID over USB
- Compatible with major OS (Linux, Windows, macOS)
- Touch button for user presence confirmation (optional)
- Open source

---

## Security Considerations

Microcontrollers RP2350 and ESP32-S3 are designed to support secure environments when Secure Boot is enabled, and optionally, Secure Lock. These features allow a master key encryption key (MKEK) to be stored in a one-time programmable (OTP) memory region, which is inaccessible from outside secure code. This master key is then used to encrypt all private and secret keys on the device, protecting sensitive data from potential flash memory dumps.

**However**, the RP2040 microcontroller lacks this level of security hardware, meaning that it cannot provide the same protection. Data stored on its flash memory, including private or master keys, can be easily accessed or dumped, as encryption of the master key itself is not feasible. Consequently, if an RP2040 device is stolen, any stored private or secret keys may be exposed.

---

## Download

**If you own an ESP32-S3 board, go to ESP32 Flasher for flashing your Pico FIDO2.**

If you own a Raspberry Pico (RP2040 or RP2350), go to the Download page, select your vendor and model and download the proper firmware; or go to the Release page and download the UF2 file for your board.

Note that UF2 files are shipped with a dummy VID/PID to avoid license issues (FEFF:FCFD). If you plan to use it with other proprietary tools, you should modify Info.plist of CCID driver to add these VID/PID or use the Pico Commissioner.

You can use whatever VID/PID (i.e., 234b:0000 from FISJ), but remember that you are not authorized to distribute the binary with a VID/PID that you do not own.

Note that the pure-browser option Pico Commissioner is the most recommended.

---

## Build for Raspberry Pico

Before building, ensure you have installed the toolchain for the Pico and that the Pico SDK is properly located on your drive.

```
git clone https://github.com/youruser/pico-fido2
git submodule update --init --recursive
cd pico-fido2
mkdir build
cd build
PICO_SDK_PATH=/path/to/pico-sdk cmake .. -DPICO_BOARD=board_type -DUSB_VID=0x1234 -DUSB_PID=0x5678
make
```

Note that `PICO_BOARD`, `USB_VID` and `USB_PID` are optional. If not provided, `pico` board and VID/PID `FEFF:FCFD` will be used.

Additionally, you can pass the `VIDPID=value` parameter to build the firmware with a known VID/PID. The supported values are:

- `NitroHSM`
- `NitroFIDO2`
- `NitroStart`
- `NitroPro`
- `Nitro3`
- `Yubikey5`
- `YubikeyNeo`
- `YubiHSM`
- `Gnuk`
- `GnuPG`

After running `make`, the binary file `pico_fido2.uf2` will be generated. To load this onto your Pico board:

1. Put the Pico board into loading mode by holding the `BOOTSEL` button while plugging it in.
2. Copy the `pico_fido2.uf2` file to the new USB mass storage device that appears.
3. Once the file is copied, the Pico mass storage device will automatically disconnect, and the Pico board will reset with the new firmware.
4. A blinking LED will indicate that the device is ready to work.

## Driver

Pico FIDO2 uses the `HID` driver for FIDO and `CCID` for OpenPGP, both present in all major operating systems. It should be detected by all OS and browser/applications just like normal USB FIDO keys and smartcards.
