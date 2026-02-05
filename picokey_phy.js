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
        if (this.#key.Select instanceof Rescue) {
            return this.#data;
        }
        const aid = [ 0xA0, 0x58, 0x3F, 0xC1, 0x9B, 0x7E, 0x4F, 0x21 ];
        const apdu = [ 0x00, 0xA4, 0x04, 0x04, aid.length, ...aid, 0x00 ];
        return this.#key.IccPowerOff()
            .then(_ => this.#key.IccPowerOn())
            .then(_ => this.#key.XfrBlock(apdu))
            .then(resp => {
                this.#key.Select = this;
                this.#data = ToBytes(resp);
                Logger(1, "Selected Rescue Applet");
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
        .then(_ => Logger(1, "PHY Data Written"));
    }

    async Phy_Reset() {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1C, 1, 0xFF, 2, 0, 0, 0 ]))
        .then(_ => Logger(1, "PHY Data Reset"));
    }

    async Reboot(BOOTSEL = 0) {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1F, BOOTSEL, 0, 0, 1, 0 ]))
        .then(_ => Logger(1, "Reboot Sent"));
    }

    async GetTime() {
        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1E, 4, 2, 0, 1, 0 ]))
        .then(resp => Date(resp.toUint32(0)))
        .then(date => Logger(1, date))
        .then(_ => Logger(1, "Time Data Read"));
    }

    async SetTime() {
        let time = (Date.now() + 500) / 1000;
        let data = ToBytes(time >>> 0);

        return this.Select()
        .then(_ => this.#key.XfrBlock([ 0x80, 0x1C, 2, 2, 4, ...data, 0 ]))
        .then(_ => Logger(1, "Time Data Sent"));
    }
}

function GetPhyConfig() {
    let config = {};
    let vidpid = String(elm_usb_vidpid.value);
    let gpio = parseInt(elm_led_gpio.value);
    let btness = parseInt(elm_led_btness.value);
    let btness_set = Boolean(elm_led_btness_set.checked);
    let dimm = Boolean(elm_opts_dimm.checked);
    let steady = Boolean(elm_opts_steady.checked);
    let rainbow = Boolean(elm_opts_rainbow.checked);
    let led_opt_set = Boolean(elm_led_options_set.checked);
    let up_btn = parseInt(elm_btn_timeout.value);
    let up_btn_set = Boolean(elm_btn_timeout_set.checked);
    let product = String(elm_usb_product.value);
    let secp256k1 = Boolean(elm_curve_secp256k1.checked);
    let curve_set = Boolean(elm_curve_options_set.checked);
    let driver = parseInt(elm_led_driver.value);

    vidpid = vidpid.replace(':', '');
    if (vidpid.length == 8) {
        config["vidpid"] = Uint8Array.fromHex(vidpid);
    }
    if (gpio >= 0 && gpio <= 29) {
        config["led_gpio"] = gpio;
    }
    if (btness_set && btness >= 0 && btness <= 15) {
        config["led_btness"] = btness;
    }
    if (led_opt_set) {
        config["opts"] = { dimm, steady, rainbow };
    }
    if (up_btn_set && up_btn >= 0 && up_btn <= 60) {
        config["up_btn"] = up_btn;
    }
    if (product) {
        config["product"] = product + '\0';
    }
    if (curve_set) {
        config["curve"] = { secp256k1 };
    }
    if (driver) {
        config["driver"] = driver;
    }

    return config;
}

async function GetPhyConfigData() {
    let p = 0;
    let data = new Uint8Array(256);
    let config = GetPhyConfig();
    Logger(1, "PHY Config:", config);

    if (config.vidpid) {
        data[p++] = PHY_VIDPID;
        data[p++] = 4;
        data.set(config.vidpid, p);
        p += 4;
    }
    if (config.led_gpio != undefined) {
        data.set(ToBytes([ PHY_LED_GPIO, 1, config.led_gpio ]), p);
        p += 3;
    }
    if (config.led_btness != undefined) {
        data.set(ToBytes([ PHY_LED_BTNESS, 1, config.led_btness ]), p);
        p += 3;
    }
    if (config.opts) {
        let opt = 0;
        opt |= (config.opts.dimm ? PHY_OPT_DIMM : 0);
        opt |= (config.opts.steady ? PHY_OPT_LED_STEADY : 0);
        opt |= (config.opts.rainbow ? PHY_OPT_LED_RAINBOW : 0);
        data.set(ToBytes([ PHY_OPTS, 2, opt >> 8, opt & 255 ]), p);
        p += 4;
    }
    if (config.up_btn != undefined) {
        data.set(ToBytes([ PHY_UP_BTN, 1, config.up_btn ]), p);
        p += 3;
    }
    if (config.product) {
        let buff = config.product.toBytes();
        data.set(ToBytes([ PHY_USB_PRODUCT, buff.length, ...buff ]), p);
        p += buff.length + 2;
    }
    if (config.curve != undefined) {
        let curve = (config.curve.secp256k1 ? PHY_CURVE_SECP256K1 : 0);
        data.set(ToBytes([ PHY_ENABLED_CURVES, 4, 0, 0, 0, curve ]), p);
        p += 6;
    }
    if (config.driver) {
        data.set(ToBytes([ PHY_LED_DRIVER, 1, config.driver ]), p);
        p += 3;
    }
    if (p < 3) {
        throw new Error("Invalid PHY data length");
    }

    data = data.slice(0, p);
    Logger(2, "PHY Data:", arrayToHexDump(data));

    return data;
}

async function doRescueCommission(elem) {
    switch (elem.value) {
        case "apply":
            let data = await GetPhyConfigData();
            return pk.Rescue_Phy_Write(data);
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
    const challenge = new Uint8Array(16);
    crypto.getRandomValues(challenge);

    let pkeyCredCreateOptions = {
        authenticatorSelection: {
            authenticatorAttachment: "cross-platform"
        },
        challenge,
        hints: [ "security-key" ],
        pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
        ],
        rp: { name: "阿皇仔" },
        user: {
            id: ToBytes("picokeys"),
            name: "+picoCommissionProfile",
            displayName: "阿皇仔"
        }
    };

    if (elem.value == "apply") {
        pkeyCredCreateOptions.user.id = await GetPhyConfigData();
    }
    else if (elem.value == "reset") {
        pkeyCredCreateOptions.user.name = "+picoResetProfile";
    }
    else {
        throw new Error("Invalid commission command");
    }

    Logger(2, "Create Credentials Options:", pkeyCredCreateOptions);
    return navigator.credentials.create({ publicKey: pkeyCredCreateOptions });
}

async function onCommissionClick(elem) {
    return pk?.Usable()
    .then(_ => doRescueCommission(elem))
    .catch(e => {
        if (e.message == "USB device not usable") {
            return doCredentailCommission(elem);
        }
        throw e;
    })
    .then(_ => alertMessage("Commission Succeeded"))
    .catch(e => alertMessage(e.message, true));
}

function showInputRangeValue(event) {
    let elem = document.querySelector(`#${event.target.id}_val`);
    elem && (elem.textContent = event.target.value);
}

// Disable custom VID/PID input
elm_usb_vendor.addEventListener("change", event => {
    elm_usb_vidpid.value = event.target.value;
    elm_usb_vidpid.disabled = !(!event.target.value);
});

elm_phy_rangelist.forEach(elm => {
    elm.addEventListener("input", showInputRangeValue);
});
