const PHY_VIDPID                    = 0x0;
const PHY_LED_GPIO                  = 0x4;
const PHY_LED_BTNESS                = 0x5;
const PHY_OPTS                      = 0x6;
const PHY_UP_BTN                    = 0x8;
const PHY_USB_PRODUCT               = 0x9;
const PHY_ENABLED_CURVES            = 0xA;
const PHY_ENABLED_USB_ITF           = 0xB;
const PHY_LED_DRIVER                = 0xC;

const PHY_OPT_WCID                  = 0x1;
const PHY_OPT_DIMM                  = 0x2;
const PHY_OPT_DISABLE_POWER_RESET   = 0x4;
const PHY_OPT_LED_STEADY            = 0x8;
const PHY_OPT_LED_RAINBOW           = 0x10;

const PHY_CURVE_SECP256K1           = 0x8;

class Rescue {
    #key = undefined;
    #data = undefined;

    constructor(key) {
        this.#key = key;
    }

    get Data() {
        return this.#data;
    }

    async Select() {
        if (this.#key.Select == this) {
            return this.#data;
        }
        const aid = [ 0xA0, 0x58, 0x3F, 0xC1, 0x9B, 0x7E, 0x4F, 0x21 ];
        const apdu = [ 0x00, 0xA4, 0x04, 0x04, aid.length, ...aid, 0x00 ];
        return this.#key.IccPowerOn()
            .then(_ => this.#key.XfrBlock(apdu))
            .then(resp => {
                this.#key.Select = this;
                this.#data = new Uint8Array(resp);
                console.log("Selected Rescue Applet");
                return resp;
            });
    }

    JsonData(data) {
        const PICO_MCU = [ "RP2040", "RP2350", "ESP32", "EMULATION" ];
        const PICO_PRODUCT = [ "Pico Key SDK", "Pico HSM", "Pico Fido", "Pico OpenPGP" ];
        return {
            "platform": PICO_MCU[data[0]],
            "product": PICO_PRODUCT[data[1]],
            "version": `${data[2]}.${data[3]}`,
            "serial": data.slice(4).toHex().toUpperCase()
        };
    }

    async GetData(getJson) {
        if (!this.#data) {
            await this.Select();
        }
        if (getJson) {
            return this.JsonData(this.#data);
        }
        return this.#data;
    }

    async Phy_Write(data) {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1C, 1, 0, data.length, ...data, 0 ]))
        .then(_ => console.log("PHY Data Written"));
    }

    async Phy_Reset() {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1C, 1, 0xFF, 2, 0, 0, 0 ]))
        .then(_ => console.log("PHY Data Reset"));
    }

    async Reboot(BOOTSEL = 0) {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1F, BOOTSEL, 0, 0, 1, 0 ]))
        .then(_ => console.log("Reboot Sent"));
    }
}

function GetPhyConfigData() {
    let p = 0;
    let data = new Uint8Array(256);
    let view = new DataView(data.buffer);
    let config = GetPhyConfig();

    if (config.vidpid) {
        data[p++] = PHY_VIDPID;
        data[p++] = 4;
        view.setUint32(p, config.vidpid);
        p += 4;
    }
    if (config.led_gpio) {
        data.set(new Uint8Array([ PHY_LED_GPIO, 1, config.led_gpio ]), p);
        p += 3;
    }
    if (config.led_btness) {
        data.set(new Uint8Array([ PHY_LED_BTNESS, 1, config.led_btness ]), p);
        p += 3;
    }
    if (config.opts) {
        var opt = 0;
        opt |= (config.opts.dimm ? PHY_OPT_DIMM : 0);
        opt |= (config.opts.steady ? PHY_OPT_LED_STEADY : 0);
        opt |= (config.opts.rainbow ? PHY_OPT_LED_RAINBOW : 0);
        data.set(new Uint8Array([ PHY_OPTS, 2, opt >> 8, opt & 255 ]), p);
        p += 4;
    }
    if (config.up_btn) {
        data.set(new Uint8Array([ PHY_UP_BTN, 1, config.up_btn ]), p);
        p += 3;
    }
    if (config.product) {
        var buff = [ ...config.product, '\0' ];
        buff = buff.map(elm => elm.charCodeAt(0));
        data.set(new Uint8Array([ PHY_USB_PRODUCT, buff.length, ...buff ]), p);
        p += buff.length + 2;
    }
    if (config.curve) {
        var curve = (config.curve.secp256k1 ? PHY_CURVE_SECP256K1 : 0);
        data.set(new Uint8Array([ PHY_ENABLED_CURVES, 4, 0, 0, 0, curve ]), p);
        p += 6;
    }
    if (config.driver) {
        data.set(new Uint8Array([ PHY_LED_DRIVER, 1, config.driver ]), p);
        p += 3;
    }
    if (p < 3) {
        throw new Error("Invalid PHY data length");
    }

    data = data.slice(0, p);
    console.log(`PHY Data: ${arrayToHexDump(data)}`);

    return data;
}

async function doRescueCommission(elem) {
    switch (elem.value) {
        case "apply":
            return pk.Rescue_Phy_Write(GetPhyConfigData());
        case "reset":
            return pk.Rescue_Phy_Reset();
        case "reboot":
            return pk.Rescue_Reboot();
        case "bootsel":
            return pk.Rescue_Reboot(true);
        default:
            throw new Error("Invalid commission command");
    }
}

async function doCredentailCommission(elem) {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    var pkeyCredCreateOptions = {
        authenticatorSelection: { authenticatorAttachment: "cross-platform" },
        challenge,
        hints: [ "security-key" ],
        pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
        ],
        rp: { name: "阿皇仔" },
        user: {
            id: new Uint8Array(8),
            name: "+picoCommissionProfile",
            displayName: "阿皇仔"
        }
    };

    if (elem.value == "apply") {
        pkeyCredCreateOptions.user.id = GetPhyConfigData();
    }
    else if (elem.value == "reset") {
        pkeyCredCreateOptions.user.name = "+picoResetProfile";
    }
    else {
        throw new Error("Invalid commission command");
    }

    return navigator.credentials.create({ publicKey: pkeyCredCreateOptions });
}

async function onCommissionClick(elem) {
    return pk.Usable()
    .then(_ => doRescueCommission(elem))
    .catch(err => {
        if (err.message == "USB device not usable") {
            return doCredentailCommission(elem);
        }
        throw err;
    })
    .then(_ => elm_phy_toast.show());
}
